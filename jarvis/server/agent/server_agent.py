from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import secrets
import subprocess
import time
from dataclasses import dataclass, field
from typing import Any, Literal
from urllib.parse import quote_plus

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
GPU_TEMP_LIMIT_C = int(os.environ.get("JARVIS_GPU_TEMP_LIMIT_C", "78"))
GPU_RESERVED_VRAM_MB = int(os.environ.get("JARVIS_GPU_RESERVED_VRAM_MB", "2048"))
MODE_COOLDOWN_SECONDS = int(os.environ.get("JARVIS_MODEL_MODE_COOLDOWN_SECONDS", "90"))
CODING_MODE_KEEPALIVE_SECONDS = int(os.environ.get("JARVIS_CODING_MODE_KEEPALIVE_SECONDS", "300"))
REQUIRE_INTERACTIVE_APPROVAL = os.environ.get("JARVIS_REQUIRE_INTERACTIVE_APPROVAL", "true").strip().lower() not in {"0", "false", "no"}
WORKSPACE_ROOT = os.path.abspath(os.path.expanduser(os.environ.get("JARVIS_WORKSPACE_ROOT", "/home/wiktor/jarvis_workspace")))

RuntimeState = Literal["idle", "listening", "thinking_fast", "coding_hardcore", "degraded", "killed"]
ModelMode = Literal["fast", "coding"]
PermissionLevel = Literal["default", "auto", "full"]

ALLOWED_RUNTIME_STATES: set[str] = {"idle", "listening", "thinking_fast", "coding_hardcore", "degraded", "killed"}
ALLOWED_MODEL_MODES: set[str] = {"fast", "coding"}
ALLOWED_PERMISSION_LEVELS: set[str] = {"default", "auto", "full"}

HIGH_RISK_COMMANDS = {
    "execute_shell": "full",
    "filesystem_write": "auto",
    "filesystem_delete": "full",
    "open_url": "default",
    "open_app": "default",
    "model_switch": "auto",
}

if not SYNC_KEY:
    raise RuntimeError("JARVIS_SYNC_KEY is required.")


@dataclass
class Session:
    token: str
    created_at: float
    expires_at: float
    permission_level: PermissionLevel = "default"
    full_control_consent: bool = False
    runtime_state: RuntimeState = "idle"
    model_mode: ModelMode = "fast"
    interactive_approval_code: str | None = None
    approval_code_expires_at: float | None = None
    last_activity_at: float = field(default_factory=time.time)

    @property
    def expired(self) -> bool:
        return time.time() >= self.expires_at


@dataclass
class SloSample:
    stage: str
    latency_ms: float
    timestamp: float


class SloTracker:
    def __init__(self, max_samples: int = 1200):
        self._max_samples = max_samples
        self._samples: list[SloSample] = []

    def record(self, stage: str, latency_ms: float) -> None:
        self._samples.append(SloSample(stage=stage, latency_ms=max(0.0, float(latency_ms)), timestamp=time.time()))
        if len(self._samples) > self._max_samples:
            self._samples = self._samples[-self._max_samples :]

    def summary(self) -> dict[str, Any]:
        grouped: dict[str, list[float]] = {}
        for sample in self._samples:
            grouped.setdefault(sample.stage, []).append(sample.latency_ms)

        result: dict[str, Any] = {}
        for stage, values in grouped.items():
            ordered = sorted(values)
            p95_idx = max(0, min(len(ordered) - 1, int(len(ordered) * 0.95) - 1))
            result[stage] = {
                "count": len(values),
                "avgMs": round(sum(values) / len(values), 2),
                "p95Ms": round(ordered[p95_idx], 2),
                "maxMs": round(max(values), 2),
            }
        return result


@dataclass
class GpuTelemetry:
    available: bool
    devices: list[dict[str, Any]]


