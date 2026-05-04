#!/usr/bin/env bash
set -euo pipefail

APP_NAME="cs2-rcon-bot"
INSTALL_DIR_DEFAULT="$HOME/$APP_NAME"
IMAGE_DEFAULT="ghcr.io/beaudenison/cs2-rcon-bot:latest"

print_header() {
  echo
  echo "========================================"
  echo " CS2 RCON Bot One-Command Installer"
  echo "========================================"
  echo
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
    read -r -p "$label: " value
    value="$(echo "$value" | sed 's/^ *//;s/ *$//')"
  done

  echo "$value"
}

prompt_default() {
  local label="$1"
  local default_value="$2"
  local value=""

  read -r -p "$label [$default_value]: " value
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
echo "Discord App credentials"
DISCORD_TOKEN="$(prompt_required "DISCORD_TOKEN (bot token)")"
DISCORD_CLIENT_ID="$(prompt_required "DISCORD_CLIENT_ID (application id)")"

STATUS_REFRESH_SECONDS="$(prompt_default "Status refresh seconds" "30")"
while ! validate_positive_int "$STATUS_REFRESH_SECONDS"; do
  STATUS_REFRESH_SECONDS="$(prompt_default "Please enter a valid positive integer for status refresh seconds" "30")"
done

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
