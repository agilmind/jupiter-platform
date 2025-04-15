# Generadores VPS: Infraestructura y Aplicaciones (`tools/vps`)

Este directorio contiene las herramientas y generadores Nx para configurar servidores VPS (Máquinas Virtuales Privadas) utilizando una arquitectura moderna basada en Docker y Traefik como proxy inverso.

## Arquitectura Objetivo

El objetivo es lograr una separación clara entre la infraestructura base compartida y las aplicaciones individuales desplegadas en el mismo VPS, facilitando la gestión, el despliegue continuo y la escalabilidad.

1.  **Stack de Infraestructura Central:**
    * **Gestión:** Desplegado y gestionado (potencialmente) por el generador `@mi-org/vps:create` (ver abajo). Corre continuamente en un directorio dedicado en el VPS (ej. `/home/deploy/infra`).
    * **Componentes:**
        * **Proxy Inverso (Traefik):** Contenedor Traefik que actúa como único punto de entrada (puertos 80/443 del host). Descubre y enruta dinámicamente el tráfico a los contenedores de aplicación basado en **etiquetas Docker (labels)**. Gestiona **automáticamente** la obtención y renovación de certificados SSL/TLS vía Let's Encrypt (ACME).
        * **Stack de Monitoreo (Opcional):** Contenedores para Prometheus, Grafana, Loki, Promtail, Node Exporter. Configurados para recolectar métricas y logs del host y otros contenedores. Grafana se expone a través de Traefik en un subdominio dedicado.
    * **Red Docker Compartida:** Una red Docker (ej. `webproxy`) a la que se conectan todos los contenedores (infraestructura y aplicaciones) para permitir la comunicación interna y el enrutamiento desde Traefik.

2.  **Stacks de Aplicaciones:**
    * **Gestión:** Cada aplicación es independiente, generada (idealmente) por un generador Nx específico como `@mi-org/project:create` (fuera del alcance directo de *este* README, pero parte de la arquitectura global). Viven en directorios separados en el VPS (ej. `/home/deploy/apps/mi-app-1`).
    * **Componentes:** `docker-compose-app.yml` define los servicios de la aplicación (backend, frontend, DB, etc.).
    * **Configuración Clave:**
        * Exponen puertos *internos* a la red `webproxy`.
        * **NO** mapean puertos 80/443 al host.
        * **NO** gestionan SSL.
        * Incluyen **`labels` Docker** para que Traefik configure automáticamente el enrutamiento y SSL (ej. `traefik.http.routers.mi-app.rule=Host(\`mi-app.dominio.com\`)`, `traefik.http.services.mi-app.loadbalancer.server.port=4000`, `traefik.http.routers.mi-app.tls.certresolver=myresolver`).
    * **Despliegue:** Típicamente automatizado vía un workflow de CD (`.github/workflows/cd-deploy.yml`) que se activa por cambios en `apps/`, usa `nx affected`, copia archivos y ejecuta `docker compose up` para la aplicación específica. Traefik detecta los cambios automáticamente.

## Generadores Dentro de `tools/vps`

1.  **`@mi-org/vps:create` (Setup Infraestructura):**
    * **Propósito:** Generar los archivos de configuración para el **Stack de Infraestructura Central** localmente en el workspace Nx (ej. en `infra/<infraName>`).
    * **Salida:** `docker-compose-infra.yml.template`, `traefik.yml.template`, `prometheus.yml.template`, `.env.template`, etc.
    * **Registro Nx:** Registra el directorio generado (`infra/<infraName>`) como un proyecto Nx (con `project.json`) para facilitar tareas como linting.
    * **NO Despliega:** Solo genera los archivos localmente. El despliegue inicial y las actualizaciones son un paso separado (manual o vía `cd-infra.yml`).
    * **Schema:** Acepta opciones como `infraName`, `baseDomain` (para Traefik/Grafana), `acmeEmail`, `monitoring` (flag), `outputDirectory`.
2.  **`@mi-org/vps:remove` (Limpieza Workspace):**
    * **Propósito:** Eliminar un directorio de configuración de infraestructura (`infra/<infraName>`) del **workspace local Nx** y desregistrar el proyecto Nx asociado.
    * **Acción:** Delega a `@nx/workspace:remove`.
    * **NO afecta** la infraestructura desplegada en el servidor VPS.

## Scripts de Preparación del Servidor (`tools/vps/scripts/`)