class ModelLifecycleManager:
    def __init__(self) -> None:
        self.mode: ModelMode = "fast"
        self.last_switched_at = 0.0
        self.last_coding_activity_at = 0.0
        self.last_reason = "startup"

    def _cooldown_remaining(self) -> int:
        elapsed = int(time.time() - self.last_switched_at)
        return max(0, MODE_COOLDOWN_SECONDS - elapsed)

    def status(self, gpu: GpuTelemetry) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "lastSwitchedAt": int(self.last_switched_at) if self.last_switched_at else None,
            "lastReason": self.last_reason,
            "cooldownSecondsRemaining": self._cooldown_remaining(),
            "gpu": gpu.devices,
        }

    def can_switch(self, target: ModelMode, gpu: GpuTelemetry) -> tuple[bool, str]:
        if target == self.mode:
            return True, "already-in-target-mode"
        if self._cooldown_remaining() > 0:
            return False, f"cooldown-active:{self._cooldown_remaining()}s"
        if target == "coding":
            if not gpu.available or len(gpu.devices) < 2:
                return False, "coding-mode-requires-two-gpus"
            for device in gpu.devices:
                temp = device.get("temperatureC")
                free_mem = device.get("memoryFreeMb")
                if isinstance(temp, int) and temp >= GPU_TEMP_LIMIT_C:
                    return False, f"gpu-temperature-too-high:{temp}C"
                if isinstance(free_mem, int) and free_mem < GPU_RESERVED_VRAM_MB:
                    return False, f"insufficient-free-vram:{free_mem}MB"
        return True, "ok"

    def switch(self, target: ModelMode, reason: str, gpu: GpuTelemetry) -> tuple[bool, str]:
        ok, details = self.can_switch(target, gpu)
        if not ok:
            return False, details
        self.mode = target
        self.last_reason = reason
        self.last_switched_at = time.time()
        if target == "coding":
            self.last_coding_activity_at = self.last_switched_at
        return True, "switched"

    def mark_coding_activity(self) -> None:
        if self.mode == "coding":
            self.last_coding_activity_at = time.time()

    def maybe_release_coding_mode(self, gpu: GpuTelemetry) -> tuple[bool, str]:
        if self.mode != "coding":
            return False, "not-in-coding-mode"
        idle_for = time.time() - max(self.last_coding_activity_at, self.last_switched_at)
        if idle_for < CODING_MODE_KEEPALIVE_SECONDS:
            return False, "keepalive-window-active"
        ok, details = self.switch("fast", "coding-idle-timeout", gpu)
        if not ok:
            return False, details
        return True, "released-to-fast"


_sessions: dict[str, Session] = {}
_audit_log: list[dict[str, Any]] = []
_lock = asyncio.Lock()
_slo = SloTracker()
_lifecycle = ModelLifecycleManager()


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _extract_bearer(auth_header: str | None) -> str | None:
    if not auth_header:
        return None
    value = auth_header.strip()
    if not value.lower().startswith("bearer "):
        return None
    return value[7:].strip() or None


async def _new_session() -> Session:
    now = time.time()
    token = f"js_{secrets.token_urlsafe(32)}"
    session = Session(token=token, created_at=now, expires_at=now + TOKEN_TTL_SECONDS)
    async with _lock:
        _sessions[token] = session
    return session


async def _rotate_session(token: str) -> Session:
    old_session = await _get_session(token)
    now = time.time()
    next_token = f"js_{secrets.token_urlsafe(32)}"
    next_session = Session(
        token=next_token,
        created_at=now,
        expires_at=now + TOKEN_TTL_SECONDS,
        permission_level=old_session.permission_level,
        full_control_consent=old_session.full_control_consent,
        runtime_state=old_session.runtime_state,
        model_mode=old_session.model_mode,
    )
    async with _lock:
        _sessions.pop(token, None)
        _sessions[next_token] = next_session
    return next_session


async def _get_session(token: str | None) -> Session:
    if not token:
        raise HTTPException(status_code=401, detail="Missing token.")
    async with _lock:
        session = _sessions.get(token)
    if not session or session.expired:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    session.last_activity_at = time.time()
    return session


async def _fetch_json(url: str, timeout: float = 2.5) -> dict[str, Any] | None:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
            return data if isinstance(data, dict) else None
    except Exception:
        return None


def _append_audit(entry: dict[str, Any]) -> None:
    _audit_log.append({**entry, "timestamp": int(time.time())})
    if len(_audit_log) > 1000:
        del _audit_log[:200]


