# Generadores VPS: Infraestructura y Aplicaciones (`tools/vps`)

Este directorio contiene las herramientas y generadores Nx para configurar servidores VPS (Máquinas Virtuales Privadas) utilizando una arquitectura moderna basada en Docker y Traefik como proxy inverso.

## Arquitectura Objetivo

Se implementa una separación clara entre la infraestructura base compartida y las aplicaciones individuales desplegadas en el mismo VPS:

1.  **Stack de Infraestructura Central (Gestionado por `@mi-org/vps:create`):**
    * Un conjunto de archivos de configuración (ej. `docker-compose-infra.yml`, `traefik.yml`) que se genera localmente en el workspace Nx (ej. `infra/main/`) usando el generador.
    * Se despliega en el VPS (ej. en `/home/deploy/infra`) usando un workflow de CD dedicado (`.github/workflows/cd-infra.yml`), preferentemente de forma manual controlada.
    * **Proxy Inverso (Traefik):**
        * Contenedor Traefik como único punto de entrada (puertos 80/443 del host).
        * Descubre y enruta automáticamente el tráfico a contenedores (infraestructura y aplicaciones) basado en **etiquetas Docker (labels)**.
        * Gestiona **automáticamente** certificados SSL de Let's Encrypt vía ACME (configurado por defecto con desafío TLS-ALPN o HTTP-01, opcionalmente DNS-01 requiere configuración manual de secretos).
        * Configura **redirección automática global de HTTP a HTTPS** a nivel de entrypoint.
        * Expone su propio **Dashboard** en un subdominio seguro (`traefik.<baseDomain>`) protegido por **Autenticación Básica (Basic Auth)**. Las credenciales se gestionan mediante un archivo `.htpasswd` **directamente en el servidor VPS** (no en Git).
    * **Stack de Monitoreo (Opcional):** Contenedores para Prometheus, Grafana, Loki, Promtail, Node Exporter. Grafana se expone vía Traefik en un subdominio seguro (`grafana.<baseDomain>`). La habilitación de este stack es una opción en el generador `@mi-org/vps:create`. Puede ser omitido si se usan soluciones de monitoreo del proveedor cloud (ej. Google Cloud Monitoring).
    * **Red Docker Compartida:** Una red Docker externa (ej. `webproxy`) a la que se conectan todos los contenedores que necesitan ser expuestos vía Traefik.

2.  **Stacks de Aplicaciones (Gestionados por `@mi-org/project:create` u otros):**
    * Viven en directorios separados (ej. `apps/<app-name>`). Tienen su propio `docker-compose-app.yml`.
    * Se conectan a la red `webproxy`.
    * **No exponen puertos 80/443 al host.**
    * **No gestionan SSL.** Traefik se encarga de ello.
    * Incluyen **`labels` Docker** para que Traefik configure enrutamiento y SSL basado en el host/path deseado.
    * Se despliegan preferentemente vía un workflow CD automático para apps (ej. `.github/workflows/cd-deploy.yml`) basado en `nx affected`.

## Generadores Dentro de `tools/vps`

1.  **`@mi-org/vps:create` (Setup Infraestructura):**
    * **Propósito:** Generar los archivos de configuración para un Stack de Infraestructura Central específico (ej. para Hostinger, AWS, etc.) localmente en el workspace Nx (ej. en `infra/<infraName>`).
    * **Salida:** `docker-compose-infra.yml`, `traefik.yml`, `.env.template`, `README.md` específico de la instancia, y opcionalmente archivos de monitoreo (`prometheus.yml`, etc.), dentro de la carpeta especificada (`infra/<infraName>` por defecto).
    * **Registro Nx:** Registra el directorio generado como un proyecto Nx (`project.json`).
    * **Schema:** Acepta opciones como `infraName`, `baseDomain`, `acmeEmail`, `monitoring` (booleano), `grafanaSubdomain`, `traefikSubdomain`, `outputDirectory`.
    * **Configuración Generada:** Incluye redirección HTTPS, dashboard Traefik seguro (requiere creación manual de `.htpasswd` en el servidor), y configuración base ACME.

2.  **`@mi-org/vps:remove` (Limpieza Workspace):**
    * **Propósito:** Eliminar un directorio de configuración de infraestructura (`infra/<infraName>`) del **workspace local Nx** y desregistrar el proyecto Nx asociado.
    * **Acción:** Delega a `@nx/workspace:remove`.
    * **NO afecta** la infraestructura desplegada en el servidor VPS.

## Scripts de Preparación del Servidor (`tools/vps/scripts/`)

Ejecutar manualmente en un nuevo VPS Debian/Ubuntu **antes** del primer despliegue Docker.

