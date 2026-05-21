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
