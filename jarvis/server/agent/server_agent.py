from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import secrets
import time
from dataclasses import dataclass
from typing import Any

import httpx
import psutil
import uvicorn
import websockets
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse

SYNC_KEY = os.environ.get("JARVIS_SYNC_KEY", "").strip()
TOKEN_TTL_SECONDS = max(300, int(os.environ.get("JARVIS_AGENT_TOKEN_TTL_SECONDS", "43200")))
WS_PORT = int(os.environ.get("JARVIS_AGENT_WS_PORT", "9000"))
HTTP_PORT = int(os.environ.get("JARVIS_AGENT_HTTP_PORT", "9001"))
ALLOWED_DIRECTORY = os.path.abspath(os.path.expanduser(os.environ.get("JARVIS_ALLOWED_DIRECTORY", "/srv/jarvis/managed")))
SEARXNG_URL = os.environ.get("JARVIS_SEARXNG_URL", "http://searxng:8080")
OLLAMA_BASE_URL = os.environ.get("JARVIS_OLLAMA_BASE_URL", "http://ollama:11434")
NETDATA_BASE_URL = os.environ.get("JARVIS_NETDATA_BASE_URL", "http://netdata:19999")


if not SYNC_KEY:
    raise RuntimeError("JARVIS_SYNC_KEY is required.")


@dataclass
class Session:
    token: str
    created_at: float
    expires_at: float
    permission_level: str = "default"
    full_control_consent: bool = False

    @property
    def expired(self) -> bool:
        return time.time() >= self.expires_at


_sessions: dict[str, Session] = {}
_lock = asyncio.Lock()


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


async def _new_session() -> Session:
    now = time.time()
    token = f"js_{secrets.token_urlsafe(32)}"
    session = Session(token=token, created_at=now, expires_at=now + TOKEN_TTL_SECONDS)
    async with _lock:
        _sessions[token] = session
    return session


async def _get_session(token: str | None) -> Session:
    if not token:
        raise HTTPException(status_code=401, detail="Missing token.")
    async with _lock:
        session = _sessions.get(token)
    if not session or session.expired:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return session


def _extract_bearer(auth_header: str | None) -> str | None:
    if not auth_header:
        return None
    value = auth_header.strip()
    if not value.lower().startswith("bearer "):
        return None
    return value[7:].strip() or None


async def _fetch_json(url: str, timeout: float = 2.5) -> dict[str, Any] | None:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
            return data if isinstance(data, dict) else None
    except Exception:
        return None


async def _collect_metrics() -> dict[str, Any]:
    vm = psutil.virtual_memory()
    cpu = psutil.cpu_percent(interval=None)
    ollama_tags = await _fetch_json(f"{OLLAMA_BASE_URL}/api/tags")
    netdata_info = await _fetch_json(f"{NETDATA_BASE_URL}/api/v1/info")
    searx_ping = await _fetch_json(f"{SEARXNG_URL}/config")
    return {
        "cpuPercent": round(float(cpu), 2),
        "ramPercent": round(float(vm.percent), 2),
        "ramUsedMb": int(vm.used / 1024 / 1024),
        "ramTotalMb": int(vm.total / 1024 / 1024),
        "vramGb": None,
        "services": {
            "ollama": "online" if ollama_tags else "offline",
            "searxng": "online" if searx_ping else "offline",
            "netdata": "online" if netdata_info else "offline",
        },
        "ollamaModels": [
            model.get("name")
            for model in (ollama_tags or {}).get("models", [])
            if isinstance(model, dict) and model.get("name")
        ],
    }


app = FastAPI(title="JARVIS Server Agent", version="1.0.0")


@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": int(time.time())}


@app.get("/v1/pair/key")
async def pair_key():
    return {"ok": True, "pairKeyHash": _sha256(SYNC_KEY), "ttlSeconds": TOKEN_TTL_SECONDS}


