# Guía de Monitoreo para VPS

Este documento explica cómo utilizar el sistema de monitoreo para proyectos desplegados en un VPS.

## Componentes del sistema

El sistema de monitoreo incluye los siguientes componentes:

- **Prometheus**: Recolección y almacenamiento de métricas
- **Grafana**: Visualización de métricas mediante dashboards
- **AlertManager**: Gestión de alertas y notificaciones
- **Exporters**:
  - Node Exporter: métricas del sistema (CPU, memoria, disco)
  - PostgreSQL Exporter: métricas de la base de datos
  - RabbitMQ Exporter: métricas del broker de mensajes

## Opciones de despliegue

Hay tres formas de desplegar el sistema de monitoreo:

### 1. Despliegue completo como parte de la configuración Hybrid

Este método despliega la aplicación junto con el sistema de monitoreo desde el principio:

```bash
# Generar el proyecto
nx g project:create jupiter

# Ejecutar el despliegue hybrid (incluye monitoreo)
bash ./apps/jupiter/vps-infrastructure/deployment/scripts/deploy-hybrid.sh
```

### 2. Añadir monitoreo a una instalación existente

Si ya tienes desplegada la versión "minimal" y quieres añadir monitoreo:

```bash
# Generar el proyecto
nx g project:create jupiter

# Añadir monitoreo a la instalación existente
bash ./apps/jupiter/vps-infrastructure/deployment/scripts/setup-monitoring.sh
```

### 3. Actualizar una instalación Hybrid existente

Para actualizar una instalación Hybrid que ya incluye monitoreo:

```bash
# Generar el proyecto
nx g project:create jupiter

# Actualizar la instalación hybrid
bash ./apps/jupiter/vps-infrastructure/deployment/scripts/update-hybrid.sh
```

## Configuración tras el despliegue

Después del despliegue inicial, es necesario realizar algunos pasos de configuración:

1. **Configurar DNS**: Verificar que los subdominios apunten al VPS:

   - grafana.vps.jupiter.ar
   - prometheus.vps.jupiter.ar
   - alertmanager.vps.jupiter.ar

2. **Configurar autenticación**:

   ```bash
   ssh deploy@jupiter.ar
   cd /opt/jupiter
   sudo ./setup-monitoring-auth.sh
   ```

3. **Iniciar los servicios de monitoreo en el modo deseado**:
   ```bash
   ./setup-monitoring-mode.sh full  # Opciones: off, light, full
   ```

## Modos de operación

El sistema de monitoreo puede funcionar en diferentes modos según las necesidades:

- **Off**: Monitoreo detenido, sin consumo de recursos
- **Light**: Modo ligero con retención reducida (3 días) y menor frecuencia de muestreo
- **Full**: Monitoreo completo con retención extendida (15 días) y muestreo frecuente

Para cambiar entre modos:

```bash
./setup-monitoring-mode.sh [off|light|full]
```

## Acceso a las herramientas

Una vez configurado, se puede acceder a las herramientas a través de:

- **Grafana**: https://grafana.vps.jupiter.ar
- **Prometheus**: https://prometheus.vps.jupiter.ar
- **AlertManager**: https://alertmanager.vps.jupiter.ar

El acceso requiere autenticación con las credenciales configuradas.

## Estructura de directorios

El sistema de monitoreo sigue esta estructura:

```
vps-infrastructure/
├── common/                                    # Componentes compartidos
│   ├── monitoring/
│   │   ├── alertmanager/
│   │   │   └── alertmanager.yml.template
│   │   ├── grafana/
│   │   │   ├── dashboards/
│   │   │   └── provisioning/
│   │   │       ├── dashboards/
│   │   │       └── datasources/
│   │   └── prometheus/
│   │       ├── prometheus.yml.template
│   │       └── rules/
│   │           └── alerting-rules.yml.template
│   └── docker-compose.monitoring.yml.template
├── hybrid/
│   └── nginx/
│       └── conf.d/
│           ├── grafana.conf.template
│           ├── prometheus.conf.template
│           └── alertmanager.conf.template
└── scripts/
    ├── setup-monitoring-auth.sh.template
    ├── setup-monitoring-mode.sh.template
    └── setup-monitoring.sh.template
```

## Solución de problemas

Si encuentras problemas con el sistema de monitoreo:

1. **Verificar estado de los servicios**:

   ```bash
   docker compose -f docker-compose.monitoring.yml ps
   ```

2. **Ver logs de los servicios**:

   ```bash
   docker compose -f docker-compose.monitoring.yml logs prometheus
   docker compose -f docker-compose.monitoring.yml logs grafana
   ```

3. **Reiniciar un servicio específico**:

   ```bash
   docker compose -f docker-compose.monitoring.yml restart [servicio]
   ```

4. **Verificar configuración de Nginx**:
   ```bash
   sudo nginx -t
   ```

## Próximas mejoras

El sistema de monitoreo se seguirá mejorando con:

- Integración de Loki para centralización de logs
- Jaeger para tracing distribuido
- Dashboards personalizados adicionales
- Mejoras en las reglas de alerta
