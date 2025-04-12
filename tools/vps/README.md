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

## Flujo de Trabajo Recomendado para un Nuevo VPS

Para configurar un nuevo servidor VPS desde cero y prepararlo para los despliegues gestionados por este generador, sigue estos pasos en orden:

1.  **Crea el VPS:** En tu proveedor (DigitalOcean, Google Cloud, etc.), crea una nueva instancia/droplet. Se recomienda usar **Debian 12** o la última **Ubuntu LTS**.
2.  **Acceso Inicial:** Conéctate inicialmente al servidor como `root` o el usuario inicial proporcionado por el proveedor vía SSH.
3.  **Script de Hardening Base (`debian-harden.sh`):**
    * **Propósito:** Establecer la seguridad base del SO, crear tu usuario administrador personal con `sudo`, configurar acceso SSH por clave para ese usuario, deshabilitar login de root y contraseñas SSH, y configurar el firewall UFW.
    * **Ejecución:**
        * Copia el script al servidor: `scp tools/vps/scripts/debian-harden.sh root@TU_VPS_IP:/root/`
        * Conéctate como root: `ssh root@TU_VPS_IP`
        * Dale permisos de ejecución: `chmod +x /root/debian-harden.sh`
        * Ejecútalo: `bash /root/debian-harden.sh` (No necesita `sudo` si ya eres root).
        * Sigue las instrucciones del script (te pedirá nombre de usuario sudo, clave pública SSH, confirmaciones).
        * **¡MUY IMPORTANTE!** Antes de cerrar la sesión de root, abre OTRA terminal y verifica que puedes acceder con tu nuevo usuario sudo y su clave SSH (`ssh tu_usuario_sudo@TU_VPS_IP`). Verifica que puedes usar `sudo` con él.
        * Cierra la sesión de root.
4.  **Script de Preparación del Entorno (`vps-initial-setup.sh`):**
    * **Propósito:** Instalar Docker, Docker Compose, Certbot y sus plugins DNS. Crear el usuario `deploy` (sin sudo, pero en el grupo `docker`). Configurar directorios necesarios y guiar en la configuración de secretos para Certbot. Opcionalmente configurar clave SSH para `deploy`.
    * **Ejecución:**
        * Copia el script al servidor (puedes usar tu usuario sudo): `scp tools/vps/scripts/vps-initial-setup.sh tu_usuario_sudo@TU_VPS_IP:/home/tu_usuario_sudo/`
        * Conéctate como tu usuario sudo: `ssh tu_usuario_sudo@TU_VPS_IP`
        * Dale permisos de ejecución: `chmod +x /home/tu_usuario_sudo/vps-initial-setup.sh`
        * Ejecútalo con `sudo`: `sudo bash /home/tu_usuario_sudo/vps-initial-setup.sh`
        * Sigue las instrucciones (te pedirá la clave pública SSH para `deploy` - opcional pero recomendado, te guiará sobre los secretos DNS).
        * **¡IMPORTANTE!** Si el script añadió `deploy` al grupo `docker`, el usuario `deploy` necesita cerrar sesión y volver a entrar para que el grupo tenga efecto (esto es relevante si te conectaras manualmente como `deploy`, el CD no necesita re-login).
5.  **Generador Nx (`vps:create`):**
    * **Propósito:** Crear la configuración específica para un sitio/aplicación en este VPS (archivos Docker Compose, Nginx, deploy script) y actualizar el workflow de CD.
    * **Ejecución (En tu máquina local, dentro del monorepo):**
        ```bash
        nx g @mi-org/vps:create --name=nombre-del-vps-o-app # Ajusta el scope @mi-org
        ```
6.  **Despliegue (CD):**
    * Haz commit y push de los cambios generados a tu repositorio Git.
    * El workflow `.github/workflows/cd-deploy.yml` (que el generador creó/actualizó) se ejecutará automáticamente (en push a `main`, según nuestra configuración), copiará los archivos de `apps/nombre-del-vps-o-app/` al servidor y ejecutará `deploy.sh` allí usando el usuario `deploy`.

## Configuración de GitHub Actions

El generador `vps:create` crea o actualiza el workflow `.github/workflows/cd-deploy.yml` para automatizar los despliegues. Para que funcione correctamente, necesitas configurar los siguientes "Secrets" en tu repositorio de GitHub (`Settings` > `Secrets and variables` > `Actions` > `Repository secrets`):

Para CADA configuración de VPS generada (ej. llamada `my-vps-name`):

* **`VPS_MY_VPS_NAME_HOST`**: La IP o FQDN del servidor VPS.
* **`VPS_MY_VPS_NAME_USER`**: El usuario SSH para el despliegue (normalmente `deploy`).
* **`VPS_MY_VPS_NAME_KEY`**: La **clave privada** SSH completa (incluyendo `-----BEGIN...` y `-----END...`) correspondiente a la clave pública configurada para el usuario `deploy` en el VPS.

**Nota:** El nombre del secret se deriva del nombre del proyecto VPS, convirtiéndolo a mayúsculas y reemplazando guiones (`-`) por guiones bajos (`_`). El workflow usa estos secrets dinámicamente para conectarse al servidor correcto.


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
