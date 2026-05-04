#!/usr/bin/env bash
set -euo pipefail

APP_NAME="cs2-rcon-bot"
INSTALL_DIR_DEFAULT="$HOME/$APP_NAME"
IMAGE_DEFAULT="ghcr.io/beaudenison/cs2-rcon-bot:latest"
DISCORD_PORTAL_URL="https://discord.com/developers/applications"
TTY_DEVICE="/dev/tty"

print_header() {
  echo
  echo "========================================"
  echo " CS2 RCON Bot One-Command Installer"
  echo "========================================"
  echo
}

open_url() {
  local url="$1"

  if [[ -n "${BROWSER:-}" ]] && command -v "$BROWSER" >/dev/null 2>&1; then
    "$BROWSER" "$url" >/dev/null 2>&1 &
    return 0
  fi

  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 &
    return 0
  fi

  if command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 &
    return 0
  fi

  return 1
}

pause_for_enter() {
  echo
  read -r -p "Press Enter to continue..." _ <"$TTY_DEVICE"
}

show_discord_bot_guide() {
  echo
  echo "Discord bot setup guide"
  echo "1. Open: $DISCORD_PORTAL_URL"
  echo "2. Click 'New Application' and give it a name."
  echo "3. In 'General Information', copy the Application ID."
  echo "4. In 'Bot', click 'Add Bot'."
  echo "5. In 'Bot', copy or reset the bot token."
  echo "6. In 'OAuth2 -> URL Generator':"
  echo "   - Scopes: bot, applications.commands"
  echo "   - Permissions: View Channels, Send Messages, Embed Links, Use Slash Commands, Read Message History"
  echo "7. Open the generated invite URL and invite the bot to your server."
  echo "8. Come back here and paste the Application ID and bot token when asked."
}

find_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
    return 0
  fi

  return 1
}

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: required command '$cmd' is not installed." >&2
    exit 1
  fi
}

prompt_required() {
  local label="$1"
  local value=""

  while [[ -z "$value" ]]; do
    read -r -p "$label: " value <"$TTY_DEVICE"
    value="$(echo "$value" | sed 's/^ *//;s/ *$//')"
  done

  echo "$value"
}

prompt_default() {
  local label="$1"
  local default_value="$2"
  local value=""

  read -r -p "$label [$default_value]: " value <"$TTY_DEVICE"
  value="$(echo "$value" | sed 's/^ *//;s/ *$//')"

  if [[ -z "$value" ]]; then
    value="$default_value"
  fi

  echo "$value"
}

generate_hex_key() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return 0
  fi

  if command -v xxd >/dev/null 2>&1; then
    head -c 32 /dev/urandom | xxd -p -c 32
    return 0
  fi

  return 1
}

validate_positive_int() {
  local v="$1"
  [[ "$v" =~ ^[0-9]+$ ]] && [[ "$v" -gt 0 ]]
}

print_header

require_command docker
COMPOSE_CMD="$(find_compose_cmd || true)"
if [[ -z "$COMPOSE_CMD" ]]; then
  echo "Error: Docker Compose is required. Install Docker Compose and run again." >&2
  exit 1
fi

echo "This wizard creates a local bot folder, writes config, pulls the image, and starts it."
echo

INSTALL_DIR="$(prompt_default "Install directory" "$INSTALL_DIR_DEFAULT")"
IMAGE="$(prompt_default "Docker image" "$IMAGE_DEFAULT")"

echo
show_discord_bot_guide
OPEN_REPLY="$(prompt_default "Open Discord Developer Portal in your browser now? (yes/no)" "yes")"
OPEN_REPLY="$(echo "$OPEN_REPLY" | tr '[:upper:]' '[:lower:]')"
if [[ "$OPEN_REPLY" == "yes" || "$OPEN_REPLY" == "y" ]]; then
  if open_url "$DISCORD_PORTAL_URL"; then
    echo "Opened Discord Developer Portal in your browser."
  else
    echo "Could not open a browser automatically. Open this URL manually: $DISCORD_PORTAL_URL"
  fi
fi

pause_for_enter

echo "Discord app credentials"
DISCORD_TOKEN="$(prompt_required "DISCORD_TOKEN (bot token)")"
DISCORD_CLIENT_ID="$(prompt_required "DISCORD_CLIENT_ID (application id)")"

STATUS_REFRESH_SECONDS="30"
AUTO_STATUS_REFRESH="false"
REFRESH_STATUS_AFTER_ACTION="false"

ENCRYPT_RCON_PASSWORDS="false"
ENCRYPTION_KEY=""
ENCRYPT_REPLY="$(prompt_default "Enable encrypted-at-rest RCON password storage? (yes/no)" "no")"
ENCRYPT_REPLY="$(echo "$ENCRYPT_REPLY" | tr '[:upper:]' '[:lower:]')"
if [[ "$ENCRYPT_REPLY" == "yes" || "$ENCRYPT_REPLY" == "y" ]]; then
  ENCRYPT_RCON_PASSWORDS="true"
  KEY_REPLY="$(prompt_default "Auto-generate ENCRYPTION_KEY? (yes/no)" "yes")"
  KEY_REPLY="$(echo "$KEY_REPLY" | tr '[:upper:]' '[:lower:]')"

  if [[ "$KEY_REPLY" == "yes" || "$KEY_REPLY" == "y" ]]; then
    ENCRYPTION_KEY="$(generate_hex_key || true)"
    if [[ -z "$ENCRYPTION_KEY" ]]; then
      echo "Could not auto-generate key. Please enter a 64-char hex key manually."
      ENCRYPTION_KEY="$(prompt_required "ENCRYPTION_KEY")"
    else
      echo "Generated ENCRYPTION_KEY for you."
    fi
  else
    ENCRYPTION_KEY="$(prompt_required "ENCRYPTION_KEY")"
  fi
fi

mkdir -p "$INSTALL_DIR/data"

ENV_FILE="$INSTALL_DIR/.env"
cat >"$ENV_FILE" <<EOF
DISCORD_TOKEN=$DISCORD_TOKEN
DISCORD_CLIENT_ID=$DISCORD_CLIENT_ID
STATUS_REFRESH_SECONDS=$STATUS_REFRESH_SECONDS
AUTO_STATUS_REFRESH=$AUTO_STATUS_REFRESH
REFRESH_STATUS_AFTER_ACTION=$REFRESH_STATUS_AFTER_ACTION
DATA_DIR=./data
ENCRYPT_RCON_PASSWORDS=$ENCRYPT_RCON_PASSWORDS
ENCRYPTION_KEY=$ENCRYPTION_KEY
EOF

COMPOSE_FILE="$INSTALL_DIR/docker-compose.yml"
cat >"$COMPOSE_FILE" <<EOF
services:
  cs2-rcon-bot:
    image: $IMAGE
    container_name: cs2-rcon-bot
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - ./data:/app/data
EOF

echo
echo "Pulling image: $IMAGE"
(
  cd "$INSTALL_DIR"
  docker pull "$IMAGE"

  echo "Starting bot container..."
  $COMPOSE_CMD up -d
)

echo
echo "Install complete."
echo "Location: $INSTALL_DIR"
echo "Logs:"
echo "  cd $INSTALL_DIR && $COMPOSE_CMD logs -f"
echo ""
echo "Next in Discord: run /setup in your server."
