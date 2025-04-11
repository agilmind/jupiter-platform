#!/bin/bash
# ==============================================================================
# VPS Initial Setup Script
# ==============================================================================
# Description: Automates the initial setup of a Debian/Ubuntu based VPS
#              according to the strategy defined for the Nx Monorepo VPS generator.
#              Sets up deploy user, installs Docker, Certbot, configures directories,
#              and provides guidance for DNS API credentials.
# Usage:       Run as root: sudo bash vps-initial-setup.sh
# Idempotent:  Attempts to be idempotent (safe to run multiple times).
# ==============================================================================

# --- Strict Mode ---
set -euo pipefail

# --- Constants ---
readonly SCRIPT_NAME=$(basename "$0")
readonly DEPLOY_USER="deploy"
readonly DEPLOY_HOME="/home/${DEPLOY_USER}"
readonly APPS_DIR="${DEPLOY_HOME}/apps"
readonly VPS_DIR="${DEPLOY_HOME}/vps" # For common docker-compose etc.
readonly CERTS_DIR="${DEPLOY_HOME}/certs" # May not be used if certs stay in /etc/letsencrypt
readonly SECRETS_DIR="${DEPLOY_HOME}/.secrets" # For API credentials etc.
readonly WEBROOT_CHALLENGE_DIR="/var/www/letsencrypt/live" # Certbot webroot challenges path (owned by root)

# --- Colors For Output ---
readonly COLOR_GREEN='\033[0;32m'
readonly COLOR_YELLOW='\033[1;33m'
readonly COLOR_BLUE='\033[0;34m'
readonly COLOR_RED='\033[0;31m'
readonly COLOR_NC='\033[0m' # No Color

# --- Helper Functions ---
info() {
    echo -e "${COLOR_BLUE}[INFO]${COLOR_NC} $1"
}

warn() {
    echo -e "${COLOR_YELLOW}[WARN]${COLOR_NC} $1"
}

error_exit() {
    echo -e "${COLOR_RED}[ERROR]${COLOR_NC} $1" >&2
    exit 1
}

success() {
    echo -e "${COLOR_GREEN}[SUCCESS]${COLOR_NC} $1"
}

prompt_continue() {
    # Wrap prompt text for better readability
    local prompt_text="$1"
    local max_width=80 # Adjust as needed
    local formatted_prompt
    formatted_prompt=$(fold -s -w ${max_width} <<< "${prompt_text}")

    echo -e "${formatted_prompt}"
    read -p "$(echo -e "${COLOR_YELLOW}[ACTION]${COLOR_NC} Press Enter to continue, or Ctrl+C to abort...")"
}

# --- Check Root ---
check_root() {
    info "Checking execution privileges..."
    if [[ "${EUID}" -ne 0 ]]; then
        error_exit "This script must be run as root (e.g., using sudo)."
    fi
    success "Running with root privileges."
}

# --- Create Deploy User ---
create_deploy_user() {
    info "Checking user '${DEPLOY_USER}'..."
    if id -u "${DEPLOY_USER}" &>/dev/null; then
        info "User '${DEPLOY_USER}' already exists."
    else
        info "Creating user '${DEPLOY_USER}'..."
        # Use adduser for interactive password setup etc.
        adduser --gecos "" "${DEPLOY_USER}" || error_exit "Failed to create user '${DEPLOY_USER}'. Please check logs/output."
        # Add user to sudo group? Decided against it to enforce least privilege for deploy user later.
        # If initial setup needs deploy user with sudo, add: usermod -aG sudo "${DEPLOY_USER}"
        success "User '${DEPLOY_USER}' created."
    fi
}

