#!/bin/bash
# snapshot-environment.sh
# Script para capturar el estado actual de tu entorno local-prod y empaquetarlo para compartir

set -e  # Exit on error

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PROJECT_NAME="jupiter"
VERSION=$(date +"%Y%m%d")
OUTPUT_DIR="./portable-snapshot"
COMPOSE_FILE="docker-compose.local-prod.yml"

echo -e "${BLUE}==========================================================${NC}"
echo -e "${BLUE}Capturando estado actual del entorno local-prod de $PROJECT_NAME${NC}"
echo -e "${BLUE}==========================================================${NC}"

# Verificar que los contenedores estén en ejecución
CONTAINER_COUNT=$(docker compose -f $COMPOSE_FILE ps -q | wc -l)
if [ "$CONTAINER_COUNT" -eq 0 ]; then
    echo -e "${RED}Error: No hay contenedores en ejecución. Inicia el entorno primero.${NC}"
    echo -e "${YELLOW}Ejecuta: docker compose -f $COMPOSE_FILE up -d${NC}"
    exit 1
fi

echo -e "${YELLOW}Encontrados $CONTAINER_COUNT contenedores en ejecución.${NC}"

# Crear directorio para el snapshot
mkdir -p "$OUTPUT_DIR"

# Obtener la lista de servicios
SERVICES=$(docker compose -f $COMPOSE_FILE config --services)

# Crear imágenes a partir del estado actual de los contenedores
echo -e "${YELLOW}Creando imágenes a partir de los contenedores actuales...${NC}"
IMAGES=()

for SERVICE in $SERVICES; do
    CONTAINER_NAME="${PROJECT_NAME}-${SERVICE}-local-prod"

    # Ajuste para pgbouncer que tiene un nombre diferente
    if [ "$SERVICE" = "pgbouncer" ]; then
        CONTAINER_NAME="${PROJECT_NAME}-pgbouncer-local"
    fi

    # Ajuste para rabbitmq que tiene un nombre diferente
    if [ "$SERVICE" = "rabbitmq" ]; then
        CONTAINER_NAME="${PROJECT_NAME}-rabbitmq-local"
    fi

    IMAGE_NAME="${PROJECT_NAME}/${SERVICE}-snapshot:${VERSION}"

    echo -e "${YELLOW}Creando snapshot de $SERVICE...${NC}"

    # Verificar si el contenedor existe
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        # Crear imagen del contenedor actual
        echo -e "  - Capturando estado de $CONTAINER_NAME -> $IMAGE_NAME"
        docker commit $CONTAINER_NAME $IMAGE_NAME
        IMAGES+=("$IMAGE_NAME")
    else
        echo -e "${RED}  - Contenedor $CONTAINER_NAME no encontrado, saltando...${NC}"
    fi
done

# Crear un nuevo docker-compose.yml que use las imágenes con el estado capturado
echo -e "${YELLOW}Generando docker-compose para el snapshot...${NC}"
cat > "$OUTPUT_DIR/docker-compose.yml" << EOF
version: '3.8'

# Docker Compose con imágenes que contienen el estado capturado
services:
EOF

