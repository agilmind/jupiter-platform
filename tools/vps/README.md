# Generadores VPS: Infraestructura y Aplicaciones (`tools/vps`)

Este directorio contiene las herramientas y generadores Nx para configurar servidores VPS (Máquinas Virtuales Privadas) utilizando una arquitectura moderna basada en Docker y Traefik como proxy inverso.

## Arquitectura Objetivo

Se implementa una separación clara entre la infraestructura base compartida y las aplicaciones individuales desplegadas en el mismo VPS:

1.  **Stack de Infraestructura Central (Gestionado por `@mi-org/vps:create`):**
    * Un `docker-compose-infra.yml` que se genera localmente en el workspace (ej. `infra/main/`) y se despliega manualmente o vía un workflow CD dedicado (`cd-infra.yml`). Corre continuamente en un directorio en el VPS (ej. `/home/deploy/infra`).
    * **Proxy Inverso (Traefik):** Contenedor Traefik como único punto de entrada (puertos 80/443 del host). Descubre y enruta automáticamente el tráfico a contenedores de aplicación basado en **etiquetas Docker (labels)**. Gestiona **automáticamente** SSL de Let's Encrypt vía ACME.
    * **Stack de Monitoreo (Opcional):** Contenedores para Prometheus, Grafana, Loki, Promtail, Node Exporter. Grafana se expone vía Traefik en un subdominio.
    * **Red Docker Compartida:** Una red (ej. `webproxy`) a la que se conectan todos los contenedores.

2.  **Stacks de Aplicaciones (Gestionados por `@mi-org/project:create` u otros):**
    * Viven en `apps/<app-name>`. Tienen su propio `docker-compose-app.yml`.
    * Exponen puertos *internos* a la red `webproxy`. No mapean 80/443 al host. No gestionan SSL.
    * Incluyen **`labels` Docker** para que Traefik configure enrutamiento y SSL.
    * Se despliegan vía el workflow CD automático para apps (`.github/workflows/cd-deploy.yml`) basado en `nx affected`.

## Generadores Dentro de `tools/vps`

1.  **`@mi-org/vps:create` (Setup Infraestructura):**
    * **Propósito:** Generar los archivos de configuración para el Stack de Infraestructura Central localmente en el workspace Nx (ej. en `infra/<infraName>`).
    * **Salida:** `docker-compose-infra.yml.template`, `traefik.yml.template`, `prometheus.yml.template`, `.env.template`, etc., dentro de la carpeta especificada (o `infra/<infraName>` por defecto).
    * **Registro Nx:** Registra el directorio generado como un proyecto Nx (con `project.json`).
    * **Schema:** Acepta `infraName`, `baseDomain`, `acmeEmail`, `monitoring`, `grafanaSubdomain`, `traefikSubdomain`, `outputDirectory`.
2.  **`@mi-org/vps:remove` (Limpieza Workspace):**
    * **Propósito:** Eliminar un directorio de configuración de infraestructura (`infra/<infraName>`) del **workspace local Nx** y desregistrar el proyecto Nx asociado.
    * **Acción:** Delega a `@nx/workspace:remove`.
    * **NO afecta** la infraestructura desplegada en el servidor VPS.

## Scripts de Preparación del Servidor (`tools/vps/scripts/`)

Ejecutar manualmente en un nuevo VPS Debian/Ubuntu antes de cualquier despliegue Docker.

1.  **`debian-harden.sh` (Ejecutar como `root`):** Seguridad base SO, usuario admin `sudo`, hardening SSH (solo clave), firewall `ufw` (permite SSH, HTTP, HTTPS).
2.  **`vps-initial-setup.sh` (Ejecutar con `sudo`):** Usuario `deploy` (sin sudo, en grupo `docker`), Docker, Docker Compose plugin, `rsync`. Crea directorios `/home/deploy/apps` y `/home/deploy/infra`. Configura clave SSH opcional para `deploy`. (Versión v4 simplificada para Traefik).

