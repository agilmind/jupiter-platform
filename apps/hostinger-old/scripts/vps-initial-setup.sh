#!/bin/bash
# ==============================================================================
# VPS Initial Setup Script (v4 - For Traefik Architecture)
# ==============================================================================
# Description: Prepares a Debian/Ubuntu based VPS for running Dockerized
#              infrastructure (like Traefik proxy + monitoring) and applications.
#              Sets up deploy user (with optional SSH key), installs Docker,
#              rsync, configures base directories.
# Usage:       Run with sudo after debian-harden.sh: sudo bash vps-initial-setup.sh
# Idempotent:  Attempts to be idempotent (safe to run multiple times).
# ==============================================================================

# --- Strict Mode ---
set -euo pipefail

# --- Constants ---
readonly SCRIPT_NAME=$(basename "$0")
readonly DEPLOY_USER="deploy"
readonly DEPLOY_HOME="/home/${DEPLOY_USER}"
readonly APPS_DIR="${DEPLOY_HOME}/apps"  # For application stacks
readonly INFRA_DIR="${DEPLOY_HOME}/infra" # For infrastructure stack (Traefik, Monitoring)

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
    if [[ "${EUID}" -ne 0 ]]; then
        error_exit "This script must be run as root (e.g., using sudo)."
    fi
    success "Running with root privileges."
}

# --- Create Deploy User (Includes optional SSH key setup) ---
create_deploy_user() {
    info "Checking user '${DEPLOY_USER}'..."
    if id -u "${DEPLOY_USER}" &>/dev/null; then
        info "User '${DEPLOY_USER}' already exists."
    else
        info "Creating user '${DEPLOY_USER}'..."
        adduser --gecos "" "${DEPLOY_USER}" || error_exit "Failed to create user '${DEPLOY_USER}'. Please check logs/output."
        success "User '${DEPLOY_USER}' created."
    fi

    # Setup SSH Key (Optional but recommended for CD/manual access)
    info "Configuring SSH key authentication for '${DEPLOY_USER}'..."
    local ssh_dir="${DEPLOY_HOME}/.ssh"; local auth_keys_file="${ssh_dir}/authorized_keys"
    if [[ ! -d "$DEPLOY_HOME" ]]; then error_exit "Home directory ${DEPLOY_HOME} for user ${DEPLOY_USER} not found!"; fi
    chown "${DEPLOY_USER}:${DEPLOY_USER}" "$DEPLOY_HOME" || warn "Could not chown ${DEPLOY_HOME}."

    mkdir -p "$ssh_dir" || error_exit "Failed create $ssh_dir."; chmod 700 "$ssh_dir" || error_exit "Failed perms $ssh_dir."
    local pubkey=""; echo -e "${COLOR_YELLOW}[INPUT]${COLOR_NC} Paste public SSH key for '${DEPLOY_USER}' (Optional, for CD/manual access):"; read -p "> " pubkey
    if [[ -n "$pubkey" ]]; then if [[ ! "$pubkey" =~ ^(ssh-rsa|ecdsa-sha2-nistp|ssh-ed25519) ]]; then warn "Invalid SSH key format. Skipping."; else if grep -qF "$pubkey" "$auth_keys_file" 2>/dev/null; then info "Key exists."; else echo "$pubkey" >> "$auth_keys_file" || error_exit "Failed add key."; info "Public key added."; fi; chmod 600 "$auth_keys_file" || error_exit "Failed perms $auth_keys_file."; fi; else info "No public key provided."; if [[ ! -f "$auth_keys_file" ]]; then touch "$auth_keys_file"; chmod 600 "$auth_keys_file" || warn "Could not set perms on empty authorized_keys."; fi; fi
    chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "$ssh_dir" || error_exit "Failed owner $ssh_dir."
    success "SSH setup for '${DEPLOY_USER}' complete."
}

