'use strict';

/**
 * sidecar-bridge.js — Electron renderer-side bridge to the Python AI-Agent sidecar.
 *
 * Responsibilities:
 *  - Open and maintain a WebSocket connection to ws://127.0.0.1:8765
 *  - Capture microphone audio via Web Audio API and stream PCM to the sidecar
 *  - Emit events: connected | disconnected | wake_word | stt_result | tts_audio | intent_parsed | error | status
 *  - Expose API: configure(settings) | startAudioCapture() | stopAudioCapture() | requestTts(text, requestId)
 *                requestIntentParse(text, requestId) | isConnected()
 *
 * Falls back gracefully when the sidecar is not running.
 */

const EventEmitter = require('events');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8765;
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;
const AUDIO_SAMPLE_RATE = 16000;
const AUDIO_CHUNK_MS = 100; // send 100 ms chunks
const AUDIO_CHUNK_SIZE = (AUDIO_SAMPLE_RATE * AUDIO_CHUNK_MS) / 1000; // samples per chunk

class SidecarBridge extends EventEmitter {
  constructor({ host = DEFAULT_HOST, port = DEFAULT_PORT } = {}) {
    super();
    this._url = `ws://${host}:${port}`;
    this._ws = null;
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;
    this._connected = false;
    this._wasEverConnected = false;
    this._audioContext = null;
    this._audioSource = null;
    this._audioWorklet = null;
    this._scriptProcessor = null;
    this._mediaStream = null;
    this._capturing = false;
    this._pendingSettings = null;
  }

  // ── Connection management ────────────────────────────────────────────────

  connect() {
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this._openSocket();
  }

  disconnect() {
    clearTimeout(this._reconnectTimer);
    this._reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // prevent auto-reconnect
    this.stopAudioCapture();
    if (this._ws) {
      try {
        this._ws.close();
      } catch {
        // ignore
      }
      this._ws = null;
    }
    this._connected = false;
  }

  isConnected() {
    return this._connected;
  }

  _openSocket() {
    try {
      this._ws = new WebSocket(this._url);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      this._connected = true;
      this._wasEverConnected = true;
      this._reconnectAttempts = 0;
      this.emit('connected');
      if (this._pendingSettings) {
        this._send({ type: 'configure', ...this._pendingSettings });
        this._pendingSettings = null;
      }
    };

    this._ws.onclose = () => {
      const wasConnected = this._connected;
      this._connected = false;
      // Only emit 'disconnected' when transitioning from connected → disconnected,
      // not on every failed reconnect attempt, to avoid log spam.
      if (wasConnected) {
        this.emit('disconnected');
      }
      this._scheduleReconnect();
    };

    this._ws.onerror = () => {
      // onclose fires after onerror; reconnect is handled there
    };

    this._ws.onmessage = (event) => {
      this._handleMessage(event.data);
    };
  }

  _scheduleReconnect() {
    if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      // All attempts exhausted — emit a single final notification only if the
      // sidecar was never reachable (i.e. it's not installed / not running).
      if (!this._wasEverConnected) {
        this.emit('unavailable');
      }
      return;
    }
    this._reconnectAttempts += 1;
    // Exponential back-off: 2 s, 4 s, 8 s … capped at 30 s
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * (2 ** (this._reconnectAttempts - 1)),
      RECONNECT_MAX_DELAY_MS,
    );
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => this._openSocket(), delay);
  }

  // ── Message handling ─────────────────────────────────────────────────────

  _send(payload) {
    if (!this._connected || !this._ws) return false;
    try {
      this._ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  _handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    const { type, ...rest } = msg;
    switch (type) {
      case 'status':
        this.emit('status', rest);
        break;
      case 'wake_word':
        this.emit('wake_word', rest);
        break;
      case 'stt_result':
        this.emit('stt_result', { text: rest.text || '', isFinal: Boolean(rest.isFinal) });
        break;
      case 'tts_audio':
        this.emit('tts_audio', {
          requestId: rest.requestId || '',
          data: rest.data || '',
          format: rest.format || 'wav',
        });
        break;
      case 'intent_parsed':
        this.emit('intent_parsed', {
          requestId: rest.requestId || '',
          intent: rest.intent || 'unknown',
          entities: rest.entities || {},
          confidence: Number(rest.confidence) || 0,
        });
        break;
      case 'error':
        this.emit('error', new Error(rest.message || 'Sidecar error'));
        break;
      default:
        break;
    }
  }

  // ── API ──────────────────────────────────────────────────────────────────

  configure(settings) {
    if (this._connected) {
      this._send({ type: 'configure', ...settings });
    } else {
      this._pendingSettings = { ...(this._pendingSettings || {}), ...settings };
    }
  }

  requestTts(text, requestId = '') {
    return this._send({ type: 'tts_speak', text, requestId });
  }

  requestIntentParse(text, requestId = '') {
    return this._send({ type: 'parse_intent', text, requestId });
  }

  setListeningForCommand(listening) {
    this._send({ type: 'configure', listeningForCommand: listening });
  }

  // ── Audio capture ────────────────────────────────────────────────────────

  async startAudioCapture() {
    if (this._capturing) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;

    try {
      this._mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: AUDIO_SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        this._mediaStream.getTracks().forEach((track) => track.stop());
        this._mediaStream = null;
        return;
      }

      this._audioContext = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
      this._audioSource = this._audioContext.createMediaStreamSource(this._mediaStream);

      // Use ScriptProcessorNode (deprecated but universally supported in Electron)
      const bufferSize = AUDIO_CHUNK_SIZE;
      this._scriptProcessor = this._audioContext.createScriptProcessor(bufferSize, 1, 1);

      this._scriptProcessor.onaudioprocess = (event) => {
        if (!this._connected) return;
        const float32 = event.inputBuffer.getChannelData(0);
        const pcmInt16 = this._float32ToPcmInt16(float32);
        const b64 = this._arrayBufferToBase64(pcmInt16.buffer);
        this._send({ type: 'audio_chunk', data: b64 });
      };

      this._audioSource.connect(this._scriptProcessor);
      this._scriptProcessor.connect(this._audioContext.destination);
      this._capturing = true;
      this.emit('audio_capture_started');
    } catch (err) {
      this.emit('error', err);
    }
  }

  stopAudioCapture() {
    if (!this._capturing) return;
    try {
      if (this._scriptProcessor) {
        this._scriptProcessor.disconnect();
        this._scriptProcessor = null;
      }
      if (this._audioSource) {
        this._audioSource.disconnect();
        this._audioSource = null;
      }
      if (this._audioContext) {
        this._audioContext.close().catch(() => null);
        this._audioContext = null;
      }
      if (this._mediaStream) {
        this._mediaStream.getTracks().forEach((track) => track.stop());
        this._mediaStream = null;
      }
    } catch {
      // ignore cleanup errors
    }
    this._capturing = false;
    this.emit('audio_capture_stopped');
  }

  // ── Audio helpers ────────────────────────────────────────────────────────

  _float32ToPcmInt16(float32Array) {
    const int16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i += 1) {
      const clamped = Math.max(-1, Math.min(1, float32Array[i]));
      int16[i] = Math.round(clamped * 32767);
    }
    return int16;
  }

  _arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

module.exports = { SidecarBridge };
