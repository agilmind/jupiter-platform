# Guía de Despliegue Minimal

Esta guía explica cómo desplegar y mantener la configuración **Minimal** (básica) de jupiter en un VPS.

## Características de la configuración Minimal

La configuración Minimal ofrece:

- Estructura básica pero completa para el proyecto
- PostgreSQL como base de datos
- RabbitMQ como broker de mensajes
- Nginx como punto de entrada
- SSL/HTTPS con Let's Encrypt
- Acceso a API a través de rutas amigables (ej: jupiter.ar/api)

Esta configuración es ideal para:

- Entornos de desarrollo
- Proyectos pequeños
- Servidores con recursos limitados
- Pruebas iniciales

## Requisitos

- Un VPS con acceso SSH (configurado con usuario 'deploy')
- Dominio configurado apuntando al VPS (jupiter.ar)
- Docker y Docker Compose instalados en el VPS
- Nginx instalado en el VPS

## Despliegue inicial

Para realizar el primer despliegue de la configuración Minimal:

1. **Generar el proyecto**:

   ```bash
   nx g project:create jupiter
   ```

2. **Ejecutar el script de despliegue**:

   ```bash
   bash ./apps/jupiter/vps-infrastructure/deployment/scripts/minimal/deploy-minimal.sh
   ```

3. **Seguir las instrucciones en pantalla**:
   - El script solicitará confirmación para continuar
   - Se mostrarán los pasos que se están ejecutando
   - Al finalizar, se mostrarán las URLs de acceso

## Actualización

Para actualizar una instalación Minimal existente:

1. **Generar el proyecto con los cambios**:

   ```bash
   nx g project:create jupiter
   ```

2. **Ejecutar el script de actualización**:
   ```bash
   bash ./apps/jupiter/vps-infrastructure/deployment/scripts/minimal/update-minimal.sh
   ```

Este método preserva:

- Datos existentes en la base de datos
- Configuraciones personalizadas (.env)
- Mensajes en RabbitMQ

## Respaldo y restauración

### Crear respaldo

```bash
bash ./apps/jupiter/vps-infrastructure/deployment/scripts/utils/backup-vps.sh
```

Este script:

- Crea un respaldo completo de la configuración
- Realiza un dump de la base de datos
- Extrae configuración de RabbitMQ
- Genera un archivo comprimido con todo el respaldo

### Restaurar respaldo

```bash
bash ./apps/jupiter/vps-infrastructure/deployment/scripts/utils/restore-vps.sh ruta/al/respaldo
```

## Estructura en el VPS

Después del despliegue, la estructura en el VPS será:

```
/opt/jupiter/
├── docker-compose.yml     # Configuración de servicios
├── .env                   # Variables de entorno
├── nginx/                 # Configuración de Nginx
│   └── conf.d/            # Archivos de configuración
└── setup-ssl.sh           # Script para configurar SSL
```

## Acceso a los servicios

Después del despliegue, podrás acceder a los servicios:

- **Frontend**: https://jupiter.ar
- **API**: https://jupiter.ar/api
- **RabbitMQ Admin**: https://jupiter.ar/rabbitmq

## Migrar a Hybrid

Si necesitas añadir monitoreo a una instalación Minimal existente:

```bash
bash ./apps/jupiter/vps-infrastructure/scripts/monitoring/setup-monitoring.sh
```

Este script:

- Añade Prometheus, Grafana y AlertManager
- Configura Nginx para los subdominios
- Guía en la configuración post-instalación

## Solución de problemas comunes

### Servicio no disponible

```bash
# Verificar estado de los servicios
ssh deploy@jupiter.ar "cd /opt/jupiter && docker compose ps"

# Ver logs del servicio específico
ssh deploy@jupiter.ar "cd /opt/jupiter && docker compose logs app-server"
```

### Problemas con la base de datos

```bash
# Conectar a la base de datos
ssh deploy@jupiter.ar "cd /opt/jupiter && docker compose exec postgres psql -U postgres jupiter"
```

### Problemas con Nginx

```bash
# Verificar configuración de Nginx
ssh deploy@jupiter.ar "sudo nginx -t"

# Reiniciar Nginx
ssh deploy@jupiter.ar "sudo systemctl restart nginx"
```

## Eliminación completa (solo para pruebas)

Si necesitas eliminar completamente la instalación (¡SOLO PARA PRUEBAS!):

```bash
bash ./apps/jupiter/vps-infrastructure/deployment/scripts/utils/reset-vps.sh
```

⚠️ **ADVERTENCIA**: Este script eliminará TODOS los datos y configuraciones.