def _get_gpu_telemetry() -> GpuTelemetry:
    cmd = [
        "nvidia-smi",
        "--query-gpu=index,name,memory.total,memory.free,temperature.gpu,utilization.gpu",
        "--format=csv,noheader,nounits",
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=2)
        devices: list[dict[str, Any]] = []
        for line in proc.stdout.splitlines():
            parts = [part.strip() for part in line.split(",")]
            if len(parts) != 6:
                continue
            devices.append(
                {
                    "index": int(parts[0]),
                    "name": parts[1],
                    "memoryTotalMb": int(parts[2]),
                    "memoryFreeMb": int(parts[3]),
                    "temperatureC": int(parts[4]),
                    "utilizationPercent": int(parts[5]),
                }
            )
        return GpuTelemetry(available=bool(devices), devices=devices)
    except Exception:
        return GpuTelemetry(available=False, devices=[])


async def _collect_metrics() -> dict[str, Any]:
    vm = psutil.virtual_memory()
    cpu = psutil.cpu_percent(interval=None)
    ollama_tags = await _fetch_json(f"{OLLAMA_BASE_URL}/api/tags")
    netdata_info = await _fetch_json(f"{NETDATA_BASE_URL}/api/v1/info")
    searx_ping = await _fetch_json(f"{SEARXNG_URL}/config")
    gpu = _get_gpu_telemetry()
    _lifecycle.maybe_release_coding_mode(gpu)
    return {
        "cpuPercent": round(float(cpu), 2),
        "ramPercent": round(float(vm.percent), 2),
        "ramUsedMb": int(vm.used / 1024 / 1024),
        "ramTotalMb": int(vm.total / 1024 / 1024),
        "gpu": gpu.devices,
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
        "modelLifecycle": _lifecycle.status(gpu),
        "slo": _slo.summary(),
    }


def _requires_permission(command_name: str) -> PermissionLevel:
    required = HIGH_RISK_COMMANDS.get(command_name, "default")
    return required if required in ALLOWED_PERMISSION_LEVELS else "default"


def _permission_rank(level: PermissionLevel) -> int:
    return {"default": 0, "auto": 1, "full": 2}[level]


async def _ensure_command_authorized(session: Session, payload: dict[str, Any]) -> None:
    command = str(payload.get("command", "")).strip().lower()
    required = _requires_permission(command)
    if _permission_rank(session.permission_level) < _permission_rank(required):
        raise HTTPException(status_code=403, detail=f"Permission '{required}' required for command '{command}'.")
    if required == "full" and not session.full_control_consent:
        raise HTTPException(status_code=403, detail="Full control command requires explicit consent.")

    if command in {"filesystem_write", "filesystem_delete"}:
        target_path_raw = str(payload.get("targetPath", "")).strip()
        if target_path_raw:
            target_path = os.path.abspath(os.path.expanduser(target_path_raw))
            if not target_path.startswith(f"{WORKSPACE_ROOT}{os.sep}") and target_path != WORKSPACE_ROOT:
                required = "full"
                if _permission_rank(session.permission_level) < _permission_rank(required):
                    raise HTTPException(
                        status_code=403,
                        detail=f"Path outside workspace requires '{required}' permission: {target_path}",
                    )
                if not session.full_control_consent:
                    raise HTTPException(
                        status_code=403,
                        detail=f"Path outside workspace requires explicit full-control consent: {target_path}",
                    )

    interactive = bool(payload.get("requireInteractiveApproval", REQUIRE_INTERACTIVE_APPROVAL))
    approval_code = str(payload.get("approvalCode", "")).strip()
    if interactive and required in {"auto", "full"}:
        if not session.interactive_approval_code or not session.approval_code_expires_at:
            raise HTTPException(status_code=403, detail="Interactive approval challenge required.")
        if time.time() > session.approval_code_expires_at:
            session.interactive_approval_code = None
            session.approval_code_expires_at = None
            raise HTTPException(status_code=403, detail="Interactive approval challenge expired.")
        if not approval_code or not secrets.compare_digest(approval_code, session.interactive_approval_code):
            raise HTTPException(status_code=403, detail="Interactive approval code mismatch.")