# Añadir cada servicio al docker-compose.yml
for SERVICE in $SERVICES; do
    IMAGE_NAME="${PROJECT_NAME}/${SERVICE}-snapshot:${VERSION}"

    # Verificar si la imagen existe
    if ! docker image inspect $IMAGE_NAME >/dev/null 2>&1; then
        echo -e "${RED}  - Imagen $IMAGE_NAME no encontrada, saltando...${NC}"
        continue
    fi

    # Ajustar puertos para evitar conflictos con entorno local
    PORT_MAPPING=""
    EXTRA_PORTS=""
    DEPENDS=""
    ENV_VARS=""

    case "$SERVICE" in
        "app-server")
            PORT_MAPPING="4001:4001"
            DEPENDS="pgbouncer rabbitmq"
            ENV_VARS=$(cat << EOENV
      - NODE_ENV=production
      - PORT=4001
      - HOST=0.0.0.0
      - DATABASE_URL=postgresql://postgres:postgres@pgbouncer:6432/jupiter
      - RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
      - RABBITMQ_HOST=rabbitmq
      - SERVICE_TYPE=app-server
      - SERVICE_NAME=app-server
EOENV
            )
            ;;
        "web-app")
            PORT_MAPPING="8081:80"
            DEPENDS="app-server"
            ENV_VARS=$(cat << EOENV
      - SERVER_PORT=4001
      - APP_SERVER_HOST=app-server
      - APP_SERVER_PORT=4001
      - SERVICE_TYPE=web-app
      - SERVICE_NAME=web-app
EOENV
            )
            ;;
        "worker-sample")
            DEPENDS="pgbouncer rabbitmq app-server"
            ENV_VARS=$(cat << EOENV
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:postgres@pgbouncer:6432/jupiter
      - RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
      - RABBITMQ_HOST=rabbitmq
      - APP_SERVER_HOST=app-server
      - APP_SERVER_PORT=4001
      - SERVICE_TYPE=worker
      - SERVICE_NAME=worker-sample
EOENV
            )
            ;;
        "postgres")
            # Sin mapeo de puerto para mayor seguridad
            ENV_VARS=$(cat << EOENV
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=jupiter
EOENV
            )
            ;;
        "pgbouncer")
            PORT_MAPPING="6432:6432"
            DEPENDS="postgres"
            ENV_VARS=$(cat << EOENV
      - DB_USER=postgres
      - DB_PASSWORD=postgres
      - DB_HOST=postgres
      - DB_NAME=jupiter
      - POOL_MODE=transaction
      - MAX_CLIENT_CONN=100
      - DEFAULT_POOL_SIZE=20
EOENV
            )
            ;;
        "rabbitmq")
            PORT_MAPPING="15673:15672"
            EXTRA_PORTS="5672:5672"
            ENV_VARS=$(cat << EOENV
      - RABBITMQ_DEFAULT_USER=guest
      - RABBITMQ_DEFAULT_PASS=guest
EOENV
            )
            ;;
    esac

    # Escribir la configuración del servicio
    cat >> "$OUTPUT_DIR/docker-compose.yml" << EOF
  $SERVICE:
    image: $IMAGE_NAME
    container_name: ${PROJECT_NAME}-${SERVICE}-snapshot
EOF

    # Añadir environment si existe
    if [ ! -z "$ENV_VARS" ]; then
        cat >> "$OUTPUT_DIR/docker-compose.yml" << EOF
    environment:
$ENV_VARS
EOF
    fi

    # Añadir port mapping si existe
    if [ ! -z "$PORT_MAPPING" ]; then
        cat >> "$OUTPUT_DIR/docker-compose.yml" << EOF
    ports:
      - "$PORT_MAPPING"
EOF
        # Añadir puertos adicionales si existen
        if [ ! -z "$EXTRA_PORTS" ]; then
            cat >> "$OUTPUT_DIR/docker-compose.yml" << EOF
      - "$EXTRA_PORTS"
EOF
        fi
    fi

    cat >> "$OUTPUT_DIR/docker-compose.yml" << EOF
    networks:
      - snapshot_network
EOF

    # Añadir dependencias si existen
    if [ ! -z "$DEPENDS" ]; then
        cat >> "$OUTPUT_DIR/docker-compose.yml" << EOF
    depends_on:
EOF
        for DEP in $DEPENDS; do
            cat >> "$OUTPUT_DIR/docker-compose.yml" << EOF
      - $DEP
EOF
        done
    fi
done

# Añadir la sección de networks
cat >> "$OUTPUT_DIR/docker-compose.yml" << EOF

networks:
  snapshot_network:
    driver: bridge
EOF

# Crear archivo .env con variables predeterminadas
cat > "$OUTPUT_DIR/.env" << EOF
# Variables de entorno para el snapshot
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=jupiter
RABBITMQ_DEFAULT_USER=guest
RABBITMQ_DEFAULT_PASS=guest
EOF

# Crear script de inicio
cat > "$OUTPUT_DIR/start-snapshot.sh" << 'EOF'
#!/bin/bash
# Script para iniciar el entorno de snapshot

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}==========================================================${NC}"
echo -e "${BLUE}Iniciando entorno snapshot${NC}"
echo -e "${BLUE}==========================================================${NC}"

# Verificar si hay un archivo de imágenes para importar
if [ -f "snapshot-images.tar" ]; then
  echo -e "${YELLOW}Encontrado archivo de imágenes. Importando...${NC}"
  docker load -i snapshot-images.tar
fi

# Iniciar el entorno
docker compose up -d

echo -e "${GREEN}==========================================================${NC}"
echo -e "${GREEN}Entorno iniciado correctamente${NC}"
echo -e "${GREEN}==========================================================${NC}"
echo ""
echo "Servicios disponibles:"
echo "- Frontend: http://localhost:8081"
echo "- API: http://localhost:4001"
echo "- RabbitMQ Admin: http://localhost:15673 (guest/guest)"
echo ""
echo "Para detener el entorno: ./stop-snapshot.sh"
EOF

# Crear script de detención
cat > "$OUTPUT_DIR/stop-snapshot.sh" << 'EOF'
#!/bin/bash
# Script para detener el entorno de snapshot

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Deteniendo entorno de snapshot...${NC}"
docker compose down

