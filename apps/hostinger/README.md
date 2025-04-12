# Configuration for VPS: hostinger

This directory contains the generated configuration files intended for the Virtual Private Server instance related to **hostinger**.

Files managed by the `@mi-org/vps` Nx generator (scope: `hostinger`).

**Current Stage:** Hello World (Phase 1) - Basic structure and simulated deployment script.

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
_ El CD workflow (`.github/workflows/cd-deploy.yml`) requiere los siguientes secrets para **este despliegue (`hostinger`)** configurados en GitHub (`Settings` > `Secrets and variables` > `Actions` > `Repository secrets`):
_ **`VPS_HOSTINGER_HOST`**: IP Address o FQDN del servidor.
_ **`VPS_HOSTINGER_USER`**: Usuario SSH (normalmente `deploy`).
_ **`VPS_HOSTINGER_KEY`**: La **CLAVE PRIVADA** SSH completa.
_ **Generación:** Esta clave pertenece a un par (pública/privada) que debes generar **específicamente** para despliegues (¡NO uses tu clave personal!). En tu máquina local, puedes crearla con:
`bash
             # Elige un nombre de archivo descriptivo, ej: github_actions_deploy_key
             ssh-keygen -t ed25519 -f ~/.ssh/github_actions_deploy_key -C "VPS Deploy Key"
             # (Presiona Enter para no poner passphrase si la usarás directamente en secrets)
             `
_ **Uso:**
_ El contenido de la **clave pública** (`~/.ssh/github_actions_deploy_key.pub`) es el que debes proporcionar al script `vps-initial-setup.sh` (o añadir manualmente a `/home/deploy/.ssh/authorized_keys` en el servidor).
_ El contenido **completo** de la **clave privada** (el archivo `~/.ssh/github_actions_deploy_key`, incluyendo `-----BEGIN...` y `-----END...`) es el que debes pegar como valor del secret `VPS_HOSTINGER_KEY` en GitHub.

**3. Deployment Process:**

- Committing and pushing changes within this directory (`apps/hostinger/`) to the `main` branch will trigger the GitHub Actions workflow.
- The workflow will:
  - Determine if this project (`hostinger`) was affected.
  - (Phase 2+) Connect to the server using the configured secrets (e.g., `VPS_HOSTINGER_HOST`, etc.).
  - (Phase 2+) Copy the files from this directory to `/home/deploy/apps/hostinger/` on the server.
  - (Phase 2+) Execute `./deploy.sh` within that directory on the server as the `deploy` user.
  - (Phase 1 - Current) The workflow currently only simulates these deployment steps.

**Refer to `tools/vps/README.md` for the full project strategy and advanced configuration details.**