async def _execute_command_pipeline(session: Session, payload: dict[str, Any]) -> dict[str, Any]:
    requested_mode = str(payload.get("modelMode", "")).strip().lower()
    needs_32b = bool(payload.get("needs_32b", False))
    complexity = payload.get("complexityScore")
    high_complexity = isinstance(complexity, (int, float)) and float(complexity) >= 0.82
    if requested_mode in ALLOWED_MODEL_MODES:
        target_mode: ModelMode = "coding" if requested_mode == "coding" else "fast"
    elif needs_32b or high_complexity:
        target_mode = "coding"
    else:
        target_mode = "fast"
    if target_mode != session.model_mode:
        gpu = _get_gpu_telemetry()
        started_switch = time.perf_counter()
        ok, details = _lifecycle.switch(target_mode, reason="command-pipeline", gpu=gpu)
        _slo.record("switch_mode", (time.perf_counter() - started_switch) * 1000)
        if not ok:
            session.runtime_state = "degraded"
            raise HTTPException(status_code=409, detail=f"Model mode switch rejected: {details}")
        session.model_mode = target_mode

    session.runtime_state = "thinking_fast" if session.model_mode == "fast" else "coding_hardcore"
    if session.model_mode == "coding":
        _lifecycle.mark_coding_activity()

    t0 = time.perf_counter()
    await asyncio.sleep(0)
    _slo.record("intent", (time.perf_counter() - t0) * 1000)

    t1 = time.perf_counter()
    await asyncio.sleep(0)
    _slo.record("policy_gate", (time.perf_counter() - t1) * 1000)

    t2 = time.perf_counter()
    await asyncio.sleep(0)
    _slo.record("rag_retrieval", (time.perf_counter() - t2) * 1000)

    t3 = time.perf_counter()
    await asyncio.sleep(0)
    _slo.record("tool_execution", (time.perf_counter() - t3) * 1000)

    t4 = time.perf_counter()
    await asyncio.sleep(0)
    _slo.record("response", (time.perf_counter() - t4) * 1000)

    command = str(payload.get("command", "")).strip().lower() or "unknown"
    result = {
        "ok": True,
        "command": command,
        "runtimeState": session.runtime_state,
        "modelMode": session.model_mode,
        "permissionLevel": session.permission_level,
        "response": {
            "text": str(payload.get("prompt", "")).strip() or "Command accepted by orchestrator.",
            "source": "jarvis-server-agent",
            "needs32b": needs_32b or high_complexity,
        },
    }
    _append_audit(
        {
            "event": "command_execute",
            "command": command,
            "permissionLevel": session.permission_level,
            "modelMode": session.model_mode,
            "runtimeState": session.runtime_state,
            "result": "ok",
        }
    )
    session.runtime_state = "idle"
    return result


app = FastAPI(title="JARVIS Server Agent", version="2.0.0")


@app.get("/health")
async def health():
    metrics = await _collect_metrics()
    degraded = any(svc != "online" for svc in metrics["services"].values())
    status = "degraded" if degraded else "ok"
    return {
        "status": status,
        "timestamp": int(time.time()),
        "runtimeStates": sorted(ALLOWED_RUNTIME_STATES),
        "modelModes": sorted(ALLOWED_MODEL_MODES),
    }


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
        "runtimeState": session.runtime_state,
        "modelMode": session.model_mode,
    }


@app.post("/v1/pair/rotate")
async def pair_rotate(authorization: str | None = Header(default=None)):
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Missing token.")
    next_session = await _rotate_session(token)
    return {
        "ok": True,
        "sessionToken": next_session.token,
        "expiresAt": int(next_session.expires_at),
    }


@app.post("/v1/runtime/permissions")
async def runtime_permissions(
    payload: dict[str, Any],
    authorization: str | None = Header(default=None),
):
    session = await _get_session(_extract_bearer(authorization))
    requested = str(payload.get("level", "default")).strip().lower()
    if requested not in ALLOWED_PERMISSION_LEVELS:
        raise HTTPException(status_code=400, detail="Invalid permission level.")
    if requested == "full" and not bool(payload.get("fullControlConsent", False)):
        raise HTTPException(status_code=400, detail="Full control requires explicit consent.")

    if bool(payload.get("createInteractiveApprovalChallenge", False)):
        session.interactive_approval_code = secrets.token_urlsafe(6)
        session.approval_code_expires_at = time.time() + 120

    session.permission_level = requested  # type: ignore[assignment]
    session.full_control_consent = bool(payload.get("fullControlConsent", False))
    _append_audit(
        {
            "event": "permission_update",
            "permissionLevel": session.permission_level,
            "fullControlConsent": session.full_control_consent,
        }
    )
    return {
        "ok": True,
        "permissionLevel": session.permission_level,
        "interactiveApprovalChallenge": {
            "code": session.interactive_approval_code,
            "expiresAt": int(session.approval_code_expires_at or 0) if session.interactive_approval_code else None,
        },
    }