## Despliegue y Actualización de la Infraestructura

1.  **Generación/Actualización Local:** Usa `nx g @mi-org/vps:create <infraName> ...` (usa `--forceOverwrite` para actualizar). Haz commit de los cambios en `infra/<infraName>/`.
2.  **Prerrequisitos del Primer Despliegue (Manual en VPS):**
    * Ejecutar scripts `debian-harden.sh` y `vps-initial-setup.sh`.
    * Crear y configurar DNS para los subdominios de infra (ej. `traefik.<baseDomain>`, `grafana.<baseDomain>`).
    * Crear el archivo `.env` en `/home/deploy/infra/` a partir de `.env.template` y añadir los secretos necesarios (ej. API keys DNS para Traefik AC

## Despliegue de Aplicaciones

* Gestionado por el generador `@mi-org/project:create` (o similar).
* El generador crea el proyecto en `apps/<app-name>` y añade las `labels` de Traefik al `docker-compose-app.yml`.
* El workflow `.github/workflows/cd-deploy.yml` (el que usa `nx affected` sobre `apps/`) se activa con push a `main`.
* Detecta la app afectada, copia sus archivos a `/home/deploy/apps/<app-name>/`, ejecuta `docker compose -f docker-compose-app.yml up -d`.
* Traefik detecta el nuevo contenedor y configura el enrutamiento/SSL automáticamente basado en las labels.

## Estado Actual (2025-04-14)

* Arquitectura final definida (Infra con Traefik + Apps separadas).
* Generador `vps:create` redefinido para generar configuración de infraestructura localmente y registrarla como proyecto Nx.
* Generador `vps:remove` definido para limpiar la configuración de infraestructura del workspace Nx.
* Scripts `debian-harden.sh` y `vps-initial-setup.sh` (v4) definidos para preparar el host.
* Workflow `cd-infra.yml` (manual) definido conceptualmente para desplegar la infraestructura.
* Workflow `cd-deploy.yml` (automático, `nx affected`) definido conceptualmente para desplegar aplicaciones.
* **Pendiente:** Implementar las plantillas y la lógica del generador `vps:create` para la infraestructura Traefik+Monitoring.

## Continuidad del Chat con Gemini

Para retomar este trabajo en una nueva sesión de chat:

1.  **Objetivo:** "Continuando generador Nx '@mi-org/vps:create' para stack de infraestructura VPS (Traefik + Monitoring) y generador '@mi-org/vps:remove'. La arquitectura está definida en el README."
2.  **Contexto Principal:** Pega el contenido completo de **este archivo README.md**.
3.  **Archivos Clave (Prepárate para Copiar Contenido si se Pide):**
    * `tools/vps/scripts/debian-harden.sh`
    * `tools/vps/scripts/vps-initial-setup.sh` (v4 - Traefik)
    * `tools/vps/src/generators/create/schema.json` (vps:create infra schema)
    * `tools/vps/src/generators/create/schema.d.ts` (vps:create infra schema)
    * `tools/vps/src/generators/create/generator.ts` (vps:create infra logic - ¡aún por finalizar!)
    * `tools/vps/src/generators/remove/schema.json` (vps:remove schema)
    * `tools/vps/src/generators/remove/schema.d.ts` (vps:remove schema)
    * `tools/vps/src/generators/remove/generator.ts` (vps:remove logic)
    * `.github/workflows/cd-infra.yml` (Manual infra deployment workflow)
    * `.github/workflows/cd-deploy.yml` (Automatic app deployment workflow - el complejo que ya teníamos)
    * *Plantillas a crear/usar* para `vps:create` (infra): `docker-compose-infra.yml.template`, `traefik.yml.template`, `prometheus.yml.template`, etc.
4.  **Siguiente Paso:** Indica qué quieres hacer (ej. "Definamos la plantilla `docker-compose-infra.yml.template` para Traefik y Monitoreo").

---
