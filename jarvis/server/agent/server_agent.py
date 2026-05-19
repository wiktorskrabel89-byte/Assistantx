from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
import time
from pathlib import Path
from typing import Any

from websockets.exceptions import ConnectionClosed
from websockets.server import WebSocketServerProtocol, serve
from urllib.parse import parse_qs
from urllib.parse import urlparse

from auth import AuthError, validate_jwt
from tools import TOOLS

LOG_DIR = Path(os.environ.get("JARVIS_LOG_DIR", "/srv/jarvis/logs"))
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "agent.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [jarvis-agent] %(levelname)s %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("jarvis-agent")

WS_HOST = os.environ.get("JARVIS_AGENT_WS_HOST", "0.0.0.0")
WS_PORT = int(os.environ.get("JARVIS_AGENT_WS_PORT", "9000"))
PAIR_HOST = os.environ.get("JARVIS_PAIR_BIND_HOST", "0.0.0.0")
PAIR_PORT = int(os.environ.get("JARVIS_PAIR_HTTP_PORT", "9001"))
SYNC_KEY_FILE = Path(os.environ.get("JARVIS_SYNC_KEY_FILE", "/srv/jarvis/.sync-key"))
PAIR_CONSUMED_FILE = Path(os.environ.get("JARVIS_PAIR_CONSUMED_FILE", "/srv/jarvis/.pair-key-consumed"))
AGENT_STATE_DIR = Path(os.environ.get("JARVIS_AGENT_STATE_DIR", "/srv/jarvis/agent_state"))

AGENT_STATE_DIR.mkdir(parents=True, exist_ok=True)
SYNC_KEY_FILE.parent.mkdir(parents=True, exist_ok=True)


def ensure_sync_key() -> str:
    existing = os.environ.get("JARVIS_SYNC_KEY", "").strip()
    if existing:
        return existing

    if SYNC_KEY_FILE.exists():
        content = SYNC_KEY_FILE.read_text(encoding="utf-8").strip()
        if content:
            return content

    generated = secrets.token_hex(32)
    SYNC_KEY_FILE.write_text(generated, encoding="utf-8")
    SYNC_KEY_FILE.chmod(0o600)
    logger.info("Generated new sync key at %s", SYNC_KEY_FILE)
    return generated


SYNC_KEY = ensure_sync_key()


async def emit_event(ws: WebSocketServerProtocol, action: str, status: str, payload: dict[str, Any] | None = None) -> None:
    message = {
        "type": "agent_event",
        "action": action,
        "status": status,
        "payload": payload or {},
        "timestamp": int(time.time() * 1000),
    }
    await ws.send(json.dumps(message))


async def run_tool(ws: WebSocketServerProtocol, message: dict[str, Any]) -> None:
    tool = str(message.get("tool") or "").strip()
    request_id = str(message.get("requestId") or "")
    args = message.get("args")
    if not isinstance(args, dict):
        args = {}

    handler = TOOLS.get(tool)
    if handler is None:
        await ws.send(
            json.dumps(
                {
                    "type": "tool_result",
                    "requestId": request_id,
                    "tool": tool,
                    "ok": False,
                    "error": "tool-not-found",
                }
            )
        )
        return

    await emit_event(ws, action=tool, status="started", payload={"requestId": request_id})
    try:
        result = await handler(**args)
        await emit_event(ws, action=tool, status="completed", payload={"requestId": request_id})
        await ws.send(
            json.dumps(
                {
                    "type": "tool_result",
                    "requestId": request_id,
                    "tool": tool,
                    "ok": bool(result.get("ok", True)),
                    "result": result,
                }
            )
        )
    except Exception as exc:  # pragma: no cover
        logger.exception("Tool execution failed: %s", tool)
        await emit_event(ws, action=tool, status="failed", payload={"requestId": request_id, "error": str(exc)})
        await ws.send(
            json.dumps(
                {
                    "type": "tool_result",
                    "requestId": request_id,
                    "tool": tool,
                    "ok": False,
                    "error": str(exc),
                }
            )
        )