@app.get("/v1/runtime/status")
async def runtime_status(authorization: str | None = Header(default=None)):
    session = await _get_session(_extract_bearer(authorization))
    metrics = await _collect_metrics()
    return {
        "ok": True,
        "state": "synchronized",
        "runtimeState": session.runtime_state,
        "modelMode": session.model_mode,
        "permissionLevel": session.permission_level,
        "metrics": metrics,
        "allowedDirectory": ALLOWED_DIRECTORY,
    }


@app.get("/v1/runtime/state")
async def runtime_state(authorization: str | None = Header(default=None)):
    session = await _get_session(_extract_bearer(authorization))
    return {
        "ok": True,
        "runtimeState": session.runtime_state,
        "modelMode": session.model_mode,
        "permissionLevel": session.permission_level,
        "fullControlConsent": session.full_control_consent,
        "states": sorted(ALLOWED_RUNTIME_STATES),
        "modelModes": sorted(ALLOWED_MODEL_MODES),
    }


@app.post("/v1/runtime/state")
async def set_runtime_state(payload: dict[str, Any], authorization: str | None = Header(default=None)):
    session = await _get_session(_extract_bearer(authorization))
    requested = str(payload.get("runtimeState", "")).strip().lower()
    if requested not in ALLOWED_RUNTIME_STATES:
        raise HTTPException(status_code=400, detail="Invalid runtime state.")
    session.runtime_state = requested  # type: ignore[assignment]
    return {"ok": True, "runtimeState": session.runtime_state}


@app.post("/v1/runtime/model-mode")
async def set_model_mode(payload: dict[str, Any], authorization: str | None = Header(default=None)):
    session = await _get_session(_extract_bearer(authorization))
    requested = str(payload.get("modelMode", "")).strip().lower()
    if requested not in ALLOWED_MODEL_MODES:
        raise HTTPException(status_code=400, detail="Invalid model mode.")

    target: ModelMode = "coding" if requested == "coding" else "fast"
    gpu = _get_gpu_telemetry()
    started = time.perf_counter()
    ok, details = _lifecycle.switch(target, reason="api-request", gpu=gpu)
    _slo.record("switch_mode", (time.perf_counter() - started) * 1000)
    if not ok:
        session.runtime_state = "degraded"
        raise HTTPException(status_code=409, detail=details)

    session.model_mode = target
    session.runtime_state = "coding_hardcore" if target == "coding" else "thinking_fast"
    return {"ok": True, "modelMode": session.model_mode, "runtimeState": session.runtime_state}


@app.get("/v1/runtime/metrics")
async def runtime_metrics(authorization: str | None = Header(default=None)):
    await _get_session(_extract_bearer(authorization))
    metrics = await _collect_metrics()
    return {"ok": True, "metrics": metrics, "auditTail": _audit_log[-100:]}


@app.post("/v1/runtime/command")
async def runtime_command(payload: dict[str, Any], authorization: str | None = Header(default=None)):
    session = await _get_session(_extract_bearer(authorization))
    await _ensure_command_authorized(session, payload)
    return await _execute_command_pipeline(session, payload)


@app.post("/v1/runtime/kill-switch")
async def runtime_kill_switch(authorization: str | None = Header(default=None)):
    token = _extract_bearer(authorization)
    session = await _get_session(token)
    session.runtime_state = "killed"
    async with _lock:
        if token:
            _sessions.pop(token, None)
    _append_audit({"event": "kill_switch", "result": "disconnected"})
    return {"ok": True, "state": "disconnected"}


@app.exception_handler(HTTPException)
async def auth_handler(_, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"ok": False, "error": str(exc.detail)})


async def _send_status(websocket, session: Session, phase: str, details: str | None = None):
    payload = {
        "type": "status",
        "phase": phase,
        "runtimeState": session.runtime_state,
        "modelMode": session.model_mode,
        "permissionLevel": session.permission_level,
    }
    if details:
        payload["details"] = details
    await websocket.send(json.dumps(payload))


