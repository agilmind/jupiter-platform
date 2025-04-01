# Planificación de Infraestructura VPS

## Objetivo

Este documento describe el plan de desarrollo para la infraestructura VPS del proyecto jupiter. Está estructurado para facilitar la continuidad del desarrollo incluso si la conversación se interrumpe.

## Arquitectura y componentes

Estamos implementando una infraestructura flexible con tres configuraciones posibles:

1. **Complete**: Todo en un solo VPS

   - PostgreSQL + pgBouncer
   - RabbitMQ
   - Nginx como proxy/balanceador
   - Monitoreo con Prometheus/Grafana

2. **Hybrid**: Algunos servicios en cloud

   - PostgreSQL en servicio gestionado
   - pgBouncer en VPS para conexión a PostgreSQL externo
   - Nginx y monitoreo en VPS

3. **Minimal**: Infraestructura básica pero completa
   - Servicios esenciales en un solo VPS
   - Nginx como punto de entrada
   - Acceso a API a través de rutas (/api) en lugar de puertos
   - SSL/HTTPS con Let's Encrypt

## Estado actual del proyecto

Hemos completado las siguientes fases:

1. ✅ **Estructura base establecida**

   - Organización de directorios e integración con generador
   - Templates para configuraciones de Docker Compose
   - Scripts de despliegue y configuración

2. ✅ **Despliegue básico**

   - Arquitectura "Minimal" implementada
   - Sistema de despliegue con scripts automatizados
   - Configuración específica para entorno productivo

3. ✅ **Seguridad básica**
   - SSL/HTTPS con Let's Encrypt
   - Aislamiento de servicios (no exposición de puertos internos)
   - Acceso a API a través de rutas (/api) en lugar de puertos

## Próximos pasos

### Fase 4: Alta Disponibilidad y Monitoreo

1. **Monitoreo**

   - Implementar Prometheus/Grafana
   - Dashboard para métricas clave
   - Alertas para servicios críticos

2. **Alta Disponibilidad**

   - Replicación PostgreSQL
   - Clustering de RabbitMQ
   - Balanceo de carga para múltiples instancias de aplicaciones

3. **Respaldos automatizados**
   - Backup programado de bases de datos
   - Respaldo de volúmenes y configuraciones
   - Estrategia de recuperación ante desastres

### Fase 5: CI/CD y Optimización

1. **Integración Continua**

   - Pipeline con GitHub Actions
   - Pruebas automatizadas
   - Verificación de calidad de código

2. **Despliegue Continuo**

   - Automatización completa del despliegue
   - Despliegues canary o blue-green
   - Rollback automatizado

3. **Optimización de rendimiento**
   - Ajustes PostgreSQL y pgBouncer
   - Caché Nginx y optimización
   - Ajuste de recursos de contenedores

### Fase 6: Funcionalidades avanzadas

1. **Múltiples entornos**

   - Staging y producción en el mismo VPS
   - Aislamiento entre entornos
   - Promoción controlada entre entornos

2. **Registro centralizado**

   - ELK Stack o alternativa
   - Agregar logs de todos los servicios
   - Panel de análisis de logs

3. **Escalabilidad horizontal**
   - Soporte para múltiples nodos
   - Distribución de carga
   - Sincronización entre nodos

## Componentes implementados

1. **Infraestructura básica**

   - Docker Compose para orquestación
   - Nginx como punto de entrada
   - Configuración de SSL/HTTPS

2. **Seguridad**

   - Certificados Let's Encrypt
   - Aislamiento de servicios internos
   - Acceso a API mediante rutas en lugar de puertos

3. **Herramientas de administración**

   - Script de despliegue automatizado
   - Configuración de SSL/HTTPS
   - Solución para problemas de red Docker

4. **Automatización**
   - Construcción y etiquetado de imágenes
   - Transferencia y configuración automatizada
   - Renovación automática de certificados SSL

## Arquitectura actual (Minimal)

```
                    ┌───────────────────────────────────────┐
                    │               VPS                     │
                    │                                       │
                    │  ┌────────┐        ┌──────────────┐  │
 HTTPS ───────────► │  │        │        │              │  │
 (443)              │  │ Nginx  │───────►│  Web App     │  │
                    │  │        │        │  Container   │  │
 http://app.ar      │  │        │        │              │  │
 https://app.ar     │  │        │        └──────────────┘  │
                    │  │        │                          │
                    │  │        │        ┌──────────────┐  │
 /api ────────────► │  │        │───────►│  App Server  │  │
 /api/*             │  │        │        │  Container   │  │
                    │  │        │        │              │  │
                    │  │        │        └──────────────┘  │
                    │  │        │                          │
                    │  │        │        ┌──────────────┐  │
 /rabbitmq ───────► │  │        │───────►│  RabbitMQ    │  │
                    │  │        │        │  Container   │  │
                    │  └────────┘        └──────────────┘  │
                    │                                       │
                    │                    ┌──────────────┐  │
                    │                    │ Worker       │  │
                    │                    │ Container    │  │
                    │                    └──────────────┘  │
                    │                                       │
                    │                    ┌──────────────┐  │
                    │                    │ PostgreSQL   │  │
                    │                    │ Container    │  │
                    │                    └──────────────┘  │
                    │                                       │
                    │                    ┌──────────────┐  │
                    │                    │ PgBouncer    │  │
                    │                    │ Container    │  │
                    │                    └──────────────┘  │
                    │                                       │
                    └───────────────────────────────────────┘
```

## Notas para continuidad

Si necesitas retomar esta conversación con Claude:

1. Comparte este documento
2. Explica que estás continuando el desarrollo de la infraestructura VPS
3. Indica en qué componente específico quieres continuar trabajando
4. Menciona el estado actual (implementación de Minimal completa con SSL)