# --- Install Required Packages ---
install_packages() {
    info "Updating package lists (apt update)..."
    apt-get update -y || error_exit "Failed to run apt update. Check network connection and apt sources."

    # --- Define required packages ---
    # Prereqs for Docker repo, Docker itself, Certbot and DNS plugins
    local packages=(
        ca-certificates curl gnupg apt-transport-https lsb-release # Base prereqs
        docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin # Docker
        certbot
        python3-certbot-dns-cloudflare # Cloudflare DNS plugin
        python3-certbot-dns-digitalocean # DigitalOcean DNS plugin
        # Add other plugins if needed e.g.: python3-certbot-dns-google
        # Deliberately excluding python3-certbot-nginx unless specifically required for legacy certs
    )
    local packages_to_install=()
    local docker_needed=false

    info "Checking required system packages..."
    for pkg in "${packages[@]}"; do
        # Using dpkg-query for robust check
        if ! dpkg-query -W -f='${Status}' "${pkg}" 2>/dev/null | grep -q "ok installed"; then
            info "Package '${pkg}' marked for installation."
            packages_to_install+=("${pkg}")
            if [[ "${pkg}" == "docker-ce" ]]; then
                docker_needed=true
            fi
        else
            info "Package '${pkg}' is already installed."
        fi
    done

    if [[ ${#packages_to_install[@]} -gt 0 ]]; then
        info "Attempting to install missing packages: ${packages_to_install[*]}..."

        # --- Set up Docker repository if Docker is needed ---
        if [[ "${docker_needed}" == true ]]; then
            info "Setting up Docker apt repository..."
            # Add Docker's official GPG key:
            install -m 0755 -d /etc/apt/keyrings
            if [[ -f /etc/apt/keyrings/docker.gpg ]]; then
                warn "Docker GPG key already exists at /etc/apt/keyrings/docker.gpg. Skipping download."
            else
                 curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg || error_exit "Failed to download Docker GPG key."
                 chmod a+r /etc/apt/keyrings/docker.gpg || warn "Failed to set read permissions on Docker GPG key."
            fi

            # Add the repository to Apt sources:
            local os_codename
            os_codename=$(lsb_release -cs)
             if [[ -z "${os_codename}" ]]; then
                 error_exit "Could not determine OS codename (lsb_release -cs failed)."
            fi
            info "Detected OS codename: ${os_codename}"
            echo \
              "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
              ${os_codename} stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
            info "Docker repository added. Running apt update again..."
            apt-get update -y || error_exit "Failed to run apt update after adding Docker repo."
        fi

        # --- Install all missing packages ---
        info "Running apt-get install for missing packages..."
        DEBIAN_FRONTEND=noninteractive apt-get install -y "${packages_to_install[@]}" || error_exit "Failed to install packages. Check apt logs."
        success "Missing packages installed successfully."
    else
        success "All required packages were already installed."
    fi
}

# --- Setup Docker Group for Deploy User ---
setup_docker_group() {
    info "Checking Docker group membership for user '${DEPLOY_USER}'..."
    # Ensure user exists before checking group
    if ! id -u "${DEPLOY_USER}" &>/dev/null; then
        warn "User '${DEPLOY_USER}' does not exist. Cannot configure Docker group."
        return 1
    fi

    # Check if user is already in the docker group
    if groups "${DEPLOY_USER}" | grep -q -w "docker"; then
        info "User '${DEPLOY_USER}' is already in the 'docker' group."
    else
        # Check if docker group exists (it should after docker install)
        if ! getent group docker > /dev/null; then
            error_exit "Docker group 'docker' does not exist. Docker installation might have failed."
        fi
        info "Adding user '${DEPLOY_USER}' to the 'docker' group..."
        usermod -aG docker "${DEPLOY_USER}" || error_exit "Failed to add user '${DEPLOY_USER}' to docker group."
        success "User '${DEPLOY_USER}' added to 'docker' group."
        # This is crucial for the user!
        warn "User '${DEPLOY_USER}' MUST log out and log back in for Docker group changes to take effect!"
    fi
}

# --- Create and Configure Directories ---
setup_directories() {
    info "Setting up required directories and permissions..."
    # Define directories and their owners/permissions
    # Format: "path:owner:group:permissions"
    local dir_specs=(
        "${APPS_DIR}:deploy:deploy:755"
        "${VPS_DIR}:deploy:deploy:755"
        "${CERTS_DIR}:deploy:deploy:755" # May not be used often
        "${SECRETS_DIR}:root:root:700" # Secrets owned by root, restricted access
        "${WEBROOT_CHALLENGE_DIR}:root:root:755" # Webroot owned by root, accessible by webserver group implicitly? Check Certbot docs. Let's start with 755.
    )

    # Ensure deploy user home exists and has correct base ownership
    if [[ -d "${DEPLOY_HOME}" ]]; then
         chown "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_HOME}" || warn "Could not chown ${DEPLOY_HOME}. Check permissions."
    else
        warn "Deploy user home directory ${DEPLOY_HOME} not found. Skipping ownership check."
    fi


    for spec in "${dir_specs[@]}"; do
        IFS=':' read -r dir owner group perms <<< "$spec"

        if [[ -z "$dir" || -z "$owner" || -z "$group" || -z "$perms" ]]; then
            warn "Skipping invalid directory spec: ${spec}"
            continue
        fi

        # Resolve user/group IDs
        local uid
        local gid
        uid=$(id -u "$owner" 2>/dev/null) || error_exit "Owner user '$owner' not found."
        gid=$(getent group "$group" | cut -d: -f3 2>/dev/null) || error_exit "Owner group '$group' not found."


        if [[ ! -d "${dir}" ]]; then
            info "Creating directory: ${dir}"
            mkdir -p "${dir}" || error_exit "Failed to create directory ${dir}."
            info "Directory ${dir} created."
        else
            info "Directory ${dir} already exists."
        fi

        # Set ownership and permissions
        info "Setting ownership ${owner}:${group} and permissions ${perms} for ${dir}..."
        chown -R "${uid}:${gid}" "${dir}" || error_exit "Failed to set ownership for ${dir}."
        chmod "${perms}" "${dir}" || error_exit "Failed to set permissions for ${dir}." # Set perms on the dir itself
         # Optionally set perms recursively if needed, but usually top-level is enough initially
         # chmod -R "${perms}" "${dir}" # Be careful with recursive permissions

    done

    success "Required directories created/verified with correct ownership and permissions."
}


# --- Provide Guidance for Setting Up Secrets ---
setup_secrets_guidance() {
    info "Setting up placeholder files for DNS provider API credentials (required for DNS-01 challenge)..."
    local cloudflare_ini="${SECRETS_DIR}/cloudflare.ini"
    local digitalocean_ini="${SECRETS_DIR}/digitalocean.ini"
    # Add more providers here if needed

    # Touch files if they don't exist
    touch "${cloudflare_ini}" "${digitalocean_ini}" || warn "Could not touch .ini files."

    # Ensure correct ownership and permissions (should be root:root 600 based on setup_directories)
    chown root:root "${cloudflare_ini}" "${digitalocean_ini}" || error_exit "Failed to set ownership for .ini files."
    chmod 600 "${cloudflare_ini}" "${digitalocean_ini}" || error_exit "Failed to set permissions for .ini files."

    # --- Display Instructions ---
    echo -e "+--------------------------------------------------------------------+"
    echo -e "| ${COLOR_YELLOW}ACCIÓN REQUERIDA: Configuración de Credenciales DNS para Certbot${COLOR_NC} |"
    echo -e "+--------------------------------------------------------------------+"
    echo -e "| Para usar la validación DNS de Let's Encrypt (necesario para wildcards):"
    echo -e "|"
    echo -e "| 1. Edita los siguientes archivos ${COLOR_YELLOW}COMO ROOT${COLOR_NC} (ej: sudo nano /ruta/al/archivo):"
    echo -e "|    - ${cloudflare_ini} (si usas Cloudflare)"
    echo -e "|    - ${digitalocean_ini} (si usas DigitalOcean DNS)"
    echo -e "|"
    echo -e "| 2. Obtén los ${COLOR_YELLOW}API Tokens${COLOR_NC} necesarios:"
    echo -e "|    - ${COLOR_BLUE}Cloudflare:${COLOR_NC} Crea un API Token (NO la clave global) con permisos: Zone:Read, DNS:Edit."
    echo -e "|    - ${COLOR_BLUE}DigitalOcean:${COLOR_NC} Crea un Personal Access Token (PAT) con permisos: Write."
    echo -e "|"
    echo -e "| 3. Pega el token en el archivo correspondiente, usando el formato exacto:"
    echo -e "|    - Cloudflare: ${COLOR_GREEN}dns_cloudflare_api_token = TU_TOKEN_CLOUDFLARE${COLOR_NC}"
    echo -e "|    - DigitalOcean: ${COLOR_GREEN}dns_digitalocean_token = TU_TOKEN_DIGITALOCEAN${COLOR_NC}"
    echo -e "|"
    echo -e "| ${COLOR_YELLOW}¡IMPORTANTE!${COLOR_NC} Asegúrate de que los permisos del archivo sigan siendo ${COLOR_YELLOW}600${COLOR_NC} después de editar."
    echo -e "| (Solo root debe poder leer estos archivos)."
    echo -e "+--------------------------------------------------------------------+"

    prompt_continue "Pega tus tokens en los archivos .ini (si necesitas validación DNS)."
    success "Guidance for API credentials provided."
}

# --- Check Certbot Renewal Configuration ---
check_certbot_renewal_config() {
    info "Checking Certbot renewal configuration..."

    # Check for custom cron jobs for certbot renew (user crons and system crons)
    local found_cron=false
    if crontab -l -u root 2>/dev/null | grep -q 'certbot renew'; then
        warn "Custom root cron job found containing 'certbot renew'."
        found_cron=true
    fi
     if crontab -l -u "${DEPLOY_USER}" 2>/dev/null | grep -q 'certbot renew'; then
        warn "Custom '${DEPLOY_USER}' cron job found containing 'certbot renew'."
         found_cron=true
    fi
    if [[ -d /etc/cron.d ]] && grep -q -r --include='*' 'certbot renew' /etc/cron.d/ /etc/crontab; then
         warn "Cron job found in /etc/cron.d/ or /etc/crontab containing 'certbot renew'."
         found_cron=true
    fi

    if [[ "${found_cron}" == true ]]; then
         warn "Recommend removing custom cron jobs to rely solely on the systemd timer for renewals."
    else
        info "No obvious custom cron jobs found for 'certbot renew'."
    fi


    # Check systemd timer status
    info "Checking status of 'certbot.timer'..."
    if systemctl list-timers | grep -q 'certbot.timer'; then
        info "Systemd timer 'certbot.timer' exists."
        if systemctl is-active --quiet certbot.timer; then
            success "'certbot.timer' is active. This is the recommended way to handle renewals."
        else
             warn "'certbot.timer' is present but INACTIVE. Automatic renewals will not run."
             warn "You may need to enable and start it: sudo systemctl enable --now certbot.timer"
        fi
    else
        warn "Standard systemd timer 'certbot.timer' NOT FOUND."
        warn "Automatic renewal via systemd is likely not configured. Check Certbot installation."
    fi
    success "Certbot renewal check complete."
}

# --- Main Function ---
main() {
    info "================================================="
    info " Starting VPS Initial Setup Script (${SCRIPT_NAME}) "
    info "================================================="
    check_root
    create_deploy_user
    install_packages
    setup_docker_group
    setup_directories
    setup_secrets_guidance
    check_certbot_renewal_config
    echo # Blank line for readability
    success "================================================="
    success " VPS Initial Setup Script completed! "
    success "================================================="
    warn ">>> IMPORTANT: If user '${DEPLOY_USER}' was added to the 'docker' group, they MUST log out and log back in for changes to take effect! <<<"
    info "Review the output above for any warnings or required actions (like setting API tokens)."
    info "Refer to the project README for next steps (using Nx generators, deploying apps)."
}

# --- Execute Main Function ---
main

exit 0
