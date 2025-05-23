#!/bin/sh
# ===========================================================================
# Script unificado para iniciar cualquier tipo de servicio - compatible con Alpine
# Detecta automáticamente el tipo de servicio y configura según corresponda
# ===========================================================================

# Cargar script base de servicio
if [ -f "/usr/local/bin/service-base.sh" ]; then
  . "/usr/local/bin/service-base.sh"
else
  echo "ERROR: service-base.sh no encontrado"
  exit 1
fi

# Detectar tipo de servicio y nombre
SERVICE_TYPE=$(detect_service_type)
SERVICE_NAME=$(get_service_name)

# Mostrar información del entorno
show_environment "INICIANDO SERVICIO: $SERVICE_TYPE ($SERVICE_NAME)"

# Configurar variables predeterminadas comunes
export NODE_ENV="${NODE_ENV:-production}"
export HOST="${HOST:-0.0.0.0}"
export RABBITMQ_HOST="${RABBITMQ_HOST:-jupiter-rabbitmq}"
export RABBITMQ_PORT="${RABBITMQ_PORT:-5672}"
export RABBITMQ_MGMT_PORT="${RABBITMQ_MGMT_PORT:-15672}"
export RABBITMQ_URL="${RABBITMQ_URL:-amqp://guest:guest@$RABBITMQ_HOST:$RABBITMQ_PORT}"
export APP_SERVER_HOST="${APP_SERVER_HOST:-jupiter-app-server}"
export APP_SERVER_PORT="${APP_SERVER_PORT:-4000}"

