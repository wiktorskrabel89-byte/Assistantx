'use strict';

const EventEmitter = require('events');

let electronIpcRenderer = null;
try {
  ({ ipcRenderer: electronIpcRenderer } = require('electron'));
} catch {
  electronIpcRenderer = null;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8765;
const DEFAULT_IPC_MODE = 'stdio';
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;
const AUDIO_SAMPLE_RATE = 16000;
const AUDIO_CHUNK_MS = 100;
const AUDIO_CHUNK_SIZE = (AUDIO_SAMPLE_RATE * AUDIO_CHUNK_MS) / 1000;

class WebSocketTransport {
  constructor({ url, onOpen, onClose, onMessage, onUnavailable }) {
    this._url = url;
    this._onOpen = onOpen;
    this._onClose = onClose;
    this._onMessage = onMessage;
    this._onUnavailable = onUnavailable;
    this._ws = null;
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;
    this._wasEverConnected = false;
  }

  connect() {
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this._openSocket();
  }

  disconnect() {
    clearTimeout(this._reconnectTimer);
    this._reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
    if (this._ws) {
      try {
        this._ws.close();
      } catch {
        // ignore
      }
      this._ws = null;
    }
  }

  send(payload) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false;
    try {
      this._ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  _openSocket() {
    try {
      this._ws = new WebSocket(this._url);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      this._wasEverConnected = true;
      this._reconnectAttempts = 0;
      this._onOpen();
    };
    this._ws.onclose = () => {
      this._onClose();
      this._scheduleReconnect();
    };
    this._ws.onerror = () => {};
    this._ws.onmessage = (event) => this._onMessage(event.data);
  }

  _scheduleReconnect() {
    if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      if (!this._wasEverConnected) {
        this._onUnavailable();
      }
      return;
    }
    this._reconnectAttempts += 1;
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * (2 ** (this._reconnectAttempts - 1)),
      RECONNECT_MAX_DELAY_MS,
    );
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => this._openSocket(), delay);
  }
}

class StdioTransport {
  constructor({ ipcRenderer, onOpen, onClose, onMessage, onUnavailable }) {
    this._ipcRenderer = ipcRenderer;
    this._onOpen = onOpen;
    this._onClose = onClose;
    this._onMessage = onMessage;
    this._onUnavailable = onUnavailable;
    this._unsubscribeMessage = null;
    this._unsubscribeStatus = null;
    this._connected = false;
    this._wasEverConnected = false;
  }

  connect() {
    if (!this._ipcRenderer) {
      this._onUnavailable();
      return;
    }
    if (!this._unsubscribeMessage) {
      const messageListener = (_event, payload) => {
        if (!this._connected) {
          this._connected = true;
          this._wasEverConnected = true;
          this._onOpen();
        }
        this._onMessage(payload);
      };
      this._ipcRenderer.on('sidecar-message', messageListener);
      this._unsubscribeMessage = () => this._ipcRenderer.removeListener('sidecar-message', messageListener);
    }
    if (!this._unsubscribeStatus) {
      const statusListener = (_event, payload) => {
        const status = payload?.status;
        if (status === 'running' && !this._connected) {
          this._connected = true;
          this._wasEverConnected = true;
          this._onOpen();
          return;
        }
        if (['stopped', 'error'].includes(status) && this._connected) {
          this._connected = false;
          this._onClose();
          return;
        }
        if (status === 'unavailable' && !this._wasEverConnected) {
          this._onUnavailable();
        }
      };
      this._ipcRenderer.on('sidecar-status', statusListener);
      this._unsubscribeStatus = () => this._ipcRenderer.removeListener('sidecar-status', statusListener);
    }
    void this._ipcRenderer.invoke('get-sidecar-status').then((payload) => {
      const status = payload?.status;
      if (status === 'running' && !this._connected) {
        this._connected = true;
        this._wasEverConnected = true;
        this._onOpen();
      } else if (status === 'unavailable' && !this._wasEverConnected) {
        this._onUnavailable();
      }
    }).catch(() => {
      this._onUnavailable();
    });
  }

  disconnect() {
    if (this._unsubscribeMessage) {
      this._unsubscribeMessage();
      this._unsubscribeMessage = null;
    }
    if (this._unsubscribeStatus) {
      this._unsubscribeStatus();
      this._unsubscribeStatus = null;
    }
    if (this._connected) {
      this._connected = false;
      this._onClose();
    }
  }

  send(payload) {
    if (!this._ipcRenderer) return false;
    void this._ipcRenderer.invoke('sidecar:send', payload).catch(() => {
      if (this._connected) {
        this._connected = false;
        this._onClose();
      }
    });
    return true;
  }
}

class SidecarBridge extends EventEmitter {
  constructor({ host = DEFAULT_HOST, port = DEFAULT_PORT, url = '', token = '', ipcMode = DEFAULT_IPC_MODE } = {}) {
    super();
    this._baseUrl = String(url || '').trim() || `ws://${host}:${port}`;
    this._token = String(token || '').trim();
    this._ipcMode = String(ipcMode || DEFAULT_IPC_MODE).trim().toLowerCase();
    this._connected = false;
    this._audioContext = null;
    this._audioSource = null;
    this._audioWorklet = null;
    this._scriptProcessor = null;
    this._mediaStream = null;
    this._capturing = false;
    this._pendingSettings = null;
    this._transport = null;
    this._ws = null;
  }

