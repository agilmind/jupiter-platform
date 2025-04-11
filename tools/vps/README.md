# Generador de Configuración VPS (`tools/vps`)

Este directorio contiene un generador Nx (`@mi-org/vps`) para facilitar la creación y gestión de configuraciones para desplegar aplicaciones en Servidores Virtuales Privados (VPS) dentro de este monorepo.

## Objetivos

* **Scaffolding:** Generar la estructura de archivos necesaria (Nginx, Docker Compose, scripts de despliegue, etc.) para configurar un VPS.
* **Consistencia:** Asegurar que todas las configuraciones de VPS sigan un patrón estándar y robusto.
* **Despliegue Continuo (CD):** Integrar con GitHub Actions para automatizar el despliegue de los cambios en las configuraciones de VPS (`.github/workflows/cd-deploy.yml`).
* **Simplicidad y Robustez:** Buscar soluciones profesionales, mantenibles y seguras.

## Filosofía y Decisiones Clave

* **Desarrollo Incremental:** Avanzamos "paso a paso", comenzando con un "Hello World" y añadiendo complejidad gradualmente.
* **Nx `affected`:** Utilizamos `nx affected --target=deploy` en el workflow de CD para desplegar únicamente los proyectos VPS que han cambiado.
* **Sin `sudo` en CD:** **Fundamental:** El usuario `deploy` en el VPS **no** debe requerir `sudo` para ejecutar las tareas de despliegue automatizadas por GitHub Actions. Esto se logra mediante la configuración inicial del servidor y el uso de Docker.
* **Containerización (Nginx):** **Decisión Confirmada:** Nginx se ejecutará dentro de un contenedor Docker gestionado por `docker-compose`. Esto facilita la gestión de permisos, la consistencia y evita la necesidad de `sudo` para recargar la configuración durante el CD.

## Configuración Inicial del VPS (Manual, Una Sola Vez)

Antes de poder desplegar la configuración generada por `vps:create` de forma automatizada y sin `sudo`, se requieren los siguientes pasos manuales en cada VPS nuevo:

1.  **Crear Usuario `deploy`:**
    * `sudo adduser deploy`

