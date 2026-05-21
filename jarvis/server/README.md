# Jarvis Linux Runtime Server

This directory contains the Linux runtime stack for JARVIS:

- `setup-env.sh` — bootstrap script (Docker + compose + local env generation)
- `docker-compose.yml` — Ollama, SearXNG, Netdata, server agent
- `agent/` — lightweight runtime gateway (pairing, status, WS channel)
- `systemd/jarvis-server.service` — optional service unit

## Quick start

```bash
cd jarvis/server
chmod +x setup-env.sh
./setup-env.sh
```

## Endpoints

- `GET http://127.0.0.1:9001/v1/pair/key`
- `POST http://127.0.0.1:9001/v1/pair/verify`
- `POST http://127.0.0.1:9001/v1/pair/rotate`
- `GET http://127.0.0.1:9001/v1/runtime/status`
- `GET http://127.0.0.1:9001/v1/runtime/state`
- `POST http://127.0.0.1:9001/v1/runtime/state`
- `POST http://127.0.0.1:9001/v1/runtime/model-mode`
- `POST http://127.0.0.1:9001/v1/runtime/command`
- `GET http://127.0.0.1:9001/v1/runtime/metrics`
- `POST http://127.0.0.1:9001/v1/runtime/permissions`
- `POST http://127.0.0.1:9001/v1/runtime/kill-switch`
- `WS ws://<server-ip>:9000/?token=<sessionToken>`

## Runtime source of truth

The Linux orchestrator now standardizes runtime state and mode contracts:

- `runtime_state`: `idle | listening | thinking_fast | coding_hardcore | degraded | killed`
- `model_mode`: `fast | coding`
- `permission_level`: `default | auto | full`

For coding load-management, the orchestrator uses lazy buffering:

- escalates to `coding` mode only when needed (e.g. `needs_32b`)
- keeps coding mode warm for `JARVIS_CODING_MODE_KEEPALIVE_SECONDS` (default 300s)
- releases back to `fast` mode after idle window
- blocks dangerous switches on high temperature / insufficient VRAM

For command safety, filesystem auto-accept rules are scoped to `JARVIS_WORKSPACE_ROOT`.
Operations outside this workspace escalate to full permission + interactive consent.

## GPU split and local services

- `ollama` is pinned to GPU `JARVIS_OLLAMA_GPU_DEVICE` (default `0`) in `docker-compose.yml`.
- SearXNG stays local to the runtime stack and should be consumed through `JARVIS_SEARXNG_URL`.
- Forge/ComfyUI is expected to run as an external host process on GPU `JARVIS_LOCAL_IMAGE_GPU_DEVICE` (default `1`), exposed through `JARVIS_LOCAL_IMAGE_API_URL`.

## SearXNG hardening

1. Generate a strong secret key before the first boot of your SearXNG instance.
2. Ensure the SearXNG `search.formats` list includes `json`, otherwise local worker integrations will not receive structured results.
3. Keep the HTTP binding local-only or restricted to a trusted path such as Docker bridge networking or Tailscale. Do not expose the SearXNG instance publicly unless you also add authentication and access controls.

## Startup order

1. Start the Docker runtime stack from `jarvis/server`.
2. Confirm Ollama is reachable on GPU 0 and SearXNG is returning JSON.
3. Start Forge/ComfyUI separately on GPU 1 and point the app/worker env to its API URL.
4. Start the local worker (`npm run dev:worker`) so `ai_tasks` can use local models with cloud fallback.