# --- Install Required Packages (SIMPLIFIED for Traefik) ---
install_packages() {
    info "Updating package lists (apt update)..."
    apt-get update -y || error_exit "Failed to run apt update. Check network connection and apt sources."

    # Essential packages: Docker prereqs, Docker itself, Rsync for deployment workflows
    local all_packages=(
        ca-certificates curl gnupg apt-transport-https lsb-release # Prereqs Docker Repo
        docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin # Docker
        rsync # Needed by CD workflow for file sync
    )
    # Certbot and its plugins are NOT needed here, Traefik handles ACME.
    local repo_prereqs=( ca-certificates curl gnupg apt-transport-https lsb-release )
    local prereqs_to_install=() main_packages_to_install=() docker_ce_installed=true

    info "Checking system package status..."

    # Check if Docker CE needs installation (same logic as before to add repo)
    if ! dpkg-query -W -f='${Status}' "docker-ce" 2>/dev/null | grep -q "ok installed"; then
        docker_ce_installed=false; info "'docker-ce' needs installation. Checking repo prerequisites..."
        for pkg in "${repo_prereqs[@]}"; do if ! dpkg-query -W -f='${Status}' "${pkg}" 2>/dev/null | grep -q "ok installed"; then info "Repo prerequisite '${pkg}' marked for installation."; prereqs_to_install+=("${pkg}"); fi; done
        if [[ ${#prereqs_to_install[@]} -gt 0 ]]; then info "Installing repository prerequisites: ${prereqs_to_install[*]}..."; DEBIAN_FRONTEND=noninteractive apt-get install -y "${prereqs_to_install[@]}" || error_exit "Failed repo prereqs."; success "Repo prereqs installed."; else info "All repository prerequisites are already installed."; fi
        info "Setting up Docker apt repository..."; install -m 0755 -d /etc/apt/keyrings; if [[ -f /etc/apt/keyrings/docker.gpg ]]; then warn "Docker GPG key exists. Verifying..."; if ! gpg --dearmor --quiet --no-tty --output /dev/null /etc/apt/keyrings/docker.gpg; then warn "Existing key invalid. Replacing."; rm -f /etc/apt/keyrings/docker.gpg; curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg || error_exit "Failed download GPG key."; chmod a+r /etc/apt/keyrings/docker.gpg || warn "Failed GPG perms."; else info "Existing GPG key valid."; fi; else info "Downloading GPG key..."; curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg || error_exit "Failed download GPG key."; chmod a+r /etc/apt/keyrings/docker.gpg || warn "Failed GPG perms."; fi; local os_codename; os_codename=$(lsb_release -cs); if [[ -z "${os_codename}" ]]; then error_exit "No OS codename."; fi; info "OS codename: ${os_codename}"; echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian ${os_codename} stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null; info "Docker repo added. Updating apt again..."; apt-get update -y || error_exit "Apt update failed after repo add.";
    else info "'docker-ce' installed. Skipping repo setup."; fi

    # Check final list of required packages (now simplified)
    info "Checking final list of required packages..."; local final_packages_to_install=(); local final_package_check_needed=false; for pkg in "${all_packages[@]}"; do if ! dpkg-query -W -f='${Status}' "${pkg}" 2>/dev/null | grep -q "ok installed"; then if ! printf '%s\n' "${prereqs_to_install[@]}" | grep -q -x "$pkg"; then info "Package '${pkg}' marked for final install."; final_packages_to_install+=("${pkg}"); final_package_check_needed=true; fi; else info "Package '${pkg}' already installed."; fi; done; if [[ "${final_package_check_needed}" == true && ${#final_packages_to_install[@]} -gt 0 ]]; then info "Running final apt install for: ${final_packages_to_install[*]}..."; local unique_final_packages; unique_final_packages=$(printf "%s\n" "${final_packages_to_install[@]}" | sort -u); readarray -t final_packages_to_install <<<"$unique_final_packages"; DEBIAN_FRONTEND=noninteractive apt-get install -y "${final_packages_to_install[@]}" || error_exit "Failed main packages install."; success "All required packages installed."; elif [[ "${final_package_check_needed}" == false ]]; then success "All required packages already installed."; else success "All required packages installed or were prereqs."; fi
}

# --- Setup Docker Group for Deploy User ---
setup_docker_group() {
    info "Checking Docker group membership for user '${DEPLOY_USER}'..."
    if ! id -u "${DEPLOY_USER}" &>/dev/null; then warn "User '${DEPLOY_USER}' does not exist. Cannot configure Docker group."; return 1; fi
    if groups "${DEPLOY_USER}" | grep -q -w "docker"; then info "User '${DEPLOY_USER}' is already in the 'docker' group."; else
        if ! getent group docker > /dev/null; then error_exit "Docker group 'docker' does not exist. Docker install failed?"; fi
        info "Adding user '${DEPLOY_USER}' to the 'docker' group..."; usermod -aG docker "${DEPLOY_USER}" || error_exit "Failed add user to docker group."
        success "User '${DEPLOY_USER}' added to 'docker' group."; warn "User '${DEPLOY_USER}' MUST log out and log back in for group changes to take effect!"
    fi
}

# --- Create and Configure Directories (SIMPLIFIED for Traefik) ---
setup_directories() {
    info "Setting up required base directories..."
    # Define directories needed for deploy user, apps, and infra stack config/compose files
    local dir_specs=(
        "${APPS_DIR}:deploy:deploy:755"  # Parent directory for all app stacks
        "${INFRA_DIR}:deploy:deploy:755" # Parent directory for infra stack (compose file, configs)
        # Specific subdirs like /var/www/... or /home/deploy/.secrets are no longer needed by this script
        # Data persistence will use Docker named volumes, managed by Docker itself.
        # Static configs for Traefik/Prometheus etc. will be placed inside INFRA_DIR by the generator/CD.
    )

    # Ensure deploy user home exists
    if [[ -d "${DEPLOY_HOME}" ]]; then chown "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_HOME}" || warn "Could not chown ${DEPLOY_HOME}."; else warn "Deploy user home ${DEPLOY_HOME} not found."; fi

    # Loop through specs to create directories
    for spec in "${dir_specs[@]}"; do
        IFS=':' read -r dir owner group perms <<< "$spec"
        if [[ -z "$dir" || -z "$owner" || -z "$group" || -z "$perms" ]]; then warn "Skipping invalid spec: ${spec}"; continue; fi
        local uid; local gid; uid=$(id -u "$owner" 2>/dev/null) || error_exit "Owner user '$owner' not found."; gid=$(getent group "$group" | cut -d: -f3 2>/dev/null) || error_exit "Owner group '$group' not found."
        if [[ ! -d "${dir}" ]]; then info "Creating dir: ${dir}"; mkdir -p "${dir}" || error_exit "Failed create ${dir}."; info "Dir ${dir} created."; else info "Dir ${dir} already exists."; fi
        info "Setting owner ${owner}:${group} perms ${perms} for ${dir}..."; chown -R "${uid}:${gid}" "${dir}" || error_exit "Failed chown for ${dir}."; chmod "${perms}" "${dir}" || error_exit "Failed chmod for ${dir}."
    done
    success "Required directories created/verified."
}

# --- Main Function ---
main() {
    info "=============================================================="
    info " Starting VPS Initial Setup Script (${SCRIPT_NAME} v4 - Traefik) "
    info "=============================================================="
    check_root
    create_deploy_user        # Creates deploy user, optionally sets SSH key
    install_packages        # Installs Docker, Docker Compose plugin, rsync (NO Certbot)
    setup_docker_group        # Adds deploy user to docker group
    setup_directories         # Creates base dirs /home/deploy/apps and /home/deploy/infra
    echo
    success "=============================================================="
    success " VPS Initial Setup Script completed! "
    success "=============================================================="
    warn ">>> IMPORTANT: If user '${DEPLOY_USER}' was added to 'docker' group, they MUST log out/in for it to take effect! <<<"
    info "The server is now ready for the infrastructure stack (Traefik, Monitoring) to be deployed to ${INFRA_DIR}"
    info "and application stacks to be deployed to subdirectories under ${APPS_DIR}."
}

# --- Execute Main Function ---
main

exit 0
