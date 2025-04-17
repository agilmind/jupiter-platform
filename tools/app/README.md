# Generador de Aplicaciones Desplegables (`tools/app`)

Este directorio contiene las herramientas y generadores Nx (`@agilmind/app`) para crear diferentes tipos de componentes de aplicación, diseñados para desplegarse sobre la infraestructura VPS gestionada por `@agilmind/vps`.

## Filosofía

La idea es separar la generación de la infraestructura base (con `@agilmind/vps`) de la generación de las aplicaciones individuales. Cada aplicación generada aquí es autocontenida en términos de su código y configuración Docker, pero se integra con la infraestructura compartida (proxy Traefik, red `webproxy`, servicios compartidos opcionales).

## Generadores Disponibles

1.  **`@agilmind/app:create`:**
    * **Propósito:** Generar la estructura base, Dockerfile, `docker-compose-app.yml` (con etiquetas Traefik), y archivos iniciales para un nuevo componente de aplicación dentro de un proyecto lógico.
    * **Ubicación:** Crea la aplicación en `apps/<projectName>/<appName>`.
    * **Opciones Principales:**
        * `projectName`: Nombre del proyecto lógico al que pertenece la app (ej. `jupiter`).
        * `appName`: Nombre del componente específico dentro del proyecto (ej. `www`, `api`, `email-worker`).
        * `appType`: El tipo de aplicación a generar (ver tipos soportados).
        * `domain`: El dominio completo bajo el cual será accesible (ej. `www.jupiter.ar`).
        * `tags`: Etiquetas Nx para organización (opcional).
    * **Tipos de Aplicación Soportados (`appType`):**
        * `static`: Un sitio web HTML estático simple servido por Nginx. **(Implementado)**
        * `apollo-prisma`: *(Pendiente)* API GraphQL con Apollo Server, Prisma y conexión a Postgres (requiere stack `shared-infra`).
        * `worker`: *(Pendiente)* Un worker genérico para tareas asíncronas (requiere stack `shared-infra` con RabbitMQ).
        * `react`: *(Pendiente)* Aplicación Frontend React (probablemente usando Vite).
        * `react-native`: *(Pendiente)* Esqueleto para app React Native.
    * **Salida:** Además de los archivos de la aplicación, genera un `README.md` específico para esa aplicación con instrucciones de despliegue y configuración.

2.  **`@agilmind/app:remove`:**
    * **Propósito:** Eliminar una aplicación generada del workspace Nx (elimina directorio y configuración Nx).
    * **Opciones:** `projectName`, `appName`.
    * **Acción:** Delega a las utilidades de Nx para eliminar el proyecto. No afecta el despliegue en el servidor.

## Despliegue (`.github/workflows/cd-deploy.yml`)

Las aplicaciones generadas están diseñadas para ser desplegadas usando un workflow de CI/CD como `.github/workflows/cd-deploy.yml`, que típicamente:
* Detecta cambios en `apps/` usando `nx affected`.
* Construye y publica imágenes Docker en un registro (ej. GHCR).
* Sincroniza `docker-compose-app.yml` al servidor.
* Actualiza el archivo `.env` en el servidor con el tag de la imagen específica.
* Se autentica en el registro Docker desde el servidor.
* Ejecuta `docker compose pull` y `docker compose up -d` remotamente.

## Próximos Pasos de Desarrollo (Generadores)

1.  **Crear Generador `@agilmind/vps:create-shared-infra`:** Añadir un generador al plugin `@agilmind/vps` para crear stacks de servicios compartidos por proyecto (Postgres, PgBouncer, RabbitMQ) en directorios como `infra/<projectName>-shared/`.
2.  **Implementar `appType: apollo-prisma`:** Desarrollar la plantilla y lógica en `@agilmind/app:create` para generar una API GraphQL funcional que se conecte a la base de datos del stack `shared-infra`.
3.  Implementar otros `appType` (workers, react, etc.).
4.  Refinar el workflow `cd-deploy.yml` (ej. limpieza de imágenes antiguas, notificaciones).
5.  Implementar estrategia de `staging`.

## Continuidad del Chat con Gemini

Para retomar este trabajo en una nueva sesión de chat:

1.  **Objetivo:** "Continuando desarrollo de generadores Nx `@agilmind/app` y `@agilmind/vps` para aplicaciones desplegables y servicios compartidos."
2.  **Contexto Principal:** Pega el contenido completo de **este archivo `tools/app/README.md`** y del archivo `tools/vps/README.md`.
3.  **Archivos Clave (Prepárate para Copiar Contenido si se Pide):**
    * `tools/app/src/generators/create/schema.json` y `generator.ts`
    * `tools/app/src/app-blueprints/static/` (y otros blueprints a medida que se creen)
    * `tools/app/README.md` (Este archivo)
    * `tools/vps/src/generators/create/schema.json` y `generator.ts` (El de infra base)
    * `tools/vps/README.md` (El README de infra base)
    * `.github/workflows/cd-deploy.yml` (Workflow de despliegue de apps)
    * `.github/workflows/cd-infra.yml` (Workflow de despliegue de infra)
    * *(Futuro)* `tools/vps/src/generators/create-shared-infra/schema.json` y `generator.ts`
4.  **Siguiente Paso:** Indica qué quieres hacer según los "Próximos Pasos de Desarrollo" arriba (ej. "Definamos el schema y la lógica inicial para el generador `vps:create-shared-infra`").

---
