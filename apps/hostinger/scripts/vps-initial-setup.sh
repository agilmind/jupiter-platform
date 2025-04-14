#!/bin/bash
# ==============================================================================
# VPS Initial Setup Script (v3 - Add SSH Key for Deploy User)
# ==============================================================================
# Description: Automates the initial setup of a Debian/Ubuntu based VPS
#              Sets up deploy user (with SSH key), installs Docker, Certbot,
#              configures directories, and provides guidance for DNS API credentials.
# Usage:       Run as root: sudo bash vps-initial-setup.sh
# ==============================================================================

# --- Strict Mode ---
set -euo pipefail

# --- Constants ---
readonly SCRIPT_NAME=$(basename "$0")
readonly DEPLOY_USER="deploy"
readonly DEPLOY_HOME="/home/${DEPLOY_USER}"
readonly APPS_DIR="${DEPLOY_HOME}/apps"
readonly VPS_DIR="${DEPLOY_HOME}/vps"
readonly CERTS_DIR="${DEPLOY_HOME}/certs"
readonly SECRETS_DIR="${DEPLOY_HOME}/.secrets"
readonly WEBROOT_CHALLENGE_DIR="/var/www/letsencrypt/live"

# --- Colors For Output ---
readonly COLOR_GREEN='\033[0;32m'
readonly COLOR_YELLOW='\033[1;33m'
readonly COLOR_BLUE='\033[0;34m'
readonly COLOR_RED='\033[0;31m'
readonly COLOR_NC='\033[0m' # No Color

# --- Helper Functions ---
info() { echo -e "${COLOR_BLUE}[INFO]${COLOR_NC} $1"; }
warn() { echo -e "${COLOR_YELLOW}[WARN]${COLOR_NC} $1"; }
error_exit() { echo -e "${COLOR_RED}[ERROR]${COLOR_NC} $1" >&2; exit 1; }
success() { echo -e "${COLOR_GREEN}[SUCCESS]${COLOR_NC} $1"; }
prompt_continue() {
    local prompt_text="$1"; local max_width=80; local formatted_prompt
    formatted_prompt=$(fold -s -w ${max_width} <<< "${prompt_text}")
    echo -e "${formatted_prompt}"
    read -p "$(echo -e "${COLOR_YELLOW}[ACTION]${COLOR_NC} Press Enter to continue, or Ctrl+C to abort...")"
}

# --- Check Root ---
check_root() {
    info "Checking execution privileges..."
    if [[ "${EUID}" -ne 0 ]]; then error_exit "This script must be run as root (e.g., using sudo)."; fi
    success "Running with root privileges."
}

# --- Create Deploy User (MODIFIED v3 - Add SSH Key Setup) ---
create_deploy_user() {
    info "Checking user '${DEPLOY_USER}'..."
    if id -u "${DEPLOY_USER}" &>/dev/null; then
        info "User '${DEPLOY_USER}' already exists."
    else
        info "Creating user '${DEPLOY_USER}'..."
        # Create user - adduser is interactive for password setup initially
        adduser --gecos "" "${DEPLOY_USER}" || error_exit "Failed to create user '${DEPLOY_USER}'. Please check logs/output."
        success "User '${DEPLOY_USER}' created."
    fi

    # --- Setup SSH Key for deploy user ---
    info "Configuring SSH key authentication for '${DEPLOY_USER}'..."
    local user_home="${DEPLOY_HOME}" # Use constant
    local ssh_dir="${user_home}/.ssh"
    local auth_keys_file="${ssh_dir}/authorized_keys"

    if [[ ! -d "$user_home" ]]; then error_exit "Home directory ${user_home} for user ${DEPLOY_USER} not found!"; fi
    chown "${DEPLOY_USER}:${DEPLOY_USER}" "$user_home" || warn "Could not chown ${user_home}."

    mkdir -p "$ssh_dir" || error_exit "Failed to create $ssh_dir."
    chmod 700 "$ssh_dir" || error_exit "Failed to set permissions on $ssh_dir."

    local pubkey=""
    echo -e "${COLOR_YELLOW}[INPUT]${COLOR_NC} Paste the entire SSH public key for user '${DEPLOY_USER}' (e.g., from id_ed25519.pub):"
    echo -e "       (Recommend using a key SEPARATE from your admin user's key)."
    echo -e "       (This key might be used by GitHub Actions or for manual debugging)."
    echo -e "       (Leave blank and press Enter if NO key-based access is needed for 'deploy')."
    read -p "> " pubkey

    if [[ -n "$pubkey" ]]; then
        if [[ ! "$pubkey" =~ ^(ssh-rsa|ecdsa-sha2-nistp|ssh-ed25519) ]]; then
             warn "Invalid SSH public key format provided. Skipping key addition."
        else
             # Add key, avoiding duplicates
             if grep -qF "$pubkey" "$auth_keys_file" 2>/dev/null; then
                 info "Public key already exists in ${auth_keys_file}."
             else
                 echo "$pubkey" >> "$auth_keys_file" || error_exit "Failed to add public key to $auth_keys_file."
                 info "Public key added to ${auth_keys_file}."
             fi
             chmod 600 "$auth_keys_file" || error_exit "Failed to set permissions on $auth_keys_file."
        fi
    else
        info "No public key provided for user '${DEPLOY_USER}'. Key-based login won't be set up by this script."
         if [[ ! -f "$auth_keys_file" ]]; then
             touch "$auth_keys_file" || warn "Could not touch empty authorized_keys file."
             # Set permissions even if empty, if dir was created
             chmod 600 "$auth_keys_file" || warn "Could not set permissions on empty authorized_keys file."
         fi
    fi

    # Set final ownership for .ssh dir and contents
    chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "$ssh_dir" || error_exit "Failed to set ownership on $ssh_dir."
    success "SSH configuration for user '${DEPLOY_USER}' complete."
}


