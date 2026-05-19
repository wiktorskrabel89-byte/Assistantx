#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${HOME}/jarvis-server"
ENV_FILE="${ROOT_DIR}/.env.server"
SYNC_KEY_FILE="${ROOT_DIR}/.sync-key"

log() {
  printf '[jarvis-server] %s\n' "$1"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    printf '[jarvis-server] missing command: %s\n' "$1" >&2
    exit 1
  }
}

log "Updating packages and installing dependencies..."
sudo apt-get update
sudo apt-get install -y curl docker.io docker-compose nvidia-container-toolkit

log "Ensuring docker service is active..."
sudo systemctl enable docker >/dev/null 2>&1 || true
sudo systemctl restart docker

if ! command -v nvidia-smi >/dev/null 2>&1; then
  printf '[jarvis-server] ERROR: nvidia-smi command is unavailable. Install NVIDIA drivers first.\n' >&2
  exit 1
fi
if ! nvidia-smi >/dev/null 2>&1; then
  printf '[jarvis-server] ERROR: NVIDIA GPU is unavailable for container runtime.\n' >&2
  exit 1
fi

log "Creating server directory layout under ${ROOT_DIR}..."
mkdir -p "${ROOT_DIR}/ollama_data" "${ROOT_DIR}/searxng" "${ROOT_DIR}/logs" "${ROOT_DIR}/agent_state"

if [[ ! -f "${SYNC_KEY_FILE}" ]]; then
  log "Generating initial sync key..."
  python3 - <<'PY'
import secrets
from pathlib import Path

sync_key = secrets.token_hex(32)
path = Path.home() / 'jarvis-server' / '.sync-key'
path.write_text(sync_key, encoding='utf-8')
path.chmod(0o600)
PY
fi

SYNC_KEY="$(cat "${SYNC_KEY_FILE}")"

if [[ ! -f "${ENV_FILE}" ]]; then
  log "Creating ${ENV_FILE}"
  cat > "${ENV_FILE}" <<ENV
JARVIS_SYNC_KEY=${SYNC_KEY}
JARVIS_ALLOWED_DIRECTORY=${ROOT_DIR}/managed
JARVIS_AGENT_STATE_DIR=${ROOT_DIR}/agent_state
JARVIS_LOG_DIR=${ROOT_DIR}/logs
JARVIS_NETDATA_URL=http://netdata:19999
JARVIS_PAIR_BIND_HOST=0.0.0.0
JARVIS_PAIR_HTTP_PORT=9001
JARVIS_AGENT_WS_HOST=0.0.0.0
JARVIS_AGENT_WS_PORT=9000
ENV
else
  log "${ENV_FILE} already exists; preserving current values."
fi

mkdir -p "${ROOT_DIR}/managed"

log "Writing sudoers policy suggestion to ${ROOT_DIR}/sudoers.jarvis (manual install required)."
cat > "${ROOT_DIR}/sudoers.jarvis" <<SUDOERS
jarvis_agent ALL=(ALL) NOPASSWD: /usr/bin/systemctl start docker, /usr/bin/systemctl stop docker, /usr/bin/systemctl restart docker, /usr/bin/systemctl status docker, /usr/bin/systemctl start ollama, /usr/bin/systemctl stop ollama, /usr/bin/systemctl restart ollama
SUDOERS

log "Bootstrap complete."
log "Next: copy ${ROOT_DIR}/sudoers.jarvis -> /etc/sudoers.d/jarvis and run: docker compose --env-file ${ENV_FILE} up -d"
require_cmd docker
require_cmd docker-compose
