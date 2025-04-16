# Guía de Despliegue en VPS

Este documento explica las diferentes opciones de despliegue en VPS para proyectos generados con nuestro generador.

## Opciones de Configuración

El sistema ofrece tres configuraciones diferentes para adaptarse a distintas necesidades:

### 1. Minimal (Básica)

**Características:**

- Configuración simple pero completa
- Nginx como punto de entrada
- PostgreSQL local
- RabbitMQ local
- Sin monitoreo avanzado

**Ideal para:**

- Entornos de desarrollo
- Proyectos pequeños
- Servidores con recursos limitados
- Pruebas iniciales

### 2. Hybrid (Con Monitoreo)

**Características:**

- Todo lo de Minimal
- Sistema de monitoreo completo:
  - Prometheus para recolección de métricas
  - Grafana para visualización
  - AlertManager para alertas
  - Exporters para servicios (PostgreSQL, RabbitMQ, Node)
- Acceso a herramientas a través de subdominios seguros

**Ideal para:**

- Entornos de producción de tamaño mediano
- Proyectos que requieren monitoreo avanzado
- Observabilidad de la infraestructura

### 3. Complete (Alta Disponibilidad)

**Características:**

- Todo lo de Hybrid
- Alta disponibilidad
- Replicación de servicios
- Balanceo de carga
- Clustering
- Backups automatizados

**Ideal para:**

- Entornos de producción críticos
- Proyectos empresariales
- Aplicaciones que requieren máxima disponibilidad

## Comandos de Despliegue

### Despliegue Inicial

Para realizar el primer despliegue de un proyecto:

```bash
# 1. Generar el proyecto
nx g project:create jupiter

# 2. Desplegar según la configuración deseada:

# Minimal (Básica)
bash ./apps/jupiter/vps-infrastructure/deployment/scripts/minimal/deploy-minimal.sh

# Hybrid (Con Monitoreo)
bash ./apps/jupiter/vps-infrastructure/deployment/scripts/hybrid/deploy-hybrid.sh

# Complete (Alta Disponibilidad)
bash ./apps/jupiter/vps-infrastructure/deployment/scripts/complete/deploy-complete.sh
```

### Actualización

Para actualizar una instalación existente:

```bash
# 1. Generar el proyecto con cambios
nx g project:create jupiter

# 2. Actualizar según la configuración:

# Minimal (Básica)
bash ./apps/jupiter/vps-infrastructure/deployment/scripts/minimal/update-minimal.sh

# Hybrid (Con Monitoreo)
bash ./apps/jupiter/vps-infrastructure/deployment/scripts/hybrid/update-hybrid.sh

# Complete (Alta Disponibilidad)
bash ./apps/jupiter/vps-infrastructure/deployment/scripts/complete/update-complete.sh
```

### Respaldo y Restauración

```bash
# Crear un respaldo completo
bash ./apps/jupiter/vps-infrastructure/deployment/scripts/utils/backup-vps.sh

# Restaurar desde un respaldo
bash ./apps/jupiter/vps-infrastructure/deployment/scripts/utils/restore-vps.sh ruta/al/respaldo
```

### Añadir monitoreo a una instalación existente

```bash
# Añadir monitoreo a una instalación Minimal
bash ./apps/jupiter/vps-infrastructure/scripts/monitoring/setup-monitoring.sh
```

### Operaciones para pruebas o recuperación

```bash
# Resetear completamente el VPS (¡SOLO PARA PRUEBAS!)
bash ./apps/jupiter/vps-infrastructure/deployment/scripts/utils/reset-vps.sh
```

## Guías específicas

Para instrucciones detalladas sobre cada tipo de despliegue:

- [Guía de despliegue Minimal](./minimal-guide.md)
- [Guía de despliegue Hybrid](./hybrid-guide.md)
- [Guía de monitoreo](./monitoring-guide.md)

## Protección de datos en producción

Todos los scripts de despliegue incluyen:

- Advertencias claras antes de sobrescribir datos existentes
- Backup automático de la configuración actual
- Confirmación obligatoria para operaciones destructivas

Los scripts de actualización están diseñados para preservar:

- Datos de bases de datos
- Configuraciones personalizadas
- Estado de los servicios

## Acceso a los servicios

Después del despliegue, se puede acceder a los servicios a través de:

- **Frontend**: https://jupiter.ar
- **API**: https://jupiter.ar/api
- **RabbitMQ Admin**: https://jupiter.ar/rabbitmq

Para configuración Hybrid y Complete:

- **Grafana**: https://grafana.vps.jupiter.ar
- **Prometheus**: https://prometheus.vps.jupiter.ar
- **AlertManager**: https://alertmanager.vps.jupiter.ar
