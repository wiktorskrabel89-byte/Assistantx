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
- `GET http://127.0.0.1:9001/v1/runtime/status`
- `POST http://127.0.0.1:9001/v1/runtime/permissions`
- `POST http://127.0.0.1:9001/v1/runtime/kill-switch`
- `WS ws://<server-ip>:9000/?token=<sessionToken>`