install_packages() {
    info "Updating package lists (apt update)..."
    apt-get update -y || error_exit "Failed to run apt update. Check network connection and apt sources."
    local all_packages=( ca-certificates curl gnupg apt-transport-https lsb-release docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin certbot python3-certbot-dns-cloudflare python3-certbot-dns-digitalocean rsync )
    local repo_prereqs=( ca-certificates curl gnupg apt-transport-https lsb-release )
    local prereqs_to_install=() main_packages_to_install=() docker_ce_installed=true
    info "Checking system package status..."
    if ! dpkg-query -W -f='${Status}' "docker-ce" 2>/dev/null | grep -q "ok installed"; then
        docker_ce_installed=false; info "'docker-ce' needs installation. Checking repo prerequisites..."
        for pkg in "${repo_prereqs[@]}"; do if ! dpkg-query -W -f='${Status}' "${pkg}" 2>/dev/null | grep -q "ok installed"; then info "Repo prerequisite '${pkg}' marked for installation."; prereqs_to_install+=("${pkg}"); fi; done
        if [[ ${#prereqs_to_install[@]} -gt 0 ]]; then info "Installing repository prerequisites: ${prereqs_to_install[*]}..."; DEBIAN_FRONTEND=noninteractive apt-get install -y "${prereqs_to_install[@]}" || error_exit "Failed to install repository prerequisites."; success "Repository prerequisites installed."; else info "All repository prerequisites are already installed."; fi
        info "Setting up Docker apt repository..."; install -m 0755 -d /etc/apt/keyrings
        if [[ -f /etc/apt/keyrings/docker.gpg ]]; then
            warn "Docker GPG key exists. Verifying..."; if ! gpg --dearmor --quiet --no-tty --output /dev/null /etc/apt/keyrings/docker.gpg; then warn "Existing key invalid/corrupted. Replacing."; rm -f /etc/apt/keyrings/docker.gpg; curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg || error_exit "Failed to download Docker GPG key."; chmod a+r /etc/apt/keyrings/docker.gpg || warn "Failed to set key permissions."; else info "Existing Docker GPG key seems valid."; fi
        else info "Downloading Docker GPG key..."; curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg || error_exit "Failed to download Docker GPG key."; chmod a+r /etc/apt/keyrings/docker.gpg || warn "Failed to set key permissions."; fi
        local os_codename; os_codename=$(lsb_release -cs); if [[ -z "${os_codename}" ]]; then error_exit "Could not determine OS codename."; fi; info "Detected OS codename: ${os_codename}"
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian ${os_codename} stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
        info "Docker repository added/verified. Running apt update again..."; apt-get update -y || error_exit "Failed to run apt update after adding Docker repo."
    else info "'docker-ce' is already installed. Skipping Docker repo setup."; fi
    info "Checking final list of required packages..."; local final_package_check_needed=false
    for pkg in "${all_packages[@]}"; do if ! dpkg-query -W -f='${Status}' "${pkg}" 2>/dev/null | grep -q "ok installed"; then if ! printf '%s\n' "${prereqs_to_install[@]}" | grep -q -x "$pkg"; then info "Package '${pkg}' marked for final installation."; main_packages_to_install+=("${pkg}"); final_package_check_needed=true; fi; else info "Package '${pkg}' already installed."; fi; done
    if [[ "${final_package_check_needed}" == true && ${#main_packages_to_install[@]} -gt 0 ]]; then
        info "Running final apt-get install for: ${main_packages_to_install[*]}..."; local unique_final_packages; unique_final_packages=$(printf "%s\n" "${main_packages_to_install[@]}" | sort -u); readarray -t main_packages_to_install <<<"$unique_final_packages"
        DEBIAN_FRONTEND=noninteractive apt-get install -y "${main_packages_to_install[@]}" || error_exit "Failed to install main packages."; success "All required packages installed successfully."
    elif [[ "${final_package_check_needed}" == false ]]; then success "All required packages were already installed."; else success "All required packages already installed or installed as prerequisites."; fi
}


# --- Setup Docker Group for Deploy User ---
setup_docker_group() {
    info "Checking Docker group membership for user '${DEPLOY_USER}'..."
    if ! id -u "${DEPLOY_USER}" &>/dev/null; then warn "User '${DEPLOY_USER}' does not exist. Cannot configure Docker group."; return 1; fi
    if groups "${DEPLOY_USER}" | grep -q -w "docker"; then info "User '${DEPLOY_USER}' is already in the 'docker' group."; else
        if ! getent group docker > /dev/null; then error_exit "Docker group 'docker' does not exist. Docker installation might have failed."; fi
        info "Adding user '${DEPLOY_USER}' to the 'docker' group..."; usermod -aG docker "${DEPLOY_USER}" || error_exit "Failed to add user '${DEPLOY_USER}' to docker group."
        success "User '${DEPLOY_USER}' added to 'docker' group."; warn "User '${DEPLOY_USER}' MUST log out and log back in for Docker group changes to take effect!"; fi
}

# --- Create and Configure Directories ---
setup_directories() {
    info "Setting up required directories and permissions..."
    local dir_specs=( "${APPS_DIR}:deploy:deploy:755" "${VPS_DIR}:deploy:deploy:755" "${CERTS_DIR}:deploy:deploy:755" "${SECRETS_DIR}:root:root:700" "${WEBROOT_CHallenge_DIR}:root:root:755" )
    if [[ -d "${DEPLOY_HOME}" ]]; then chown "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_HOME}" || warn "Could not chown ${DEPLOY_HOME}."; else warn "Deploy user home directory ${DEPLOY_HOME} not found."; fi
    for spec in "${dir_specs[@]}"; do IFS=':' read -r dir owner group perms <<< "$spec"; if [[ -z "$dir" || -z "$owner" || -z "$group" || -z "$perms" ]]; then warn "Skipping invalid spec: ${spec}"; continue; fi; local uid; local gid; uid=$(id -u "$owner" 2>/dev/null) || error_exit "Owner user '$owner' not found."; gid=$(getent group "$group" | cut -d: -f3 2>/dev/null) || error_exit "Owner group '$group' not found."; if [[ ! -d "${dir}" ]]; then info "Creating dir: ${dir}"; mkdir -p "${dir}" || error_exit "Failed create ${dir}."; info "Dir ${dir} created."; else info "Dir ${dir} already exists."; fi; info "Setting owner ${owner}:${group} perms ${perms} for ${dir}..."; chown -R "${uid}:${gid}" "${dir}" || error_exit "Failed chown for ${dir}."; chmod "${perms}" "${dir}" || error_exit "Failed chmod for ${dir}." ; done
    success "Required directories created/verified."
}

# --- Provide Guidance for Setting Up Secrets ---
setup_secrets_guidance() {
    info "Setting up placeholder files for DNS provider API credentials (required for DNS-01 challenge)..."
    local cloudflare_ini="${SECRETS_DIR}/cloudflare.ini"; local digitalocean_ini="${SECRETS_DIR}/digitalocean.ini"
    touch "${cloudflare_ini}" "${digitalocean_ini}" || warn "Could not touch .ini files."
    chown root:root "${cloudflare_ini}" "${digitalocean_ini}" || error_exit "Failed chown for .ini files."
    chmod 600 "${cloudflare_ini}" "${digitalocean_ini}" || error_exit "Failed chmod for .ini files."
    echo -e "+--------------------------------------------------------------------+"
    echo -e "| ${COLOR_YELLOW}ACCIÓN REQUERIDA: Configuración de Credenciales DNS para Certbot${COLOR_NC} |"
    echo -e "+--------------------------------------------------------------------+"
    echo -e "| Para usar la validación DNS de Let's Encrypt (necesario para wildcards):" ; echo -e "|" ; echo -e "| 1. Edita los siguientes archivos ${COLOR_YELLOW}COMO ROOT${COLOR_NC} (ej: sudo nano /ruta/al/archivo):"; echo -e "|    - ${cloudflare_ini} (si usas Cloudflare)"; echo -e "|    - ${digitalocean_ini} (si usas DigitalOcean DNS)"; echo -e "|"; echo -e "| 2. Obtén los ${COLOR_YELLOW}API Tokens${COLOR_NC} necesarios:"; echo -e "|    - ${COLOR_BLUE}Cloudflare:${COLOR_NC} Crea un API Token (NO la clave global) con permisos: Zone:Read, DNS:Edit."; echo -e "|    - ${COLOR_BLUE}DigitalOcean:${COLOR_NC} Crea un Personal Access Token (PAT) con permisos: Write."; echo -e "|"; echo -e "| 3. Pega el token en el archivo correspondiente, usando el formato exacto:"; echo -e "|    - Cloudflare: ${COLOR_GREEN}dns_cloudflare_api_token = TU_TOKEN_CLOUDFLARE${COLOR_NC}"; echo -e "|    - DigitalOcean: ${COLOR_GREEN}dns_digitalocean_token = TU_TOKEN_DIGITALOCEAN${COLOR_NC}"; echo -e "|"; echo -e "| ${COLOR_YELLOW}¡IMPORTANTE!${COLOR_NC} Asegúrate de que los permisos del archivo sigan siendo ${COLOR_YELLOW}600${COLOR_NC} después de editar."; echo -e "| (Solo root debe poder leer estos archivos)."; echo -e "+--------------------------------------------------------------------+"
    prompt_continue "Pega tus tokens en los archivos .ini (si necesitas validación DNS)."
    success "Guidance for API credentials provided."
}

# --- Check Certbot Renewal Configuration ---
check_certbot_renewal_config() {
    info "Checking Certbot renewal configuration..."; local found_cron=false
    if crontab -l -u root 2>/dev/null | grep -q 'certbot renew'; then warn "Custom root cron job found containing 'certbot renew'."; found_cron=true; fi
    if id -u "${DEPLOY_USER}" &>/dev/null && crontab -l -u "${DEPLOY_USER}" 2>/dev/null | grep -q 'certbot renew'; then warn "Custom '${DEPLOY_USER}' cron job found containing 'certbot renew'."; found_cron=true; fi
    if [[ -d /etc/cron.d ]] && grep -q -r --include='*' 'certbot renew' /etc/cron.d/ /etc/crontab 2>/dev/null; then warn "Cron job found in /etc/cron.d/ or /etc/crontab containing 'certbot renew'."; found_cron=true; fi
    if [[ "${found_cron}" == true ]]; then warn "Recommend removing custom cron jobs to rely solely on the systemd timer for renewals."; else info "No obvious custom cron jobs found for 'certbot renew'."; fi
    info "Checking status of 'certbot.timer'..."
    if systemctl list-timers | grep -q 'certbot.timer'; then info "Systemd timer 'certbot.timer' exists."; if systemctl is-active --quiet certbot.timer; then success "'certbot.timer' is active. This is the recommended way to handle renewals."; else warn "'certbot.timer' is present but INACTIVE."; warn "Enable/start it with: sudo systemctl enable --now certbot.timer"; fi
    else warn "Standard systemd timer 'certbot.timer' NOT FOUND."; warn "Automatic renewal via systemd is likely not configured."; fi
    success "Certbot renewal check complete."
}

# --- Main Function ---
main() {
    info "====================================================================="
    info " Starting VPS Initial Setup Script (${SCRIPT_NAME} v3 - Add Deploy Key) "
    info "====================================================================="
    check_root
    create_deploy_user # Modified version
    install_packages
    setup_docker_group
    setup_directories
    setup_secrets_guidance
    check_certbot_renewal_config
    echo
    success "================================================="
    success " VPS Initial Setup Script completed! "
    success "================================================="
    warn ">>> IMPORTANT: If user '${DEPLOY_USER}' was added to the 'docker' group, they MUST log out and log back in for changes to take effect! <<<"
    info "Review the output above for any warnings or required actions."
    info "Refer to the project README for next steps."
}

# --- Execute Main Function ---
main

exit 0
