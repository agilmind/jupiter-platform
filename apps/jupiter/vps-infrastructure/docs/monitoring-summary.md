# Sistema de Monitoreo para VPS

## Componentes implementados

### 1. Stack de monitoreo

- **Prometheus**: Sistema central de recolección y almacenamiento de métricas
- **Grafana**: Herramienta de visualización de métricas con dashboards
- **AlertManager**: Gestión de alertas y notificaciones
- **Exporters**:
  - Node Exporter: métricas del sistema host
  - PostgreSQL Exporter: métricas de la base de datos
  - RabbitMQ Exporter: métricas del broker de mensajes

### 2. Configuración Nginx

- Subdominios dedicados para cada herramienta:
  - grafana.vps.jupiter.ar
  - prometheus.vps.jupiter.ar
  - alertmanager.vps.jupiter.ar
- Configuración de SSL/HTTPS
- Autenticación básica para proteger el acceso

### 3. Sistema modular

- Capacidad para operar en tres modos:
  - **Off**: Monitoreo detenido, sin consumo de recursos
  - **Light**: Modo ligero con menor uso de recursos y retención
  - **Full**: Monitoreo completo con todas las métricas y alertas

### 4. Scripts de administración

- **setup-monitoring-auth.sh**: Configura autenticación para acceso seguro
- **setup-monitoring-mode.sh**: Cambia entre modos de monitoreo
- **deploy-monitoring.sh**: Despliega toda la configuración en el VPS

## Estructura de archivos

```
vps-infrastructure/
├── complete/
│   ├── monitoring/
│   │   ├── alertmanager/
│   │   │   └── alertmanager.yml.template
│   │   ├── grafana/
│   │   │   ├── provisioning/
│   │   │   │   ├── dashboards/
│   │   │   │   │   └── dashboards.yml.template
│   │   │   │   └── datasources/
│   │   │   │       └── datasources.yml.template
│   │   │   └── dashboards/
│   │   └── prometheus/
│   │       ├── prometheus.yml.template
│   │       └── rules/
│   │           └── alerting-rules.yml.template
│   ├── docker-compose.monitoring.yml.template
│   └── nginx/
│       └── conf.d/
│           ├── grafana.conf.template
│           ├── prometheus.conf.template
│           └── alertmanager.conf.template
└── scripts/
    ├── setup-monitoring-auth.sh.template
    ├── setup-monitoring-mode.sh.template
    └── deploy-monitoring.sh.template
```

## Funcionalidades principales

### Monitoreo del sistema

- CPU, memoria, disco y red
- Alertas para uso excesivo de recursos
- Detección de problemas de rendimiento

### Monitoreo de servicios

- Estado de PostgreSQL y RabbitMQ
- Métricas específicas para cada servicio
- Monitoreo de colas y mensajes

### Alertas configurables

- Notificaciones por email a través de Postfix
- Diferentes niveles de severidad
- Agregación inteligente para evitar ruido

### Configuración modular

- Capacidad para ajustar el consumo de recursos
- Adaptable a diferentes necesidades y entornos
- Fácil extensión para monitorear nuevos servicios

## Próximos pasos

### Implementación de logging centralizado (Fase 2)

- Integrar Loki para recolección y almacenamiento de logs
- Configurar Promtail/Fluentd para envío de logs desde servicios
- Crear dashboards en Grafana para visualización de logs

### Implementación de tracing distribuido (Fase 2)

- Integrar Jaeger para tracing
- Implementar instrumentación con OpenTelemetry
- Configurar correlación entre logs y traces

### Mejoras adicionales (Fase 3)

- Dashboards personalizados para diferentes servicios
- Integración con sistemas de notificación adicionales
- Monitoreo avanzado de aplicaciones Node.js
