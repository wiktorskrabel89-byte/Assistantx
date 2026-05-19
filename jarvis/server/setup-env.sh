#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

echo "=== Initializing JARVIS Linux server runtime ==="

if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y curl docker.io docker-compose-plugin jq
fi

sudo systemctl enable --now docker

if command -v nvidia-smi >/dev/null 2>&1; then
  echo "[ok] NVIDIA runtime detected:"
  nvidia-smi --query-gpu=name,memory.total --format=csv,noheader || true
else
  echo "[warn] nvidia-smi not found; GPU acceleration for Ollama may be unavailable."
fi

mkdir -p \
  "${ROOT_DIR}/data/ollama" \
  "${ROOT_DIR}/data/searxng" \
  "${ROOT_DIR}/data/netdata/cache" \
  "${ROOT_DIR}/data/netdata/lib" \
  "${ROOT_DIR}/data/managed"

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${ROOT_DIR}/.env.example" "${ENV_FILE}"
  SYNC_KEY="$(openssl rand -hex 32)"
  sed -i "s/^JARVIS_SYNC_KEY=.*/JARVIS_SYNC_KEY=${SYNC_KEY}/" "${ENV_FILE}"
  echo "[ok] Created ${ENV_FILE} with generated sync key."
else
  echo "[ok] ${ENV_FILE} already exists."
fi

if ! grep -q "^JARVIS_SYNC_KEY=" "${ENV_FILE}"; then
  echo "JARVIS_SYNC_KEY=$(openssl rand -hex 32)" >> "${ENV_FILE}"
fi

echo "Starting containers..."
docker compose -f "${ROOT_DIR}/docker-compose.yml" --env-file "${ENV_FILE}" up -d --build

echo "Checking container health..."
docker compose -f "${ROOT_DIR}/docker-compose.yml" ps

echo "Done. Pairing API available on: http://127.0.0.1:9001/v1/pair/key"