@app.post("/v1/pair/verify")
async def pair_verify(payload: dict[str, Any]):
    provided = str(payload.get("syncKey", "")).strip()
    if not provided or secrets.compare_digest(provided, SYNC_KEY) is False:
        raise HTTPException(status_code=401, detail="Invalid sync key.")
    session = await _new_session()
    return {
        "ok": True,
        "sessionToken": session.token,
        "expiresAt": int(session.expires_at),
        "permissionLevel": session.permission_level,
    }


@app.post("/v1/runtime/permissions")
async def runtime_permissions(
    payload: dict[str, Any],
    authorization: str | None = Header(default=None),
):
    session = await _get_session(_extract_bearer(authorization))
    requested = str(payload.get("level", "default")).strip().lower()
    if requested not in {"default", "auto", "full"}:
        raise HTTPException(status_code=400, detail="Invalid permission level.")
    if requested == "full" and not bool(payload.get("fullControlConsent", False)):
        raise HTTPException(status_code=400, detail="Full control requires explicit consent.")
    session.permission_level = requested
    session.full_control_consent = bool(payload.get("fullControlConsent", False))
    return {"ok": True, "permissionLevel": session.permission_level}


@app.get("/v1/runtime/status")
async def runtime_status(authorization: str | None = Header(default=None)):
    session = await _get_session(_extract_bearer(authorization))
    metrics = await _collect_metrics()
    return {
        "ok": True,
        "state": "synchronized",
        "permissionLevel": session.permission_level,
        "metrics": metrics,
        "allowedDirectory": ALLOWED_DIRECTORY,
    }


@app.post("/v1/runtime/kill-switch")
async def runtime_kill_switch(authorization: str | None = Header(default=None)):
    token = _extract_bearer(authorization)
    await _get_session(token)
    async with _lock:
        if token:
            _sessions.pop(token, None)
    return {"ok": True, "state": "disconnected"}


@app.exception_handler(HTTPException)
async def auth_handler(_, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"ok": False, "error": str(exc.detail)})


async def ws_handler(websocket):
    query = websocket.path.split("?", 1)[1] if "?" in websocket.path else ""
    params = dict(
        pair.split("=", 1) if "=" in pair else (pair, "")
        for pair in query.split("&")
        if pair
    )
    token = params.get("token")
    session = None
    async with _lock:
        session = _sessions.get(token or "")
    if not session or session.expired:
        await websocket.close(code=4401, reason="Unauthorized")
        return
    await websocket.send(json.dumps({"type": "status", "phase": "connected", "source": "jarvis-server"}))
    while True:
        try:
            raw = await websocket.recv()
        except Exception:
            break
        try:
            message = json.loads(raw)
        except Exception:
            continue
        msg_type = str(message.get("type", ""))
        if msg_type == "configure":
            await websocket.send(json.dumps({"type": "status", "phase": "configured"}))
        elif msg_type == "audio_chunk":
            data = str(message.get("data", ""))
            if data:
                try:
                    pcm = base64.b64decode(data)
                    await websocket.send(json.dumps({
                        "type": "rms_level",
                        "source": "mic",
                        "rms": min(1.0, len(pcm) / 65536.0),
                        "timestamp": time.time(),
                    }))
                except Exception:
                    pass
        elif msg_type == "tts_speak":
            await websocket.send(json.dumps({
                "type": "tts_audio",
                "requestId": str(message.get("requestId", "")),
                "data": "",
                "format": "wav",
            }))
        else:
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"Unsupported runtime message type: {msg_type}",
            }))


async def run_ws():
    async with websockets.serve(ws_handler, "0.0.0.0", WS_PORT):
        while True:
            await asyncio.sleep(3600)


async def run_http():
    config = uvicorn.Config(app, host="0.0.0.0", port=HTTP_PORT, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


async def main():
    await asyncio.gather(run_http(), run_ws())


if __name__ == "__main__":
    asyncio.run(main())
