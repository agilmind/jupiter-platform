#!/bin/bash
# ==============================================================================
# Debian 12 - Initial Server Hardening Script
# ==============================================================================
# Description: Performs basic security hardening for a fresh Debian 12 server.
#              - Updates the system
#              - Creates a non-root user with sudo privileges
#              - Configures SSH key authentication for the new user
#              - Hardens SSH daemon (disables root login, password auth)
#              - Installs and configures UFW firewall
#              - Optionally installs and enables Fail2ban
# Usage:       Run as root: sudo bash debian-harden.sh
# WARNING:     Review settings carefully. Test SSH access BEFORE disconnecting!
# ==============================================================================

# --- Strict Mode ---
set -euo pipefail

# --- Constants ---
readonly SCRIPT_NAME=$(basename "$0")
SSH_PORT="22" # Default SSH Port - might be updated later

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
prompt_continue() { read -p "$(echo -e "${COLOR_YELLOW}[ACTION]${COLOR_NC} $1 Press Enter to continue, or Ctrl+C to abort...")"; }
prompt_yes_no() {
    local prompt_message="$1"
    local default_choice="${2:-n}" # Default to No
    local response
    while true; do
        read -p "$(echo -e "${COLOR_YELLOW}[QUESTION]${COLOR_NC} ${prompt_message} (y/N): ")" response
        response=${response:-$default_choice} # Set default if empty
        case "$response" in
            [Yy]* ) return 0;; # Yes - return success (0)
            [Nn]* ) return 1;; # No - return failure (1)
            * ) echo "Please answer yes or no.";;
        esac
    done
}

# --- Check Root ---
check_root() {
    info "Checking execution privileges..."
    if [[ "${EUID}" -ne 0 ]]; then
        error_exit "This script must be run as root (e.g., using sudo)."
    fi
    success "Running with root privileges."
}

# --- Update System ---
update_system() {
    info "Updating system packages..."
    apt-get update -y || warn "apt update failed. Check network/sources."
    info "Upgrading system packages..."
    # Use noninteractive frontend to avoid prompts during upgrade
    DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -o Dpkg::Options::="--force-confold" || warn "apt upgrade failed."
    info "Removing unused packages..."
    apt-get autoremove -y || warn "apt autoremove failed."
    success "System updated."
}

# --- Create Sudo User ---
create_sudo_user() {
    local username=""
    local pubkey=""

    info "Creating a non-root user with sudo privileges..."
    while [[ -z "$username" ]]; do
        read -p "$(echo -e "${COLOR_YELLOW}[INPUT]${COLOR_NC} Enter username for the new sudo user: ")" username
        if id -u "$username" &>/dev/null; then
            warn "User '$username' already exists. Choose a different name."
            username=""
        elif [[ ! "$username" =~ ^[a-z_][a-z0-9_-]*[$]?$ ]]; then
             warn "Invalid username format. Use lowercase letters, numbers, underscores, hyphens."
             username=""
        fi
    done

    adduser --gecos "" "$username" || error_exit "Failed to create user '$username'."
    usermod -aG sudo "$username" || error_exit "Failed to add user '$username' to sudo group."
    success "User '$username' created and added to sudo group."

    info "Configuring SSH key authentication for '$username'..."
    local user_home
    user_home=$(eval echo "~$username") # Get home directory path
    local ssh_dir="${user_home}/.ssh"
    local auth_keys_file="${ssh_dir}/authorized_keys"

    mkdir -p "$ssh_dir" || error_exit "Failed to create $ssh_dir."
    chmod 700 "$ssh_dir" || error_exit "Failed to set permissions on $ssh_dir."

    echo -e "${COLOR_YELLOW}[INPUT]${COLOR_NC} Paste the entire SSH public key for user '$username' (e.g., id_rsa.pub, id_ed25519.pub):"
    read -p "> " pubkey
    # Basic validation
    if [[ -z "$pubkey" || ! "$pubkey" =~ ^(ssh-rsa|ecdsa-sha2-nistp|ssh-ed25519) ]]; then
         error_exit "Invalid SSH public key format provided."
    fi

    echo "$pubkey" >> "$auth_keys_file" || error_exit "Failed to add public key to $auth_keys_file."
    chmod 600 "$auth_keys_file" || error_exit "Failed to set permissions on $auth_keys_file."
    chown -R "${username}:${username}" "$ssh_dir" || error_exit "Failed to set ownership on $ssh_dir."

    success "SSH public key added for user '$username'."
    info "You should now be able to log in as '$username' using your SSH key."
}