  _buildUrl() {
    if (!this._token) return this._baseUrl;
    const separator = this._baseUrl.includes('?') ? '&' : '?';
    return `${this._baseUrl}${separator}token=${encodeURIComponent(this._token)}`;
  }

  _createTransport() {
    if (this._ipcMode === 'stdio' && electronIpcRenderer) {
      return new StdioTransport({
        ipcRenderer: electronIpcRenderer,
        onOpen: () => this._handleConnected(),
        onClose: () => this._handleDisconnected(),
        onMessage: (payload) => this._handleMessage(payload),
        onUnavailable: () => this.emit('unavailable'),
      });
    }
    const transport = new WebSocketTransport({
      url: this._buildUrl(),
      onOpen: () => this._handleConnected(),
      onClose: () => this._handleDisconnected(),
      onMessage: (payload) => this._handleMessage(payload),
      onUnavailable: () => this.emit('unavailable'),
    });
    this._ws = transport._ws;
    return transport;
  }

  _handleConnected() {
    if (this._connected) return;
    this._connected = true;
    this.emit('connected');
    if (this._pendingSettings) {
      this._send({ type: 'configure', ...this._pendingSettings });
      this._pendingSettings = null;
    }
  }

  _handleDisconnected() {
    if (!this._connected) return;
    this._connected = false;
    this.emit('disconnected');
  }

  connect() {
    if (!this._transport) {
      this._transport = this._createTransport();
    }
    this._transport.connect();
  }

  disconnect() {
    this.stopAudioCapture();
    if (this._transport) {
      this._transport.disconnect();
      this._transport = null;
    }
    this._connected = false;
  }

  isConnected() {
    return this._connected;
  }

  setConnection({ url, token, ipcMode } = {}) {
    if (typeof url === 'string' && url.trim()) {
      this._baseUrl = url.trim();
    }
    if (typeof token === 'string') {
      this._token = token.trim();
    }
    if (typeof ipcMode === 'string' && ipcMode.trim()) {
      this._ipcMode = ipcMode.trim().toLowerCase();
    }
    if (this._transport) {
      this._transport.disconnect();
      this._transport = null;
      this._connected = false;
    }
  }

  _send(payload) {
    if (!this._transport) return false;
    return this._transport.send(payload);
  }

  _handleMessage(raw) {
    const msg = typeof raw === 'string'
      ? (() => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })()
      : raw;
    if (!msg || typeof msg !== 'object') return;

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
      case 'vad_event':
        this.emit('vad_event', {
          phase: rest.phase || 'unknown',
          sampleRate: Number(rest.sampleRate) || AUDIO_SAMPLE_RATE,
        });
        break;
      case 'audio_segment':
        this.emit('audio_segment', {
          data: rest.data || '',
          format: rest.format || 'audio/raw',
          sampleRate: Number(rest.sampleRate) || AUDIO_SAMPLE_RATE,
        });
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
          action: rest.action || rest.intent || 'unknown',
          intentKind: rest.intentKind || 'system',
          entities: rest.entities || {},
          confidence: Number(rest.confidence) || 0,
        });
        break;
      case 'memory_search_result':
        this.emit('memory_search_result', {
          requestId: rest.requestId || '',
          results: Array.isArray(rest.results) ? rest.results : [],
        });
        break;
      case 'memory_upsert_result':
        this.emit('memory_upsert_result', {
          requestId: rest.requestId || '',
          ok: Boolean(rest.ok),
        });
        break;
      case 'tool_result':
        this.emit('tool_result', {
          requestId: rest.requestId || '',
          tool: rest.tool || '',
          results: Array.isArray(rest.results) ? rest.results : [],
          ok: rest.ok !== false,
        });
        break;
      case 'llm_route_result':
        this.emit('llm_route_result', {
          requestId: rest.requestId || '',
          ok: rest.ok !== false,
          intent: rest.intent || '',
          provider: rest.provider || '',
          model: rest.model || '',
          text: rest.text || '',
          error: rest.error || '',
          modelMode: rest.modelMode || '',
        });
        break;
      case 'rms_level':
        this.emit('rms_level', {
          source: rest.source || 'mic',
          rms: Number(rest.rms || 0),
          sampleRate: Number(rest.sampleRate) || AUDIO_SAMPLE_RATE,
          timestamp: Number(rest.timestamp || Date.now()),
        });
        break;
      case 'error':
        this.emit('error', new Error(rest.message || 'Sidecar error'));
        break;
      default:
        break;
    }
  }

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

  requestMemorySearch(query, requestId = '', topK = 5) {
    return this._send({ type: 'memory_search', query, requestId, topK });
  }

  requestMemoryUpsert(text, metadata = {}, requestId = '') {
    return this._send({ type: 'memory_upsert', text, metadata, requestId });
  }

  requestToolCall(tool, query, requestId = '') {
    return this._send({ type: 'tool_call', tool, query, requestId });
  }

  setListeningForCommand(listening) {
    this._send({ type: 'configure', listeningForCommand: listening });
  }

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
