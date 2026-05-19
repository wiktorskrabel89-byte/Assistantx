"""
Jarvis AI-Agent Sidecar — main entry point.

Starts a WebSocket server (default ws://127.0.0.1:8765) that the Electron
desktop renderer connects to.  All voice pipeline modules are loaded lazily
so the server starts quickly even when optional ML models are still being
downloaded.

Message protocol (JSON lines sent by client → handled here):
  { "type": "configure",    ...settings }
  { "type": "audio_chunk",  "data": "<base64 PCM int16 LE>" }
  { "type": "tts_speak",    "text": "...", "requestId": "..." }
  { "type": "parse_intent", "text": "...", "requestId": "..." }
  { "type": "memory_upsert", "text": "...", "metadata": {...}, "requestId": "..." }
  { "type": "memory_search", "query": "...", "topK": 5, "requestId": "..." }
  { "type": "tool_call", "tool": "web_search", "query": "...", "requestId": "..." }

Events emitted to client:
  { "type": "status",           "phase": "...", "message": "..." }
  { "type": "wake_word",        "phrase": "..." }
  { "type": "vad_event",        "phase": "speech_start|speech_end", "sampleRate": 16000 }
  { "type": "audio_segment",    "data": "<base64 PCM int16 LE>", "format": "audio/raw", "sampleRate": 16000 }
  { "type": "stt_result",       "text": "...", "isFinal": bool }
  { "type": "tts_audio",        "requestId": "...", "data": "<base64 WAV>", "format": "wav" }
  { "type": "intent_parsed",    "requestId": "...", "intent": "...", "entities": {...}, "confidence": float }
  { "type": "memory_upsert_result", "requestId": "...", "ok": bool, "id": "..." }
  { "type": "memory_search_result", "requestId": "...", "results": [...] }
  { "type": "tool_result", "requestId": "...", "tool": "web_search", "ok": bool, "results": [...] }
  { "type": "error",            "message": "..." }
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import signal
import struct
import sys
import time
import wave
from io import BytesIO
from typing import Any

import websockets
from websockets.server import WebSocketServerProtocol

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [sidecar] %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("jarvis-sidecar")

HOST = os.environ.get("JARVIS_SIDECAR_HOST", "127.0.0.1")
PORT = int(os.environ.get("JARVIS_SIDECAR_PORT", "8765"))
STARTED_AT = time.monotonic()

# ── Lazy-loaded pipeline singletons ──────────────────────────────────────────
_wake_detector: Any = None
_stt_engine: Any = None
_tts_engine: Any = None
_nlp_engine: Any = None
_vad_engine: Any = None
_memory_store: Any = None


def _get_wake_detector():
    global _wake_detector
    if _wake_detector is None:
        from wakeword.detector import WakeWordDetector
        _wake_detector = WakeWordDetector()
    return _wake_detector


def _get_stt_engine():
    global _stt_engine
    if _stt_engine is None:
        from speech.parakeet_stt import ParakeetSTT
        _stt_engine = ParakeetSTT()
    return _stt_engine


def _get_tts_engine():
    global _tts_engine
    if _tts_engine is None:
        from tts.kokoro_tts import KokoroTTS
        _tts_engine = KokoroTTS()
    return _tts_engine


def _get_nlp_engine():
    global _nlp_engine
    if _nlp_engine is None:
        from nlp.intent_parser import IntentParser
        _nlp_engine = IntentParser()
    return _nlp_engine


def _get_vad_engine():
    global _vad_engine
    if _vad_engine is None:
        from speech.vad import SileroVAD
        _vad_engine = SileroVAD()
    return _vad_engine


def _get_memory_store():
    global _memory_store
    if _memory_store is None:
        from memory.store import MemoryStore
        _memory_store = MemoryStore()
    return _memory_store


def _health_snapshot() -> dict[str, Any]:
    stt_ready = _stt_engine is not None
    tts_ready = _tts_engine is not None
    models_loaded = stt_ready and tts_ready
    status = "healthy" if models_loaded else "starting"
    return {
        "status": status,
        "modelsLoaded": models_loaded,
        "stt": stt_ready,
        "tts": tts_ready,
        "memory": _memory_store is not None,
        "uptime": int(time.monotonic() - STARTED_AT),
    }


# ── Per-connection audio pipeline state ──────────────────────────────────────
class ConnectionState:
    def __init__(self) -> None:
        self.wake_word_phrase: str = "hey jarvis"
        self.language: str = "en"
        self.wake_word_enabled: bool = True
        self.stt_enabled: bool = False
        self.tts_enabled: bool = True
        self.nlp_enabled: bool = False
        self.vad_enabled: bool = True
        self.listening_for_command: bool = False
        self.audio_buffer: list[bytes] = []
        self.command_audio_buffer: list[bytes] = []
        self.speech_active: bool = False
        self.trailing_silence_frames: int = 0
        self.sample_rate: int = 16000
        self.outbound_queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=256)
        self.last_rms_sent_at: float = 0.0


async def _send(ws: WebSocketServerProtocol, payload: dict, state: ConnectionState | None = None) -> None:
    if state is not None:
        try:
            state.outbound_queue.put_nowait(payload)
            return
        except asyncio.QueueFull:
            try:
                _ = state.outbound_queue.get_nowait()
            except Exception:
                pass
            try:
                state.outbound_queue.put_nowait(payload)
                return
            except Exception:
                pass
    try:
        await ws.send(json.dumps(payload))
    except Exception:
        pass


async def _handle_configure(ws: WebSocketServerProtocol, state: ConnectionState, msg: dict) -> None:
    if "wakeWordPhrase" in msg:
        state.wake_word_phrase = str(msg["wakeWordPhrase"]).strip().lower()
    if "language" in msg:
        state.language = str(msg["language"]).strip().split("-")[0]
    if "wakeWordEnabled" in msg:
        state.wake_word_enabled = bool(msg["wakeWordEnabled"])
    if "sttEnabled" in msg:
        state.stt_enabled = bool(msg["sttEnabled"])
    if "ttsEnabled" in msg:
        state.tts_enabled = bool(msg["ttsEnabled"])
    if "nlpEnabled" in msg:
        state.nlp_enabled = bool(msg["nlpEnabled"])
    if "sampleRate" in msg:
        state.sample_rate = int(msg["sampleRate"])
    if "vadEnabled" in msg:
        state.vad_enabled = bool(msg["vadEnabled"])
    if "listeningForCommand" in msg:
        state.listening_for_command = bool(msg["listeningForCommand"])
    await _send(ws, {"type": "status", "phase": "configured", "message": "Settings applied."}, state)


async def _handle_audio_chunk(ws: WebSocketServerProtocol, state: ConnectionState, msg: dict) -> None:
    raw_b64 = msg.get("data", "")
    if not raw_b64:
        return

    try:
        pcm_bytes = base64.b64decode(raw_b64)
    except Exception:
        return

    _emit_rms(state, pcm_bytes, source="mic", sample_rate=state.sample_rate)
    state.audio_buffer.append(pcm_bytes)

    # Keep a rolling buffer of ~3 seconds worth of audio
    max_frames = 3 * state.sample_rate * 2  # int16 → 2 bytes/sample
    total = sum(len(chunk) for chunk in state.audio_buffer)
    while total > max_frames and state.audio_buffer:
        removed = state.audio_buffer.pop(0)
        total -= len(removed)

    loop = asyncio.get_event_loop()

    # Wake word detection path
    if state.wake_word_enabled and not state.listening_for_command:
        try:
            detector = _get_wake_detector()
            detected = await loop.run_in_executor(
                None, detector.process_chunk, pcm_bytes, state.sample_rate
            )
            if detected:
                state.listening_for_command = True
                state.audio_buffer.clear()
                await _send(ws, {"type": "wake_word", "phrase": state.wake_word_phrase}, state)
                return
        except Exception as exc:
            logger.debug("Wake word processing error: %s", exc)

    # VAD-gated command audio path (primary architecture path)
    if state.vad_enabled and state.listening_for_command:
        try:
            vad = _get_vad_engine()
            speech = await loop.run_in_executor(
                None, vad.is_speech, pcm_bytes, state.sample_rate
            )
            if speech:
                state.command_audio_buffer.append(pcm_bytes)
                state.trailing_silence_frames = 0
                if not state.speech_active:
                    state.speech_active = True
                    await _send(ws, {
                        "type": "vad_event",
                        "phase": "speech_start",
                        "sampleRate": state.sample_rate,
                    }, state)
            else:
                if state.speech_active:
                    state.command_audio_buffer.append(pcm_bytes)
                state.trailing_silence_frames += 1

            # ~0.4 s silence threshold for end-of-utterance with 100 ms chunks.
            if state.speech_active and state.trailing_silence_frames >= 4:
                segment = b"".join(state.command_audio_buffer).strip()
                await _send(ws, {
                    "type": "vad_event",
                    "phase": "speech_end",
                    "sampleRate": state.sample_rate,
                }, state)
                if segment:
                    encoded = base64.b64encode(segment).decode("ascii")
                    await _send(ws, {
                        "type": "audio_segment",
                        "data": encoded,
                        "format": "audio/raw",
                        "sampleRate": state.sample_rate,
                    }, state)
                state.command_audio_buffer.clear()
                state.speech_active = False
                state.trailing_silence_frames = 0
                state.listening_for_command = False
        except Exception as exc:
            logger.debug("VAD processing error: %s", exc)

    # Legacy local STT fallback path — disabled by default
    if state.stt_enabled and state.listening_for_command:
        try:
            stt = _get_stt_engine()
            combined = b"".join(state.audio_buffer)
            result = await loop.run_in_executor(
                None, stt.transcribe_chunk, combined, state.language, state.sample_rate
            )
            if result:
                is_final = result.get("is_final", False)
                text = result.get("text", "").strip()
                if text:
                    await _send(ws, {
                        "type": "stt_result",
                        "text": text,
                        "isFinal": is_final,
                    }, state)
                if is_final:
                    state.listening_for_command = False
                    state.audio_buffer.clear()
                    state.command_audio_buffer.clear()
                    state.speech_active = False
                    state.trailing_silence_frames = 0
        except Exception as exc:
            logger.debug("STT processing error: %s", exc)


async def _handle_tts_speak(ws: WebSocketServerProtocol, state: ConnectionState, msg: dict) -> None:
    text = str(msg.get("text", "")).strip()
    request_id = str(msg.get("requestId", ""))
    if not text:
        return

    if not state.tts_enabled:
        await _send(ws, {"type": "status", "phase": "tts_skipped", "message": "TTS disabled."}, state)
        return

    loop = asyncio.get_event_loop()
    try:
        tts = _get_tts_engine()
        wav_bytes = await loop.run_in_executor(None, tts.synthesize, text)
        _emit_rms_from_wav(state, wav_bytes, source="tts")
        encoded = base64.b64encode(wav_bytes).decode("ascii")
        await _send(ws, {
            "type": "tts_audio",
            "requestId": request_id,
            "data": encoded,
            "format": "wav",
        }, state)
    except Exception as exc:
        logger.warning("TTS error: %s", exc)
        await _send(ws, {
            "type": "error",
            "message": f"TTS synthesis failed: {exc}",
            "requestId": request_id,
        }, state)


async def _handle_parse_intent(ws: WebSocketServerProtocol, state: ConnectionState, msg: dict) -> None:
    text = str(msg.get("text", "")).strip()
    request_id = str(msg.get("requestId", ""))
    if not text:
        return

    loop = asyncio.get_event_loop()
    try:
        nlp = _get_nlp_engine()
        result = await loop.run_in_executor(None, nlp.parse, text)
        await _send(ws, {
            "type": "intent_parsed",
            "requestId": request_id,
            "intent": result.get("intent", "unknown"),
            "action": result.get("action", result.get("intent", "unknown")),
            "intentKind": result.get("intent_kind", "system"),
            "entities": result.get("entities", {}),
            "confidence": result.get("confidence", 0.0),
        }, state)
    except Exception as exc:
        logger.warning("NLP error: %s", exc)
        await _send(ws, {
            "type": "error",
            "message": f"Intent parsing failed: {exc}",
            "requestId": request_id,
        }, state)


async def _handle_memory_upsert(ws: WebSocketServerProtocol, _state: ConnectionState, msg: dict) -> None:
    text = str(msg.get("text", "")).strip()
    request_id = str(msg.get("requestId", ""))
    metadata = msg.get("metadata", {})
    if not text:
        return
    loop = asyncio.get_event_loop()
    try:
        store = _get_memory_store()
        result = await loop.run_in_executor(None, store.upsert, text, metadata if isinstance(metadata, dict) else {})
        await _send(ws, {
            "type": "memory_upsert_result",
            "requestId": request_id,
            "ok": bool(result.get("ok")),
            "id": result.get("id", ""),
        }, _state)
    except Exception as exc:
        logger.warning("Memory upsert error: %s", exc)
        await _send(ws, {
            "type": "error",
            "message": f"Memory upsert failed: {exc}",
            "requestId": request_id,
        }, _state)


async def _handle_memory_search(ws: WebSocketServerProtocol, _state: ConnectionState, msg: dict) -> None:
    query = str(msg.get("query", "")).strip()
    request_id = str(msg.get("requestId", ""))
    top_k = int(msg.get("topK", 5) or 5)
    if not query:
        return
    loop = asyncio.get_event_loop()
    try:
        store = _get_memory_store()
        results = await loop.run_in_executor(None, store.search, query, top_k)
        await _send(ws, {
            "type": "memory_search_result",
            "requestId": request_id,
            "results": results,
        }, _state)
    except Exception as exc:
        logger.warning("Memory search error: %s", exc)
        await _send(ws, {
            "type": "error",
            "message": f"Memory search failed: {exc}",
            "requestId": request_id,
        }, _state)


async def _handle_tool_call(ws: WebSocketServerProtocol, _state: ConnectionState, msg: dict) -> None:
    tool = str(msg.get("tool", "")).strip().lower()
    request_id = str(msg.get("requestId", ""))
    query = str(msg.get("query", "")).strip()
    if not tool:
        return
    if tool != "web_search":
        await _send(ws, {
            "type": "tool_result",
            "requestId": request_id,
            "tool": tool,
            "ok": False,
            "results": [],
        }, _state)
        return
    loop = asyncio.get_event_loop()
    try:
        from tools.web_search import search_web
        results = await loop.run_in_executor(None, search_web, query, 5)
        await _send(ws, {
            "type": "tool_result",
            "requestId": request_id,
            "tool": "web_search",
            "ok": True,
            "results": results,
        }, _state)
    except Exception as exc:
        logger.warning("Tool call error: %s", exc)
        await _send(ws, {
            "type": "tool_result",
            "requestId": request_id,
            "tool": "web_search",
            "ok": False,
            "results": [],
            "error": str(exc),
        }, _state)


HANDLERS = {
    "configure": _handle_configure,
    "audio_chunk": _handle_audio_chunk,
    "tts_speak": _handle_tts_speak,
    "parse_intent": _handle_parse_intent,
    "memory_upsert": _handle_memory_upsert,
    "memory_search": _handle_memory_search,
    "tool_call": _handle_tool_call,
}


async def handle_connection(ws: WebSocketServerProtocol) -> None:
    addr = ws.remote_address
    logger.info("Client connected: %s", addr)
    state = ConnectionState()
    sender_task = asyncio.create_task(_sender_loop(ws, state))

    await _send(ws, {
        "type": "status",
        "phase": "connected",
        "message": "Jarvis AI-Agent sidecar ready.",
    }, state)

    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            msg_type = str(msg.get("type", ""))
            handler = HANDLERS.get(msg_type)
            if handler:
                await handler(ws, state, msg)
            else:
                logger.debug("Unknown message type: %s", msg_type)
    except websockets.exceptions.ConnectionClosedOK:
        pass
    except websockets.exceptions.ConnectionClosedError as exc:
        logger.debug("Connection closed with error: %s", exc)
    finally:
        sender_task.cancel()
        try:
            await sender_task
        except BaseException:
            pass
        logger.info("Client disconnected: %s", addr)


async def _sender_loop(ws: WebSocketServerProtocol, state: ConnectionState) -> None:
    while True:
        payload = await state.outbound_queue.get()
        try:
            await ws.send(json.dumps(payload))
        except Exception:
            return


def _emit_rms(state: ConnectionState, pcm_bytes: bytes, source: str, sample_rate: int) -> None:
    if not pcm_bytes:
        return
    now = time.monotonic()
    if now - state.last_rms_sent_at < 0.06:
        return
    state.last_rms_sent_at = now
    rms = _pcm_int16_rms(pcm_bytes)
    payload = {
        "type": "rms_level",
        "source": source,
        "rms": round(float(rms), 6),
        "sampleRate": int(sample_rate or 16000),
        "timestamp": time.time(),
    }
    try:
        state.outbound_queue.put_nowait(payload)
    except asyncio.QueueFull:
        pass


def _emit_rms_from_wav(state: ConnectionState, wav_bytes: bytes, source: str) -> None:
    if not wav_bytes:
        return
    try:
        with wave.open(BytesIO(wav_bytes), "rb") as wav_reader:
            frame_rate = wav_reader.getframerate() or 24000
            frames = wav_reader.readframes(min(wav_reader.getnframes(), frame_rate // 4))
            _emit_rms(state, frames, source=source, sample_rate=frame_rate)
    except Exception:
        pass


def _pcm_int16_rms(pcm_bytes: bytes) -> float:
    samples_count = len(pcm_bytes) // 2
    if samples_count <= 0:
        return 0.0
    try:
        samples = struct.unpack(f"<{samples_count}h", pcm_bytes[: samples_count * 2])
    except Exception:
        return 0.0
    squared_sum = sum(float(sample) * float(sample) for sample in samples)
    if squared_sum <= 0:
        return 0.0
    mean = squared_sum / max(samples_count, 1)
    return (mean ** 0.5) / 32768.0


async def _process_request(path: str, _request_headers):
    if path != "/health":
        return None
    payload = json.dumps(_health_snapshot()).encode("utf-8")
    headers = [
        ("Content-Type", "application/json; charset=utf-8"),
        ("Cache-Control", "no-store"),
    ]
    return 200, headers, payload


async def main_async() -> None:
    logger.info("Starting Jarvis AI-Agent sidecar on %s:%d", HOST, PORT)

    stop_event = asyncio.Event()

    def _handle_signal(*_):
        stop_event.set()

    if sys.platform != "win32":
        loop = asyncio.get_event_loop()
        loop.add_signal_handler(signal.SIGTERM, _handle_signal)
        loop.add_signal_handler(signal.SIGINT, _handle_signal)

    async with websockets.serve(handle_connection, HOST, PORT, process_request=_process_request):
        logger.info("Sidecar WebSocket server listening on ws://%s:%d", HOST, PORT)
        logger.info("Sidecar health endpoint listening on http://%s:%d/health", HOST, PORT)
        await stop_event.wait()

    logger.info("Sidecar shutting down.")


if __name__ == "__main__":
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        pass