async def ws_handler(ws: WebSocketServerProtocol) -> None:
    remote = ws.remote_address[0] if ws.remote_address else "unknown"
    logger.info("WS connected from %s", remote)

    try:
        raw_handshake = await asyncio.wait_for(ws.recv(), timeout=10)
    except Exception:
        await ws.close(code=4001, reason="handshake-timeout")
        return

    try:
        handshake = json.loads(raw_handshake)
    except json.JSONDecodeError:
        await ws.close(code=4002, reason="invalid-handshake-json")
        return

    if handshake.get("type") != "handshake":
        await ws.close(code=4003, reason="handshake-required")
        return

    token = str(handshake.get("auth") or "")
    try:
        claims = validate_jwt(token)
    except AuthError as exc:
        await ws.close(code=4004, reason=f"unauthorized:{exc}")
        return

    await ws.send(
        json.dumps(
            {
                "type": "status",
                "phase": "authenticated",
                "message": "Handshake accepted",
                "subject": claims.get("sub", "unknown"),
            }
        )
    )

    try:
        async for raw in ws:
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send(json.dumps({"type": "error", "error": "invalid-json"}))
                continue

            msg_type = str(message.get("type") or "").strip()
            if msg_type == "ping":
                await ws.send(json.dumps({"type": "pong", "timestamp": int(time.time() * 1000)}))
                continue
            if msg_type == "state_sync":
                state = str(message.get("state") or "IDLE")
                await ws.send(json.dumps({"type": "status", "phase": "state_sync", "state": state}))
                continue
            if msg_type == "tool_call":
                await run_tool(ws, message)
                continue

            await ws.send(json.dumps({"type": "error", "error": "unsupported-message-type", "messageType": msg_type}))
    except ConnectionClosed:
        logger.info("WS disconnected: %s", remote)


async def _pair_key_response(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    peer = writer.get_extra_info("peername")
    host = peer[0] if peer else "unknown"
    try:
        request_bytes = await asyncio.wait_for(reader.read(2048), timeout=3)
    except asyncio.TimeoutError:
        writer.close()
        await writer.wait_closed()
        return

    request = request_bytes.decode("utf-8", errors="ignore")
    request_line = request.splitlines()[0] if request else ""
    path = request_line.split(" ")[1] if " " in request_line else "/"
    parsed = urlparse(path)
    method = request_line.split(" ")[0] if request_line else "GET"

    def respond(status: str, body: str, content_type: str = "application/json") -> None:
        data = body.encode("utf-8")
        response = (
            f"HTTP/1.1 {status}\r\n"
            f"Content-Type: {content_type}\r\n"
            f"Content-Length: {len(data)}\r\n"
            "Connection: close\r\n\r\n"
        ).encode("utf-8") + data
        writer.write(response)

    if method != "GET" or parsed.path != "/pair-key":
        respond("404 Not Found", json.dumps({"ok": False, "error": "not-found"}))
    elif host not in {"127.0.0.1", "::1"}:
        respond("403 Forbidden", json.dumps({"ok": False, "error": "localhost-only"}))
    elif PAIR_CONSUMED_FILE.exists():
        respond("410 Gone", json.dumps({"ok": False, "error": "pair-key-already-consumed"}))
    else:
        query = parse_qs(parsed.query)
        mark_consumed = query.get("consume", ["1"])[0] != "0"
        respond("200 OK", json.dumps({"ok": True, "syncKey": SYNC_KEY}))
        if mark_consumed:
            PAIR_CONSUMED_FILE.write_text(str(int(time.time())), encoding="utf-8")
            PAIR_CONSUMED_FILE.chmod(0o600)

    await writer.drain()
    writer.close()
    await writer.wait_closed()


async def run_pair_server() -> asyncio.AbstractServer:
    server = await asyncio.start_server(_pair_key_response, host=PAIR_HOST, port=PAIR_PORT)
    logger.info("Pairing HTTP server listening on http://%s:%s", PAIR_HOST, PAIR_PORT)
    return server


async def main() -> None:
    pair_server = await run_pair_server()
    async with serve(ws_handler, WS_HOST, WS_PORT, max_size=4_000_000):
        logger.info("WebSocket server listening on ws://%s:%s", WS_HOST, WS_PORT)
        try:
            await asyncio.Future()
        finally:
            pair_server.close()
            await pair_server.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())