async def ws_handler(websocket):
    query = websocket.path.split("?", 1)[1] if "?" in websocket.path else ""
    params = dict(
        pair.split("=", 1) if "=" in pair else (pair, "")
        for pair in query.split("&")
        if pair
    )
    token = (params.get("token") or "").strip()
    session = None
    if token:
        async with _lock:
            session = _sessions.get(token)
    if not session:
        try:
            raw = await asyncio.wait_for(websocket.recv(), timeout=5)
            message = json.loads(raw)
        except Exception:
            await websocket.close(code=4401, reason="Unauthorized")
            return
        if str(message.get("type", "")).strip() != "auth":
            await websocket.close(code=4401, reason="Unauthorized")
            return
        token = str(message.get("token", "")).strip()
        async with _lock:
            session = _sessions.get(token)
    if not session or session.expired:
        await websocket.close(code=4401, reason="Unauthorized")
        return

    await _send_status(websocket, session, "connected")

    while True:
        try:
            raw = await websocket.recv()
        except Exception:
            break
        try:
            message = json.loads(raw)
        except Exception:
            continue
        msg_type = str(message.get("type", "")).strip()

        if msg_type == "configure":
            runtime_state = str(message.get("runtimeState", session.runtime_state)).strip().lower()
            if runtime_state in ALLOWED_RUNTIME_STATES:
                session.runtime_state = runtime_state  # type: ignore[assignment]
            await _send_status(websocket, session, "configured")
        elif msg_type == "audio_chunk":
            data = str(message.get("data", ""))
            if data:
                try:
                    pcm = base64.b64decode(data)
                    await websocket.send(
                        json.dumps(
                            {
                                "type": "audio",
                                "event": "rms_level",
                                "source": "mic",
                                "rms": min(1.0, len(pcm) / 65536.0),
                                "timestamp": time.time(),
                                "runtimeState": session.runtime_state,
                            }
                        )
                    )
                except Exception:
                    pass
        elif msg_type == "permission_update":
            requested = str(message.get("level", session.permission_level)).strip().lower()
            if requested in ALLOWED_PERMISSION_LEVELS:
                session.permission_level = requested  # type: ignore[assignment]
            session.full_control_consent = bool(message.get("fullControlConsent", session.full_control_consent))
            await websocket.send(
                json.dumps(
                    {
                        "type": "permissions",
                        "permissionLevel": session.permission_level,
                        "fullControlConsent": session.full_control_consent,
                    }
                )
            )
        elif msg_type == "model_mode":
            requested = str(message.get("modelMode", session.model_mode)).strip().lower()
            target: ModelMode = "coding" if requested == "coding" else "fast"
            gpu = _get_gpu_telemetry()
            ok, details = _lifecycle.switch(target, reason="ws", gpu=gpu)
            if ok:
                session.model_mode = target
                session.runtime_state = "coding_hardcore" if target == "coding" else "thinking_fast"
            else:
                session.runtime_state = "degraded"
            await websocket.send(
                json.dumps(
                    {
                        "type": "model_mode",
                        "ok": ok,
                        "modelMode": session.model_mode,
                        "runtimeState": session.runtime_state,
                        "details": details,
                    }
                )
            )
        elif msg_type == "tool_call":
            tool = str(message.get("tool", "")).strip().lower()
            if tool == "web_search":
                started = time.perf_counter()
                query_text = str(message.get("query", "")).strip()
                search = await _fetch_json(f"{SEARXNG_URL}/search?q={quote_plus(query_text)}&format=json", timeout=6.0)
                _slo.record("web_search", (time.perf_counter() - started) * 1000)
                await websocket.send(
                    json.dumps(
                        {
                            "type": "tool_result",
                            "tool": "web_search",
                            "ok": bool(search),
                            "results": (search or {}).get("results", [])[:5],
                        }
                    )
                )
            else:
                await websocket.send(
                    json.dumps({"type": "tool_result", "tool": tool, "ok": False, "results": []})
                )
        elif msg_type == "command_execute":
            try:
                await _ensure_command_authorized(session, message)
                response = await _execute_command_pipeline(session, message)
                await websocket.send(json.dumps({"type": "command_result", **response}))
            except HTTPException as exc:
                await websocket.send(
                    json.dumps({"type": "command_result", "ok": False, "error": str(exc.detail)})
                )
        elif msg_type == "ping":
            await websocket.send(json.dumps({"type": "pong", "timestamp": int(time.time())}))
        else:
            await websocket.send(
                json.dumps(
                    {
                        "type": "error",
                        "message": f"Unsupported runtime message type: {msg_type}",
                    }
                )
            )


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
