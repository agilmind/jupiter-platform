# Guía de Despliegue Hybrid

Esta guía explica cómo desplegar y mantener la configuración **Hybrid** (con monitoreo) de jupiter en un VPS.

## Características de la configuración Hybrid

La configuración Hybrid incluye:

- Todo lo de la configuración Minimal
- Sistema de monitoreo completo:
  - Prometheus para recolección de métricas
  - Grafana para visualización de métricas
  - AlertManager para gestión de alertas
  - Exporters para PostgreSQL, RabbitMQ y Node
- Acceso a través de subdominios seguros
- Modos de operación configurable (ligero/completo)

Esta configuración es ideal para:

- Entornos de producción de tamaño mediano
- Proyectos que requieren monitoreo avanzado
- Observabilidad de la infraestructura

## Requisitos

- Un VPS con acceso SSH (configurado con usuario 'deploy')
- Dominio configurado apuntando al VPS (jupiter.ar)
- Subdominios configurados (grafana.vps.jupiter.ar, etc.)
- Docker y Docker Compose instalados en el VPS
- Nginx instalado en el VPS
- Al menos 4GB de RAM disponible (para modo completo)

## Despliegue inicial

Para realizar el despliegue inicial de la configuración Hybrid:

1. **Generar el proyecto**:

   ```bash
   nx g project:create jupiter
   ```

2. **Ejecutar el script de despliegue**:

   ```bash
   bash ./apps/jupiter/vps-infrastructure/deployment/scripts/hybrid/deploy-hybrid.sh
   ```

3. **Seguir las instrucciones post-despliegue**:
   - Configurar DNS para los subdominios si aún no lo has hecho
   - Configurar autenticación para las herramientas de monitoreo
   - Iniciar los servicios de monitoreo en el modo deseado

## Actualización

Para actualizar una instalación Hybrid existente:

1. **Generar el proyecto con los cambios**:

   ```bash
   nx g project:create jupiter
   ```

2. **Ejecutar el script de actualización**:
   ```bash
   bash ./apps/jupiter/vps-infrastructure/deployment/scripts/hybrid/update-hybrid.sh
   ```

Este método preserva:

- Datos existentes en la base de datos
- Configuraciones personalizadas
- Estado del monitoreo (on/off y modo)

## Configuración post-despliegue

### Configurar DNS

Asegúrate de que los siguientes subdominios apunten a tu VPS:

- grafana.vps.jupiter.ar
- prometheus.vps.jupiter.ar
- alertmanager.vps.jupiter.ar

### Configurar autenticación

```bash
ssh deploy@jupiter.ar
cd /opt/jupiter
sudo ./setup-monitoring-auth.sh
```

### Iniciar monitoreo en el modo deseado

```bash
ssh deploy@jupiter.ar
cd /opt/jupiter
./setup-monitoring-mode.sh full  # Opciones: off, light, full
```

## Modos de operación

El sistema de monitoreo puede funcionar en diferentes modos:

- **Off**: Monitoreo detenido, sin consumo de recursos

  ```bash
  ./setup-monitoring-mode.sh off
  ```

- **Light**: Modo ligero con retención reducida (3 días) y menor frecuencia de muestreo

  ```bash
  ./setup-monitoring-mode.sh light
  ```

- **Full**: Monitoreo completo con retención extendida (15 días) y muestreo frecuente
  ```bash
  ./setup-monitoring-mode.sh full
  ```

## Respaldo y restauración

### Crear respaldo

```bash
bash ./apps/jupiter/vps-infrastructure/deployment/scripts/utils/backup-vps.sh
```

Este script detectará automáticamente que es una instalación Hybrid y respaldará también los archivos de monitoreo.

### Restaurar respaldo

```bash
bash ./apps/jupiter/vps-infrastructure/deployment/scripts/utils/restore-vps.sh ruta/al/respaldo
```

## Estructura en el VPS

Después del despliegue, la estructura en el VPS será:

```
/opt/jupiter/
├── docker-compose.yml              # Servicios principales
├── docker-compose.monitoring.yml   # Servicios de monitoreo
├── .env                            # Variables de entorno
├── monitoring/                     # Configuraciones de monitoreo
│   ├── alertmanager/               # Configuración de AlertManager
│   ├── grafana/                    # Dashboards y datasources
│   └── prometheus/                 # Configuración y reglas
├── nginx/                          # Configuración de Nginx
│   └── conf.d/                     # Archivos de configuración
├── setup-monitoring-auth.sh        # Script para configurar autenticación
└── setup-monitoring-mode.sh        # Script para cambiar modo de monitoreo
```

## Acceso a los servicios

Después del despliegue y configuración, podrás acceder a los servicios:

- **Frontend**: https://jupiter.ar
- **API**: https://jupiter.ar/api
- **RabbitMQ Admin**: https://jupiter.ar/rabbitmq
- **Grafana**: https://grafana.vps.jupiter.ar
- **Prometheus**: https://prometheus.vps.jupiter.ar
- **AlertManager**: https://alertmanager.vps.jupiter.ar

## Solución de problemas de monitoreo

### Verificar estado de los servicios

```bash
ssh deploy@jupiter.ar "cd /opt/jupiter && docker compose -f docker-compose.monitoring.yml ps"
```

### Ver logs de servicios específicos

```bash
ssh deploy@jupiter.ar "cd /opt/jupiter && docker compose -f docker-compose.monitoring.yml logs prometheus"
ssh deploy@jupiter.ar "cd /opt/jupiter && docker compose -f docker-compose.monitoring.yml logs grafana"
```

### Reiniciar servicios de monitoreo

```bash
ssh deploy@jupiter.ar "cd /opt/jupiter && docker compose -f docker-compose.monitoring.yml restart"
```

### Problemas con subdominios

```bash
ssh deploy@jupiter.ar "sudo nginx -t"
ssh deploy@jupiter.ar "sudo cat /etc/nginx/conf.d/grafana.vps.jupiter.ar.conf"
```

## Migrar de Minimal a Hybrid

Si tienes una instalación Minimal existente:

```bash
bash ./apps/jupiter/vps-infrastructure/scripts/monitoring/setup-monitoring.sh
```

## Eliminación completa (solo para pruebas)

Si necesitas eliminar completamente la instalación (¡SOLO PARA PRUEBAS!):

```bash
bash ./apps/jupiter/vps-infrastructure/deployment/scripts/utils/reset-vps.sh
```

⚠️ **ADVERTENCIA**: Este script eliminará TODOS los datos y configuraciones.