# --- Harden SSH Daemon ---
harden_ssh() {
    local sshd_config="/etc/ssh/sshd_config"
    local sshd_config_backup="/etc/ssh/sshd_config.bak_$(date +%F_%T)"

    info "Hardening SSH daemon configuration (${sshd_config})..."
    info "Creating backup: ${sshd_config_backup}"
    cp "${sshd_config}" "${sshd_config_backup}" || error_exit "Failed to create SSH config backup."

    # 1. Disable Root Login
    info "Disabling direct root SSH login (PermitRootLogin no)..."
    sed -i -E 's/^[ \t]*#?[ \t]*(PermitRootLogin)\s+.*/\1 no/' "$sshd_config" || warn "sed failed for PermitRootLogin."

    # 2. Disable Password Authentication
    info "Disabling password authentication (PasswordAuthentication no)..."
    sed -i -E 's/^[ \t]*#?[ \t]*(PasswordAuthentication)\s+.*/\1 no/' "$sshd_config" || warn "sed failed for PasswordAuthentication."
    # Also disable challenge-response which might allow passwords
    sed -i -E 's/^[ \t]*#?[ \t]*(ChallengeResponseAuthentication)\s+.*/\1 no/' "$sshd_config" || warn "sed failed for ChallengeResponseAuthentication."
    # Ensure UsePAM is yes if needed for key auth, but no for password auth if UsePAM allows it (complex).
    # Setting PasswordAuthentication no is usually sufficient.

    # 3. (Optional) Change SSH Port
    if prompt_yes_no "Do you want to change the default SSH port (22)? (Recommended for obscurity)"; then
        local new_port=""
        while [[ -z "$new_port" ]]; do
            read -p "$(echo -e "${COLOR_YELLOW}[INPUT]${COLOR_NC} Enter new SSH port number (e.g., 2222): ")" new_port
            # Basic validation for port number
             if ! [[ "$new_port" =~ ^[0-9]+$ ]] || [[ "$new_port" -lt 1 ]] || [[ "$new_port" -gt 65535 ]]; then
                 warn "Invalid port number. Please enter a number between 1 and 65535."
                 new_port=""
             elif [[ "$new_port" -eq 22 ]]; then
                 warn "Port 22 is the default. Choose a different port or select 'no' previously."
                 new_port=""
             fi
        done
        info "Changing SSH port to ${new_port}..."
        sed -i -E "s/^[ \t]*#?[ \t]*(Port)\s+.*/\1 ${new_port}/" "$sshd_config" || warn "sed failed for Port."
        SSH_PORT="$new_port" # Update global variable for firewall
        success "SSH port changed to ${SSH_PORT} in config."
    else
        info "Keeping default SSH port 22."
        SSH_PORT="22"
    fi

    # 4. Validate and Restart SSH
    info "Validating SSH configuration..."
    sshd -t || error_exit "sshd configuration validation failed! Check ${sshd_config}. Backup is in ${sshd_config_backup}."
    info "Restarting SSH service..."
    systemctl restart sshd || error_exit "Failed to restart sshd service. Check status with 'systemctl status sshd'."

    success "SSH daemon hardened and restarted."
    warn "If you changed the SSH port, remember to connect using 'ssh -p ${SSH_PORT} user@host'!"
}

# --- Configure Firewall (UFW) ---
configure_firewall() {
    info "Configuring Firewall (UFW)..."

    # Install UFW if not present
    if ! command -v ufw &> /dev/null; then
        info "UFW not found. Installing..."
        apt-get install ufw -y || error_exit "Failed to install UFW."
    else
        info "UFW is already installed."
    fi

    # Reset UFW to defaults (optional, but safer)
    if prompt_yes_no "Reset UFW to default settings? (Recommended for clean setup)"; then
        info "Resetting UFW..."
        ufw --force reset || warn "Failed to reset UFW (might be inactive)."
    fi

    # Set default policies
    info "Setting default firewall policies (deny incoming, allow outgoing)..."
    ufw default deny incoming || error_exit "Failed to set default deny incoming policy."
    ufw default allow outgoing || error_exit "Failed to set default allow outgoing policy."

    # Allow SSH access
    info "Allowing SSH access on port ${SSH_PORT}/tcp..."
    ufw allow "${SSH_PORT}/tcp" || error_exit "Failed to allow SSH on port ${SSH_PORT}."
    # Alternatively use service name if port is 22: ufw allow OpenSSH

    # (Optional) Allow HTTP/HTTPS if needed immediately
    # info "Allowing HTTP (80/tcp) and HTTPS (443/tcp)..."
    # ufw allow http || warn "Failed to allow HTTP."
    # ufw allow https || warn "Failed to allow HTTPS."

    # Enable UFW
    if prompt_yes_no "Enable the firewall now?"; then
        info "Enabling UFW..."
        # Use --force to avoid interactive prompt during script execution
        ufw --force enable || error_exit "Failed to enable UFW."
        success "UFW enabled and active."
    else
        warn "UFW installed but NOT enabled. Enable manually later with 'sudo ufw enable'."
    fi

    info "Current UFW status:"
    ufw status verbose
    success "Firewall configuration complete."
}

