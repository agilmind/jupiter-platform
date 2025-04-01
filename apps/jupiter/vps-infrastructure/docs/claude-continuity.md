# Guía de continuidad para Claude - Infraestructura VPS

## Estado actual y problemas identificados

Estamos implementando una configuración Hybrid que incluye monitoreo (Prometheus/Grafana/AlertManager). Hemos realizado una limpieza completa del sistema y estamos intentando una instalación limpia, pero hemos encontrado un nuevo problema:

```
[emerg] 161625#161625: host not found in upstream "jupiter-alertmanager" in /etc/nginx/conf.d/alertmanager.conf:26
nginx: configuration file /etc/nginx/nginx.conf test failed
```

Este error ocurre porque la configuración de Nginx está tratando de acceder a contenedores que aún no existen. Es un problema de secuencia: necesitamos iniciar los contenedores ANTES de configurar Nginx.

## Identificación de problemas anteriores

1. **Referencias a archivos .template**:

   - Los scripts generados no deben hacer referencia a los archivos con extensión `.template`
   - ✅ Corregido en todos los archivos

2. **Conflictos de configuración SSL**:

   - Directivas SSL duplicadas entre nginx.conf global y ssl-params.conf
   - ✅ Resuelto eliminando las configuraciones antiguas durante la limpieza

3. **Orden de operaciones incorrecto**:
   - Nginx necesita que los contenedores Docker estén en ejecución para validar los hosts upstream
   - ❌ Nuevo problema por resolver

## Nueva secuencia propuesta

La secuencia correcta debería ser:

1. Iniciar contenedores de la aplicación principal
2. Iniciar contenedores de monitoreo
3. Configurar y recargar Nginx
4. Configurar SSL
5. Configurar autenticación

## Estructura actual

```
vps-infrastructure/
├── common/                                  # Componentes compartidos
│   ├── monitoring/
│   │   ├── alertmanager/
│   │   ├── grafana/
│   │   └── prometheus/
│   └── docker-compose.monitoring.yml
├── deployment/
│   └── scripts/
│       ├── minimal/
│       │   ├── deploy-minimal.sh
│       │   └── update-minimal.sh
│       ├── hybrid/
│       │   ├── deploy-hybrid.sh
│       │   └── update-hybrid.sh
│       └── utils/
│           ├── reset-vps.sh
│           ├── backup-vps.sh
│           └── restore-vps.sh
├── scripts/
│   ├── monitoring/
│   │   ├── setup-monitoring.sh
│   │   ├── setup-monitoring-auth.sh
│   │   ├── setup-monitoring-prerequisites.sh
│   │   └── setup-monitoring-mode.sh
```

## Archivos de configuración Nginx actuales

```
./nginx/conf.d/alertmanager.conf
./nginx/conf.d/grafana.conf
./nginx/conf.d/prometheus.conf
```

## Próximas acciones

1. **Modificar la secuencia de despliegue**:

   - Iniciar servicios principales y de monitoreo primero
   - Luego configurar Nginx y SSL

2. **Enfoque alternativo a considerar**:

   - Modificar archivos de configuración Nginx para usar direcciones IP o localhost con puertos mapeados
   - Esto permitiría configurar Nginx antes de iniciar los contenedores

3. **Documentación de la solución final**:
   - Actualizar guías y scripts con la secuencia correcta
   - Asegurar que los scripts funcionan correctamente en orden

## Notas importantes

- No usar NUNCA referencias a archivos .template en scripts y documentación
- Los nombres de los servicios Docker deben coincidir exactamente con los usados en las configuraciones Nginx
- Probar cada paso individualmente para asegurar que funciona
- Documentar claramente la secuencia correcta para futuros despliegues

## Muy Importante

No quiero ninguna solución rápida en el server.
Quiero modificar los templates, generar, y ejecutar scripts.
Ninguna línea de comando suelta, todo en su correspondiente script.
Si es necesario correr un script en el server, se escribe su template, se copia al server y se ejecuto manualmente.
Si el script es peligroso porque puede ser dañino si se corre en otro momento, debe advertirlo claramente y pedir escribir palabar para que no se ejecute por accidente y su nombre debe ser claro.

## Problemas identificados

### 1. Problema con el orden de ejecución

- El error `host not found in upstream "jupiter-alertmanager" in /etc/nginx/conf.d/alertmanager.conf` ocurre porque la configuración de Nginx intenta acceder a contenedores que aún no existen
- Es necesario iniciar los contenedores ANTES de configurar Nginx

### 2. Problema con las rutas de construcción en docker-compose.prod.yml

- El error `lstat /apps: no such file or directory` ocurre porque el archivo `docker-compose.prod.yml` generado intenta construir imágenes usando rutas relativas (`build: context: ../../`) que tienen sentido durante el desarrollo local pero no en el servidor
- La solución es modificar la plantilla `docker-compose.prod.yml.template` para que use directamente las imágenes preconstruidas (`image: jupiter-app-server:prod`) en lugar de intentar construirlas

## Soluciones implementadas

### 1. Uso de imágenes preconstruidas en lugar de construir en el servidor

- Se modificó `docker-compose.prod.yml.template` para usar directamente las imágenes Docker precargadas
- Las secciones `build` fueron reemplazadas por `image` para los servicios de aplicación

### 2. Script de instalación secuencial

- Se creó un nuevo script `install-hybrid-first-time.sh.template` que ejecuta los pasos en el orden correcto
- Se modificó `deploy-hybrid.sh.template` para transferir y configurar este script en el servidor

### 3. Secuencia correcta de operaciones

1. Cargar imágenes Docker
2. Iniciar servicios principales
3. Iniciar servicios de monitoreo
4. Configurar Nginx (cuando ya existen los contenedores)
5. Configurar SSL y autenticación

## Recordatorios importantes para el desarrollo futuro

1. Los cambios deben realizarse siempre en los archivos `.template` del generador, nunca como soluciones provisionales en el servidor
2. Cualquier solución debe ser repetible y no requerir intervención manual
3. Verificar que las configuraciones de Docker Compose generadas sean compatibles con el entorno de producción
4. Asegurarse de que las imágenes Docker estén preconstruidas antes de intentar usarlas en el servidor

## Nuevos patrones implementados

1. Usar imágenes en lugar de construcción en producción:

   ```yaml
   # Desarrollo (local-prod):
   build:
     context: ../../
     dockerfile: apps/jupiter/app-server/Dockerfile

   # Producción (VPS):
   image: jupiter-app-server:prod
   ```

2. Secuencia de instalación en el servidor:
   ```
   1. Cargar imágenes → 2. Iniciar servicios → 3. Configurar Nginx → 4. Finalizar configuración
   ```