Estos scripts se ejecutan **manualmente** en un nuevo VPS Debian/Ubuntu para prepararlo *antes* de desplegar cualquier stack Docker.

1.  **`debian-harden.sh` (Ejecutar como `root`):**
    * Seguridad base SO, usuario admin con `sudo`, hardening SSH (solo clave), firewall `ufw` (permite SSH, HTTP, HTTPS).
2.  **`vps-initial-setup.sh` (Ejecutar con `sudo`):**
    * Usuario `deploy` (sin sudo, en grupo `docker`), Docker, Docker Compose plugin, `rsync`. Crea directorios `/home/deploy/apps` y `/home/deploy/infra`. Configura clave SSH opcional para `deploy`. (Versión simplificada v4 para Traefik).

## Despliegue y Actualización de la Infraestructura

El stack de infraestructura base (Traefik, Monitoreo) se gestiona de forma diferente a las aplicaciones.

1.  **Generación/Actualización Local:** Usa el generador `nx g @mi-org/vps:create <infraName> ...` para crear o actualizar los archivos de configuración (`docker-compose-infra.yml`, `traefik.yml`, etc.) en tu directorio local del workspace (ej. `infra/<infraName>`). Haz commit de estos cambios en Git.
2.  **Prerrequisitos del Primer Despliegue (Manual en VPS):**
    * Asegúrate de que el servidor VPS ha sido inicializado con los scripts `debian-harden.sh` y `vps-initial-setup.sh`.
    * **Crea y configura el archivo `.env`:** Copia el `.env.template` generado a `.env` dentro del directorio de destino en el servidor (ej. `/home/deploy/infra/.env`) y rellénalo con los secretos necesarios (ej. API keys/tokens para el proveedor DNS si Traefik usará DNS-01 challenge). Este archivo **NO** debe estar en Git. El workflow fallará si falta este archivo y el template sí existe.
    * **Configura DNS:** Asegúrate de que los registros DNS para los subdominios de infraestructura (ej. `traefik.<baseDomain>`, `grafana.<baseDomain>`) apunten a la IP del VPS.
3.  **Despliegue/Actualización (Manual Trigger vía GitHub Actions):**
    * Ve a la pestaña "Actions" de tu repositorio en GitHub.
    * Selecciona el workflow "Deploy VPS Infrastructure Stack (Manual)".
    * Haz clic en "Run workflow". Puedes ajustar los inputs si es necesario (como la ruta local a la configuración si no es la default `infra/main`).
    * El workflow (`.github/workflows/cd-infra.yml`) se ejecutará:
        * Hará checkout del código de tu repositorio Git.
        * Usará `rsync` para copiar los archivos de configuración commiteados (desde `infra/<infraName>`) a `/home/deploy/infra/` en el VPS (excluyendo `.env`).
        * Ejecutará `docker compose -f docker-compose-infra.yml up -d` en el servidor como usuario `deploy`.
      
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
*Este es un documento vivo que refleja la arquitectura objetivo con Traefik.*



tools/vps/
├── README.md                  # <--- Este archivo que acabamos de actualizar
├── package.json               # Dependencias del plugin (ej. js-yaml)
├── tsconfig.json              # Configuración TS del plugin
└── src/
    ├── generators/
    │   ├── create/            # Generador vps:create (setup-infra)
    │   │   ├── schema.json
    │   │   ├── schema.d.ts
    │   │   ├── generator.ts   # Lógica principal (genera configs infra)
    │   │   ├── index.ts       # Exportador
    │   │   └── lib/           # Helpers para 'create'
    │   │       └── utils.ts   # (Ej: getDefaultBranch si aún se usa en logs)
    │   └── remove/            # Generador vps:remove (remove-infra-config)
    │       ├── schema.json
    │       ├── schema.d.ts
    │       ├── generator.ts   # Lógica principal (llama a nx remove)
    │       └── index.ts       # Exportador
    ├── infra-blueprints/      # <--- NUEVO: Plantillas para la INFRAESTRUCTURA
    │   ├── docker-compose-infra.yml.template
    │   ├── traefik.yml.template
    │   ├── .env.template
    │   ├── prometheus.yml.template
    │   ├── loki-config.yml.template
    │   └── promtail-config.yml.template
    └── scripts/                 # Scripts de setup manual para el VPS
        ├── debian-harden.sh
        └── vps-initial-setup.sh # Versión simplificada v4 (Traefik)