# Acciones específicas según el tipo de servicio
case $SERVICE_TYPE in
  "web-app")
    log_info "Iniciando web-app: $SERVICE_NAME"

    # Configurar variables específicas
    export SERVER_PORT="${SERVER_PORT:-4000}"

    # Verificar variables requeridas
    check_required_vars "APP_SERVER_HOST" "APP_SERVER_PORT" || log_warning "Algunas variables requeridas no están definidas"

    # Esperar a que app-server esté disponible
    wait_for_service "App Server" "$APP_SERVER_HOST" "$APP_SERVER_PORT" "${MAX_RETRIES:-30}" "/health"

    # Generar la configuración de Nginx
    log_info "Aplicando variables de entorno a la configuración de Nginx..."
    envsubst '$SERVER_PORT $APP_SERVER_HOST $APP_SERVER_PORT' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

    # Verificar configuración
    log_info "Verificando configuración de Nginx..."
    nginx -t || log_error "Error en la configuración de Nginx"

    # Iniciar nginx
    log_success "Configuración correcta. Iniciando Nginx..."
    exec nginx -g 'daemon off;'
    ;;

  "worker")
    log_info "Iniciando worker: $SERVICE_NAME"

    # Verificar variables requeridas
    check_required_vars "NODE_ENV" "RABBITMQ_URL" || log_warning "Algunas variables requeridas no están definidas"

    # Localizar archivo principal
    if [ "$NODE_ENV" = "development" ]; then
      log_info "Modo de desarrollo detectado"
      JS_PATH="/app/apps/jupiter/${SERVICE_NAME}/src/main.ts"

      # Verificar existencia del archivo main.ts
      if [ ! -f "$JS_PATH" ]; then
        log_error "Archivo principal no encontrado: $JS_PATH"
        exit 1
      fi

      # Esperar a que RabbitMQ esté disponible
      wait_for_service "RabbitMQ" "$RABBITMQ_HOST" "$RABBITMQ_MGMT_PORT" 30 "/"

      # Esperar a que app-server esté disponible
      wait_for_service "App Server" "$APP_SERVER_HOST" "$APP_SERVER_PORT" 30 "/health"

      # Generar esquema Prisma si es necesario
      if [ -f "/app/apps/jupiter/${SERVICE_NAME}/prisma/schema.prisma" ]; then
        log_info "Generando esquema Prisma"
        cd /app/apps/jupiter/${SERVICE_NAME} && npx prisma generate
      fi

      log_info "Iniciando worker en modo desarrollo"
      log_info "Ejecutando: npx ts-node-dev --inspect=0.0.0.0:9230 --transpile-only --no-notify --respawn $JS_PATH"
      cd /app/apps/jupiter/${SERVICE_NAME}
      exec npx ts-node-dev --inspect=0.0.0.0:9230 --transpile-only --no-notify --respawn $JS_PATH
    else
      log_info "Modo de producción detectado"

      # Buscar el archivo, con varias estrategias

      # 1. Verificar primero si hay una ruta específica para este worker
      WORKER_VAR_NAME="WORKER_JS_PATH_${SERVICE_NAME}"
      # Reemplazar guiones por guiones bajos en el nombre de la variable
      WORKER_VAR_NAME=$(echo "$WORKER_VAR_NAME" | tr '-' '_')

      # Intentar obtener el valor
      WORKER_PATH_VALUE=$(eval echo \$${WORKER_VAR_NAME} 2>/dev/null || echo "")

      log_info "Buscando ruta específica para el worker: $WORKER_VAR_NAME"

      # 2. Si no hay ruta específica, intentar con WORKER_JS_PATH
      JS_PATH=""
      if [ -n "$WORKER_PATH_VALUE" ] && [ -f "$WORKER_PATH_VALUE" ]; then
        JS_PATH="$WORKER_PATH_VALUE"
        log_info "Usando ruta específica del worker: $JS_PATH"
      elif [ -n "$WORKER_JS_PATH" ] && [ -f "$WORKER_JS_PATH" ]; then
        # Verificar que la variable existe Y que el archivo existe
        JS_PATH="$WORKER_JS_PATH"
        log_info "Usando variable WORKER_JS_PATH: $JS_PATH"
      else
        # 3. Estrategia de búsqueda automática
        log_info "Buscando main.js en las ubicaciones posibles..."

        # Buscar en ubicaciones específicas una por una (sin usar arrays)
        if [ -f "/app/worker/apps/jupiter/${SERVICE_NAME}/src/main.js" ]; then
          JS_PATH="/app/worker/apps/jupiter/${SERVICE_NAME}/src/main.js"
          log_info "Encontrado archivo principal en: $JS_PATH"
        elif [ -f "/app/worker/apps/jupiter/${SERVICE_NAME}/dist/main.js" ]; then
          JS_PATH="/app/worker/apps/jupiter/${SERVICE_NAME}/dist/main.js"
          log_info "Encontrado archivo principal en: $JS_PATH"
        elif [ -f "/app/worker/src/main.js" ]; then
          JS_PATH="/app/worker/src/main.js"
          log_info "Encontrado archivo principal en: $JS_PATH"
        else
          # Si no se encuentra en las ubicaciones predefinidas, buscar en todo /app/worker
          log_info "Buscando main.js en todo /app/worker..."
          FOUND_JS=$(find /app/worker -name "main.js" | head -n 1)

          if [ -n "$FOUND_JS" ]; then
            JS_PATH="$FOUND_JS"
            log_info "Encontrado archivo principal en: $JS_PATH"
          else
            log_error "No se pudo encontrar main.js en ninguna ubicación"
            log_info "Contenido de /app/worker:"
            find /app/worker -type f | sort
            exit 1
          fi
        fi
      fi

      # Verificar explícitamente que el archivo existe
      if [ ! -f "$JS_PATH" ]; then
        log_error "El archivo no existe: $JS_PATH"
        log_info "Directorios disponibles:"
        find /app -maxdepth 3 -type d | sort
        exit 1
      fi

      # Esperar a que RabbitMQ esté disponible
      wait_for_service "RabbitMQ" "$RABBITMQ_HOST" "$RABBITMQ_MGMT_PORT" 30 "/"

      # Esperar a que app-server esté disponible
      wait_for_service "App Server" "$APP_SERVER_HOST" "$APP_SERVER_PORT" 30 "/health"

      log_info "Iniciando worker en modo producción"
      log_info "Ejecutando: node $JS_PATH"
      exec node "$JS_PATH"
    fi
    ;;

  "app-server")
    log_info "Iniciando app-server: $SERVICE_NAME"

    # Configurar variables específicas
    export PORT="${PORT:-4000}"

    # Verificar variables requeridas
    check_required_vars "NODE_ENV" "HOST" "PORT" || log_warning "Algunas variables requeridas no están definidas"

    # Localizar archivo principal
    if [ "$NODE_ENV" = "development" ]; then
      log_info "Modo de desarrollo detectado"
      JS_PATH="/app/apps/jupiter/${SERVICE_NAME}/src/main.ts"

      # Verificar existencia del archivo main.ts
      if [ ! -f "$JS_PATH" ]; then
        log_error "Archivo principal no encontrado: $JS_PATH"
        exit 1
      fi

      # Esperar a que RabbitMQ esté disponible
      wait_for_service "RabbitMQ" "$RABBITMQ_HOST" "$RABBITMQ_MGMT_PORT" 30 "/"

      # Generar esquema Prisma si es necesario
      if [ -f "/app/apps/jupiter/${SERVICE_NAME}/prisma/schema.prisma" ]; then
        log_info "Generando esquema Prisma"
        cd /app/apps/jupiter/${SERVICE_NAME} && npx prisma generate
      fi

      log_info "Iniciando app-server en modo desarrollo"
      log_info "Ejecutando: npx ts-node-dev --inspect=0.0.0.0:9229 --transpile-only --no-notify --respawn $JS_PATH"
      cd /app/apps/jupiter/${SERVICE_NAME}
      exec npx ts-node-dev --inspect=0.0.0.0:9229 --transpile-only --no-notify --respawn $JS_PATH
    else
      log_info "Modo de producción detectado"

      # Determinar la ruta del archivo JS
      if [ -n "$SERVER_JS_PATH" ]; then
        # Usar la ruta proporcionada en la variable de entorno
        JS_PATH="$SERVER_JS_PATH"
        log_info "Usando ruta configurada: $JS_PATH"
      else
        # Buscar el archivo
        log_info "Buscando main.js en /app/server..."
        JS_PATH=$(find /app/server -name "main.js" | head -n 1)

        if [ -z "$JS_PATH" ]; then
          log_error "No se pudo encontrar main.js en /app/server"
          exit 1
        fi

        log_info "Archivo main.js encontrado en: $JS_PATH"
      fi

      # Verificar que el archivo existe
      if [ ! -f "$JS_PATH" ]; then
        log_error "El archivo no existe: $JS_PATH"
        exit 1
      fi

      # Esperar a que RabbitMQ esté disponible
      wait_for_service "RabbitMQ" "$RABBITMQ_HOST" "$RABBITMQ_MGMT_PORT" 30 "/"

      log_info "Iniciando app-server en modo producción"
      log_info "Ejecutando: node $JS_PATH"
      exec node "$JS_PATH"
    fi
    ;;

  *)
    log_warning "Tipo de servicio desconocido o no especificado: $SERVICE_TYPE"
    log_info "Intentando ejecutar como servicio genérico..."

    # Para servicios genéricos, intentar encontrar un script start.sh o ejecutar el comando predeterminado
    if [ -f "./start.sh" ]; then
      log_info "Ejecutando script start.sh local"
      exec ./start.sh
    elif [ -n "$START_COMMAND" ]; then
      log_info "Ejecutando comando configurado: $START_COMMAND"
      exec $START_COMMAND
    else
      log_error "No se pudo determinar cómo iniciar este servicio"
      exit 1
    fi
    ;;
esac
