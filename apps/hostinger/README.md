# Configuration for VPS: hostinger

This directory contains the generated configuration files intended for the Virtual Private Server instance related to **hostinger**.

Files managed by the `@mi-org/vps` Nx generator (scope: `hostinger`).

**Current Stage:** Phase 2 - Basic Docker Compose/Nginx Deployment.

---

## Deployment Prerequisites & Instructions

Before the automated CD workflow can deploy this configuration, ensure the target server and GitHub repository are correctly set up.

**1. Server Initialization:**

- The target VPS must be initialized using the two setup scripts located in the `tools/vps/scripts/` directory of this repository:
  - `debian-harden.sh` (Run **first** on a fresh server as root)
  - `vps-initial-setup.sh` (Run **second** using sudo)
- These scripts install necessary software (Docker, Certbot), create the `deploy` user (in `docker` group), configure directories, and harden SSH.
- **Refer to `tools/vps/README.md` for detailed execution instructions.**

**2. GitHub Actions Secrets:**

- The CD workflow (`.github/workflows/cd-deploy.yml`) requires the following secrets for **this deployment (`hostinger`)** configured in GitHub (`Settings` > `Secrets and variables` > `Actions` > `Repository secrets`):

  - **`VPS_HOSTINGER_HOST`**: IP Address or FQDN of the target server.
  - **`VPS_HOSTINGER_USER`**: SSH username for deployment (usually `deploy`).
  - **`VPS_HOSTINGER_KEY`**: The **PRIVATE** SSH key.
    - **Generación:** Crea un par de claves (pública/privada) **específico** para despliegues (ej: `ssh-keygen -t ed25519 -f ~/.ssh/github_actions_deploy_key`). ¡NO USES tu clave personal!
    - **Uso:** La clave **pública** (`.pub`) se añade al `/home/deploy/.ssh/authorized_keys` del servidor (el script `vps-initial-setup.sh` te ayuda). La clave **privada** completa (incluyendo `-----BEGIN...` y `-----END...`) se pega como valor de este secret en GitHub.

  **3. Obtención Inicial Certificado SSL (¡Paso Manual Único!):**

  - **Antes** de que el CD pueda desplegar la configuración HTTPS por primera vez, necesitas obtener el certificado SSL inicial manualmente en el servidor VPS. Se recomienda usar **validación DNS** ya que no requiere que Nginx esté corriendo.
  - **Conéctate al VPS** como tu usuario administrador (con sudo).
  - **Ejecuta Certbot:** Usa el plugin DNS para tu proveedor (Cloudflare/DigitalOcean - asegúrate que los secrets `.ini` en `/home/deploy/.secrets/` estén configurados como indicó `vps-initial-setup.sh`). Reemplaza los dominios y email:

    ```bash
    # Ejemplo para Cloudflare (ajusta dominios y credenciales)
    sudo certbot certonly \
        --dns-cloudflare \
        --dns-cloudflare-credentials /home/deploy/.secrets/cloudflare.ini \
        --dns-cloudflare-propagation-seconds 60 \
     \
        --non-interactive --agree-tos --email tu@email.com --key-type ecdsa

    # Ejemplo para DigitalOcean:
    # sudo certbot certonly \\
    #     --dns-digitalocean \\
    #     --dns-digitalocean-credentials /home/deploy/.secrets/digitalocean.ini \\
    #     ... (lista de dominios con -d) ...
    ```

  - **Verifica:** Certbot debería confirmar la obtención exitosa. Los archivos estarán en `/etc/letsencrypt/live/jupiter.ar/`.

  **4. Configuración del Deploy Hook de Certbot (¡Paso Manual Único!):**

  - **Después** de obtener el certificado inicial, debes asegurarte de que Certbot reinicie Nginx automáticamente tras cada renovación futura.
  - **Edita el archivo de renovación** en el VPS (reemplaza `primaryDomain` por el tuyo):
    ```bash
    sudo nano /etc/letsencrypt/renewal/jupiter.ar.conf
    ```
  - **Añade/Verifica** la línea `deploy_hook` dentro de la sección `[renewalparams]`. Asegúrate que la ruta al `docker-compose.vps.yml` y el nombre del servicio (`nginx`) sean correctos:
    ```ini
    [renewalparams]
    # ... otras opciones ...
    deploy_hook = docker compose -f /home/deploy/apps/hostinger/docker-compose.vps.yml restart nginx
    ```
  - Guarda y cierra el archivo.

  **5. Deployment Process:**

  - Una vez completados los pasos 3 y 4, el CD vía GitHub Actions (desencadenado por `git push`) puede desplegar esta configuración.
  - El workflow copiará los archivos (incluyendo la config Nginx HTTPS) y ejecutará `deploy.sh`, que levantará el contenedor Nginx usando los certificados ya existentes. Las renovaciones futuras serán automáticas.

**Refer to `tools/vps/README.md` for the full project strategy and advanced configuration details.**