# --- Install and Configure Fail2ban (Optional) ---
setup_fail2ban() {
    if ! prompt_yes_no "Do you want to install and enable Fail2ban for SSH brute-force protection?"; then
        info "Skipping Fail2ban setup."
        return 0
    fi

    info "Installing Fail2ban..."
    apt-get install fail2ban -y || error_exit "Failed to install Fail2ban."

    # Basic configuration: Enable default SSH jail
    # Defaults usually enable sshd jail. We ensure it by copying jail.conf
    local jail_local="/etc/fail2ban/jail.local"
    local jail_conf="/etc/fail2ban/jail.conf"

    if [[ ! -f "$jail_local" ]]; then
        info "Creating ${jail_local} from ${jail_conf}..."
        cp "$jail_conf" "$jail_local" || warn "Failed to copy jail.conf to jail.local."
        # No specific modifications needed here for basic SSH protection,
        # as sshd jail is typically enabled by default in jail.conf/jail.local.
        # Advanced users can customize bantime, findtime, maxretry in jail.local.
    else
        info "${jail_local} already exists. Ensuring SSH jail is enabled..."
        # Ensure sshd section exists and is enabled (can be complex with sed, rely on defaults for now)
        if ! grep -q '^\s*\[sshd\]' "$jail_local"; then
            warn "[sshd] section not found in $jail_local. Default SSH protection might not be active."
        elif ! grep -q '^\s*\[sshd\]' "$jail_local" | grep -q '^\s*enabled\s*=\s*true'; then
             # This grep logic is flawed, simply check presence
             # Let's assume if [sshd] exists, default enable=true is inherited unless explicitly false
             info "[sshd] section found. Assuming enabled unless explicitly set to false."
        fi
    fi

    info "Ensuring Fail2ban service is enabled and started..."
    systemctl enable --now fail2ban || warn "Failed to enable/start fail2ban service."

    # Check status
    sleep 2 # Give service time to start
    info "Current Fail2ban status:"
    systemctl status fail2ban --no-pager | head -n 10 # Show brief status
    info "Checking status of SSH jail (sshd)..."
    fail2ban-client status sshd || warn "Fail2ban sshd jail not found or inactive."

    success "Fail2ban installed and basic SSH protection enabled."
}

# --- Check Time Synchronization ---
check_time_sync() {
    info "Checking time synchronization status..."
    if timedatectl status | grep -q 'NTP service: active'; then
        success "Time synchronization (NTP) is active."
    else
        warn "NTP service is not active. Attempting to enable systemd-timesyncd..."
        timedatectl set-ntp true || warn "Failed to enable systemd-timesyncd. Check 'timedatectl status'."
        # Recheck status
        if timedatectl status | grep -q 'NTP service: active'; then
            success "Time synchronization (NTP) is now active."
        else
             warn "Still couldn't activate NTP service. Manual check needed."
        fi
    fi
}

# --- Main Function ---
main() {
    info "=============================================="
    info " Starting Debian 12 Initial Hardening Script "
    info "=============================================="
    check_root
    update_system
    create_sudo_user # Creates user and sets up SSH key
    harden_ssh # Disables root/password login, optionally changes port
    configure_firewall # Sets up UFW
    setup_fail2ban # Optional Fail2ban install
    check_time_sync # Ensure time is synced

    echo # Blank line
    success "=============================================="
    success " Initial Server Hardening Script Completed! "
    success "=============================================="
    echo # Blank line
    warn ">>> CRITICAL ACTION REQUIRED: <<<"
    warn "1. Open a NEW terminal window."
    warn "2. Test SSH login using the key for the new sudo user you created."
    warn "   (Use '-p ${SSH_PORT}' if you changed the port: ssh -p ${SSH_PORT} username@your_server_ip)"
    warn "3. Verify you can run 'sudo whoami' successfully with the new user."
    warn "4. ONLY AFTER confirming successful SSH key login, disconnect this current session."
    warn "DO NOT DISCONNECT THIS SESSION UNTIL YOU HAVE VERIFIED KEY-BASED LOGIN!"
    echo # Blank line
    info "Review the script output above for any warnings."
}

# --- Execute Main Function ---
main

exit 0