echo -e "${GREEN}Entorno detenido correctamente${NC}"
EOF

# Crear script para exportar imágenes
cat > "$OUTPUT_DIR/export-images.sh" << EOF
#!/bin/bash
# Script para exportar imágenes Docker

set -e

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PROJECT_NAME="$PROJECT_NAME"
VERSION="$VERSION"
IMAGES=(
EOF

# Añadir las imágenes al script de exportación
for IMAGE in "${IMAGES[@]}"; do
    echo "  \"$IMAGE\"" >> "$OUTPUT_DIR/export-images.sh"
done

cat >> "$OUTPUT_DIR/export-images.sh" << 'EOF'
)

echo -e "${BLUE}==========================================================${NC}"
echo -e "${BLUE}Exportando imágenes snapshots${NC}"
echo -e "${BLUE}==========================================================${NC}"

OUTPUT_FILE="snapshot-images.tar"

echo -e "${YELLOW}Exportando imágenes a $OUTPUT_FILE...${NC}"
docker save ${IMAGES[@]} -o "$OUTPUT_FILE"

echo -e "${GREEN}Imágenes exportadas exitosamente.${NC}"
echo -e "Tamaño del archivo: $(du -h "$OUTPUT_FILE" | cut -f1)"
echo ""
echo "Para compartir este snapshot:"
echo "1. Comprime esta carpeta completa con el archivo de imágenes"
echo "2. Comparte el archivo .zip resultante"
echo ""
echo "El receptor solo necesita descomprimir y ejecutar ./start-snapshot.sh"
EOF

# Crear README con instrucciones
cat > "$OUTPUT_DIR/README.md" << 'EOF'
# Snapshot del entorno

Este es un snapshot del entorno de trabajo para el proyecto. Contiene el estado exacto de todos los servicios y datos en el momento de la captura.

## Requisitos

- Docker y Docker Compose instalados
- Puertos disponibles: 4001, 8081, 15673, 6432, 5672

## Instrucciones de uso

### Con el archivo de imágenes incluido

Si el snapshot incluye el archivo `snapshot-images.tar`:

1. Descomprime el archivo ZIP
2. Ejecuta los siguientes comandos:

```bash
chmod +x *.sh
./start-snapshot.sh
```

### Sin el archivo de imágenes

Si necesitas generar el archivo de imágenes:

1. Ejecuta el script de exportación:

```bash
chmod +x *.sh
./export-images.sh
```

2. Luego inicia el entorno:

```bash
./start-snapshot.sh
```

## Acceso a los servicios

- Frontend: http://localhost:8081
- API: http://localhost:4001
- RabbitMQ Admin: http://localhost:15673 (usuario: guest, contraseña: guest)

## Bases de datos

- PostgreSQL (a través de pgBouncer): localhost:6432
  - Usuario: postgres
  - Contraseña: postgres
  - Base de datos: el nombre del proyecto

## Para detener el entorno

```bash
./stop-snapshot.sh
```
EOF

# Hacer ejecutables los scripts
chmod +x "$OUTPUT_DIR/start-snapshot.sh" "$OUTPUT_DIR/stop-snapshot.sh" "$OUTPUT_DIR/export-images.sh"

# Preguntar si exportar imágenes ahora
read -p "¿Deseas exportar las imágenes ahora? (y/n): " EXPORT_IMAGES
if [[ $EXPORT_IMAGES == "y" || $EXPORT_IMAGES == "Y" ]]; then
  cd "$OUTPUT_DIR" && ./export-images.sh
  cd ..

  # Calcular tamaño total
  TOTAL_SIZE=$(du -sh "$OUTPUT_DIR" | cut -f1)
  echo -e "${YELLOW}Tamaño total del snapshot: $TOTAL_SIZE${NC}"
else
  echo -e "${YELLOW}Puedes exportar las imágenes más tarde con:${NC}"
  echo -e "cd $OUTPUT_DIR && ./export-images.sh"
fi

echo -e "${GREEN}==========================================================${NC}"
echo -e "${GREEN}Snapshot creado en $OUTPUT_DIR${NC}"
echo -e "${GREEN}==========================================================${NC}"
echo ""
echo "Para compartir este snapshot:"
echo "1. Exporta las imágenes: cd $OUTPUT_DIR && ./export-images.sh"
echo "2. Comprime la carpeta: zip -r $PROJECT_NAME-snapshot.zip $OUTPUT_DIR"
echo "3. Comparte el archivo zip"
echo ""
echo "La persona que reciba el archivo solo necesita:"
echo "1. Descomprimir el archivo"
echo "2. Ejecutar ./start-snapshot.sh"