1.  **`debian-harden.sh` (Ejecutar como `root`):** Seguridad base SO, usuario admin `sudo`, hardening SSH (solo clave), firewall `ufw` (permite SSH, HTTP, HTTPS).
2.  **`vps-initial-setup.sh` (Ejecutar con `sudo`):** Usuario `deploy` (sin sudo, en grupo `docker`), Docker, Docker Compose plugin, `rsync`. Crea directorios base `/home/deploy/apps` y `/home/deploy/infra`.

## Despliegue y Actualización de la Infraestructura (`.github/workflows/cd-infra.yml`)

* **Trigger:** Manual (`workflow_dispatch`) desde GitHub Actions.
* **Input Simplificado:** Solo requiere seleccionar el `infra_name` (ej. `hostinger`) de una lista desplegable. El workflow deriva las rutas y nombres de secretos necesarios (ej. `infra/hostinger/`, `VPS_HOSTINGER_HOST`).
* **Prerrequisitos Manuales Clave (Solo la primera vez):**
    1.  Ejecutar los scripts de preparación del servidor.
    2.  Configurar los registros DNS para los subdominios de infraestructura (`traefik.<baseDomain>`, `grafana.<baseDomain>` si aplica).
    3.  Crear manualmente el archivo `.env` en `/home/deploy/infra/` a partir del `.env.template` generado, rellenando los secretos necesarios (ej. contraseña Grafana, *opcionalmente* tokens API para DNS challenge ACME).
    4.  Crear manualmente el directorio y archivo `/home/deploy/infra/traefik-auth/.htpasswd` en el servidor con las credenciales para el dashboard de Traefik (usando `htpasswd`).
* **Acciones del Workflow:**
    1.  Checkout del repositorio.
    2.  Configuración de SSH usando secretos (`VPS_<INFRA_NAME_UPPER>_KEY`, etc.).
    3.  Sincronización de archivos de configuración desde `infra/<infraName>/` al servidor (`/home/deploy/infra/`) usando `rsync`. **Importante:** Excluye `.env` y `traefik-auth/.htpasswd` para no sobrescribir los archivos creados manualmente en el servidor.
    4.  Ejecución remota de `docker compose -f docker-compose-infra.yml pull` y `docker compose -f docker-compose-infra.yml up -d --remove-orphans` en el directorio `/home/deploy/infra/`.

## Despliegue de Aplicaciones (`.github/workflows/cd-deploy.yml`)

* Gestionado por el generador `@mi-org/project:create` (o similar) que configura el proyecto de la aplicación.
* Workflow automático (ej. en push a `main`) que usa `nx affected` para detectar cambios en `apps/`.
* Copia los archivos de la aplicación afectada a `/home/deploy/apps/<app-name>/`.
* Ejecuta `docker compose -f docker-compose-app.yml up -d` para la aplicación.
* Traefik detecta el nuevo contenedor (vía Docker provider y labels) y configura el enrutamiento/SSL automáticamente.

## Estado Actual (2025-04-16)

* Arquitectura final definida (Infra con Traefik + Apps separadas).
* Generador `vps:create` funcional, genera configuración base con Traefik (dashboard seguro, HTTPS redirect) y monitoreo opcional. Requiere pasos manuales en servidor para `.env` y `.htpasswd`.
* Generador `vps:remove` funcional.
* Scripts de preparación del servidor (`debian-harden.sh`, `vps-initial-setup.sh`) definidos.
* Workflow `cd-infra.yml` funcional, con trigger manual simplificado y lógica de despliegue vía rsync/docker compose.
* Workflow `cd-deploy.yml` (automático, `nx affected`) definido conceptualmente.
* **Pendiente:** Implementación detallada o refinamiento del workflow `cd-deploy.yml` para aplicaciones.

## Continuidad del Chat con Gemini

Para retomar este trabajo en una nueva sesión de chat:

1.  **Objetivo:** "Continuando desarrollo/mantenimiento de generadores Nx y workflows para infraestructura VPS (Traefik + Monitoreo Opcional) y despliegue de aplicaciones."
2.  **Contexto Principal:** Pega el contenido completo de **este archivo `tools/vps/README.md`**.
3.  **Archivos Clave (Prepárate para Copiar Contenido si se Pide):**
    * `tools/vps/src/generators/create/schema.json` y `schema.d.ts`
    * `tools/vps/src/generators/create/generator.ts`
    * `tools/vps/src/generators/create/files/docker-compose-infra.yml.template`
    * `tools/vps/src/generators/create/files/traefik.yml.template`
    * `tools/vps/src/generators/create/files/README.md.template` (El README específico de instancia)
    * `tools/vps/scripts/debian-harden.sh`
    * `tools/vps/scripts/vps-initial-setup.sh`
    * `.github/workflows/cd-infra.yml`
    * `.github/workflows/cd-deploy.yml`
4.  **Siguiente Paso:** Indica qué quieres hacer (ej. "Implementemos el workflow `cd-deploy.yml` para las aplicaciones").

---