2.  **Instalar Software Esencial:**
    * **Docker Engine & Compose:** Sigue la [guía oficial](https://docs.docker.com/engine/install/). Incluye `docker-compose-plugin`.
    * **Certbot:** Para certificados Let's Encrypt.
        ```bash
        sudo apt update && sudo apt install certbot -y
        ```
    * **(Opcional) Plugins DNS para Certbot:** Si planeas usar validación DNS (necesaria para wildcards), instala el plugin correspondiente a tu proveedor:
        * **Cloudflare:** `sudo apt install python3-certbot-dns-cloudflare -y`
        * **DigitalOcean:** `sudo apt install python3-certbot-dns-digitalocean -y`
        * (Existen plugins para otros proveedores).
    * **(Opcional/Compatibilidad) Plugin Nginx para Certbot:** Solo si necesitas gestionar certificados *existentes* que usaban este plugin. Para *nuevas* configuraciones, **no** lo usaremos.
        ```bash
        # Solo si es estrictamente necesario para compatibilidad:
        # sudo apt install python3-certbot-nginx -y
        ```

3.  **Añadir `deploy` al Grupo `docker`:**
    * ¡Crucial para operar Docker sin `sudo`!
    * `sudo usermod -aG docker deploy`
    * El usuario `deploy` debe **cerrar sesión y volver a entrar** para que el cambio surta efecto.

4.  **Crear Directorios Base (Ejemplo):**
    * `sudo mkdir -p /home/deploy/apps /home/deploy/certs /home/deploy/vps /home/deploy/.secrets /var/www/letsencrypt/live`
    * `sudo chown -R deploy:deploy /home/deploy/apps /home/deploy/certs /home/deploy/vps /home/deploy/.secrets`
    * `sudo chown -R root:root /var/www/letsencrypt` # Directorio para webroot, debe ser escribible por root

5.  **Verificar/Configurar Renovación Automática de Certbot:**
    * **Usar el Timer de Systemd:** Confía en el timer estándar (`certbot.timer`) que instala `apt`. Verifica que esté activo (`systemctl list-timers | grep certbot`). Este será el **único** disparador para `certbot renew`.
    * **Eliminar Crons Personalizados:** Quita cualquier cron job manual que ejecute `certbot renew` (como el que tenías para `jupiter_config`) para evitar duplicidad. Edita con `sudo crontab -e` o revisa `/etc/cron.d/`.
    * **Configurar Certificados Existentes:** Si tienes certificados previos (en `/etc/letsencrypt/renewal/`), edita sus archivos `.conf` con `sudo`:
        * Asegúrate de que `authenticator` sea `webroot` o el método DNS (`dns-cloudflare`, `dns-digitalocean`).
        * **Elimina** o comenta la línea `installer = ...` (debe ser `None` implícito).
        * Si usas `webroot`, añade `webroot_path = /var/www/letsencrypt/live` (o tu ruta elegida).
        * **Añade un `deploy_hook`** para reiniciar Nginx después de la renovación (ver sección Certificados).

## Estrategia de Gestión de Certificados (Let's Encrypt)

* **Objetivo:** Gestionar certificados SSL/TLS de forma automatizada, segura y compatible con Nginx en contenedor.
* **Renovación:** Centralizada a través del **Certbot del host**, disparado automáticamente por el **timer de systemd**.
* **Obtención/Autenticación (Nuevos Certificados):**
    * **Dominios Específicos (ej. `www.domain.com`, `api.domain.com`):**
        * **Método Recomendado:** `webroot`.
        * **Cómo:** Certbot (ejecutado como root por el timer) escribe un archivo de desafío en `webroot_path` (p. ej., `/var/www/letsencrypt/live`).
        * **Nginx (Contenedor):** Debe montar ese `webroot_path` (p. ej., a `/usr/share/nginx/html/challenges`) y tener una `location /.well-known/acme-challenge/ { root /usr/share/nginx/html/challenges; }`.
    * **Certificados Wildcard (ej. `*.domain.com`):**
        * **Método Requerido:** `DNS-01`. Necesita interactuar con tu proveedor de DNS.
        * **Cómo:** Certbot crea registros TXT temporales en tu zona DNS usando la API del proveedor.
        * **Plugins Necesarios:** Instalar el plugin DNS correspondiente (ver sección Instalación).

* **Configuración DNS-01 (Ejemplos):**
    * **1. Crear Archivo de Credenciales (¡Seguridad!):**
        * Guarda las credenciales de API en un archivo propiedad de `root` con permisos estrictos.
        * Ejemplo: `/home/deploy/.secrets/cloudflare.ini` o `/home/deploy/.secrets/digitalocean.ini`
        * `sudo touch /home/deploy/.secrets/provider.ini`
        * `sudo chown root:root /home/deploy/.secrets/provider.ini`
        * `sudo chmod 600 /home/deploy/.secrets/provider.ini`
    * **2. Contenido del Archivo:**
        * **Cloudflare:** Usa un **API Token** (NO la clave global) con permisos `Zone:Read`, `DNS:Edit` para la zona deseada.
          ```ini
          # /home/deploy/.secrets/cloudflare.ini
          dns_cloudflare_api_token = TU_CLOUDFLARE_API_TOKEN
          ```
        * **DigitalOcean:** Usa un **Personal Access Token (PAT)** con permisos de `Write`.
          ```ini
          # /home/deploy/.secrets/digitalocean.ini
          dns_digitalocean_token = TU_DIGITALOCEAN_PAT
          ```
    * **3. Comando de Obtención Inicial (Ejemplo Wildcard):**
        ```bash
        # Para Cloudflare:
        sudo certbot certonly \
            --dns-cloudflare \
            --dns-cloudflare-credentials /home/deploy/.secrets/cloudflare.ini \
            -d tudominio.com -d '*.tudominio.com' \
            --non-interactive --agree-tos --email tu@email.com --key-type ecdsa

        # Para DigitalOcean:
        sudo certbot certonly \
            --dns-digitalocean \
            --dns-digitalocean-credentials /home/deploy/.secrets/digitalocean.ini \
            -d tudominio.com -d '*.tudominio.com' \
            --non-interactive --agree-tos --email tu@email.com --key-type ecdsa
        ```
        * La renovación automática (vía systemd timer) usará estas credenciales.

* **Instalación del Certificado:**
    * **`installer = None`:** Certbot **no** debe intentar instalar el certificado automáticamente. La línea `installer` debe estar ausente o ser `None` en los archivos `/etc/letsencrypt/renewal/*.conf`.
    * **Montaje en Contenedor:** El directorio `/etc/letsencrypt/live/tudominio.com/` (que contiene `fullchain.pem` y `privkey.pem`) se monta como volumen de solo lectura dentro del contenedor Nginx.
    * **Configuración Nginx:** El archivo de configuración de Nginx *dentro* del contenedor apunta a las rutas de los certificados montados (p. ej., `ssl_certificate /etc/letsencrypt/live/tudominio.com/fullchain.pem;`).

* **Hook de Despliegue (`deploy_hook`):**
    * **Necesario:** Para que Nginx (en contenedor) use el certificado recién renovado.
    * **Acción:** Reinicia el contenedor Nginx correspondiente.
    * **Configuración:** Añade la línea `deploy_hook = COMANDO_REINICIO` en la sección `[renewalparams]` de cada archivo `/etc/letsencrypt/renewal/*.conf`.
    * **Comando Ejemplo:**
      ```ini
      # Dentro de [renewalparams] en el archivo .conf
      deploy_hook = docker compose -f /home/deploy/vps/docker-compose.vps.yml restart nginx # Ajusta 'nginx' al nombre de tu servicio
      ```

## Fases de Desarrollo

### Fase 1: "Hello World" (En Proceso)

* **Objetivo:** Validar la estructura básica de los generadores `vps:create` y `vps:remove`, y la creación/actualización inicial del workflow `cd-deploy.yml`.
* **Entregables:**
    * Generador `vps:create` crea:
        * `apps/<vps-name>/README.md`
        * `apps/<vps-name>/index.html` (simple)
        * `apps/<vps-name>/deploy.sh` (simulado, sin `sudo`)
        * `apps/<vps-name>/project.json` (con target `deploy` placeholder)
    * Generador `vps:create` crea/actualiza `.github/workflows/cd-deploy.yml` con estructura básica (trigger, jobs `determine-affected`, `deploy` con matriz dinámica y pasos simulados).
    * Generador `vps:remove` elimina el proyecto usando `@nx/workspace:remove`.
* **Próximos Pasos (Fase 2):** Introducir `docker-compose.yml` (en `/home/deploy/vps/` o generado en `apps/<vps-name>/`) con un contenedor Nginx básico sirviendo el `index.html`. Actualizar `deploy.sh` y el workflow de CD para manejar `docker-compose`.

---
*Este es un documento vivo y se actualizará a medida que el proyecto evolucione.*
