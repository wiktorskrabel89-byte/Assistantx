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
// ScriptProcessorNode buffer sizes MUST be 0 or a power of two in
// [256, 16384] — createScriptProcessor(1600) throws IndexSizeError, which
// previously killed audio capture at startup *and* leaked the live mic
// stream (the catch block never stopped the acquired tracks). We capture
// with a valid power-of-two buffer and re-chunk to exact 100 ms frames.
const AUDIO_PROCESSOR_BUFFER_SIZE = 2048;

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
    this._micMuted = false;
    this._playbackActive = false;
    // Barge-in (default on): when true, mic capture stays live during TTS
    // playback instead of being hard-gated, so the sidecar's RMS-threshold
    // detector (ai-agent/main.py _check_barge_in) can actually see audio to
    // decide whether the user is talking over Jarvis. When false, falls
    // back to the original strict half-duplex mute.
    this._bargeInEnabled = true;
    this._inputDeviceId = '';
    this._chunkBuffer = new Float32Array(0);
    this._pendingSettings = null;
    this._transport = null;
    this._ws = null;
    this._capabilities = {
      ttsStreamingSupported: false,
      ttsBackend: 'unknown',
    };
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
      url: this._baseUrl,
      onOpen: () => {
        if (this._token) {
          transport.send({ type: 'auth', token: this._token });
          return;
        }
        this._handleConnected();
      },
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
        if (rest?.status === 'connected') {
          this._handleConnected();
        }
        if (rest?.capabilities && typeof rest.capabilities === 'object') {
          this._capabilities = {
            ...this._capabilities,
            ...rest.capabilities,
          };
          this.emit('capabilities', { ...this._capabilities });
        }
        this.emit('status', rest);
        break;
      case 'wake_word':
        this.emit('wake_word', rest);
        break;
      case 'barge_in':
        // Sidecar detected the user talking over Jarvis and already
        // flipped its own playback_active/listening state server-side —
        // mirror that locally so mic capture isn't still hard-gated by
        // _playbackActive on the next audio frame.
        this._playbackActive = false;
        this._applyTrackEnabled();
        this.emit('barge_in', rest);
        break;
      case 'task_step':
        // V2.0 — bridges the Python sidecar's reasoning steps into the
        // Devin task list panel via window.jarvisTaskList in the renderer.
        this.emit('task_step', {
          category: String(rest.category || 'SIDECAR').slice(0, 24),
          message: String(rest.message || ''),
          status: ['active', 'done', 'error'].includes(rest.status) ? rest.status : 'active',
          stepId: rest.stepId || null,
        });
        break;
      case 'stt_result':
        this.emit('stt_result', {
          text: rest.text || '',
          isFinal: Boolean(rest.isFinal),
          confidence: Number.isFinite(rest.confidence) ? Number(rest.confidence) : null,
        });
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
      case 'tts_audio_chunk':
        this.emit('tts_audio_chunk', {
          requestId: rest.requestId || '',
          chunkIndex: Number(rest.chunkIndex || 0),
          data: rest.data || '',
          format: rest.format || 'wav',
          isFinal: Boolean(rest.isFinal),
        });
        break;
      case 'tts_stream_done':
        this.emit('tts_stream_done', {
          requestId: rest.requestId || '',
          chunks: Number(rest.chunks || 0),
          backend: rest.backend || '',
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
          entrypoint: rest.entrypoint || '',
          results: Array.isArray(rest.results) ? rest.results : [],
          ok: rest.ok !== false,
          error: rest.error || null,
          meta: rest.meta && typeof rest.meta === 'object' ? rest.meta : {},
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

  requestTtsStreamStart(requestId = '') {
    return this._send({ type: 'tts_stream_start', requestId });
  }

  requestTtsStreamChunk(text, requestId = '', chunkIndex = 0, isFinal = false) {
    return this._send({
      type: 'tts_stream_chunk',
      text,
      requestId,
      chunkIndex,
      isFinal,
    });
  }

  requestTtsStreamEnd(requestId = '') {
    return this._send({ type: 'tts_stream_end', requestId });
  }

  requestTtsStreamCancel(requestId = '') {
    return this._send({ type: 'tts_stream_cancel', requestId });
  }

  getCapabilities() {
    return { ...this._capabilities };
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

  requestToolCall(tool, queryOrParams, requestId = '', meta = {}) {
    const rawTool = String(tool || '').trim();
    if (!rawTool) return false;
    const params = queryOrParams && typeof queryOrParams === 'object' && !Array.isArray(queryOrParams)
      ? { ...queryOrParams }
      : { query: queryOrParams };
    const action = {
      schema_version: '2026-05-27',
      action_type: rawTool,
      params,
      request_id: requestId,
      source: meta?.source || '',
      origin: meta?.origin || '',
      dry_run: Boolean(meta?.dryRun),
    };
    return this._send({
      type: 'tool_call',
      tool: 'jarvis_executor',
      action,
      requestId,
      source: action.source,
      origin: action.origin,
    });
  }

  setListeningForCommand(listening) {
    this._send({ type: 'configure', listeningForCommand: listening });
  }

  isCapturing() {
    return this._capturing;
  }

  /**
   * Half-duplex gate: while TTS audio is playing through the speakers, mic
   * input is either (a) left live so the sidecar's barge-in detector can
   * decide whether the user is talking over Jarvis (default — see
   * _bargeInEnabled), or (b) hard-muted at the WebRTC level AND told to the
   * sidecar so it drops anything that still arrives, the original strict
   * behavior, when barge-in is disabled. Echo cancellation (requested in
   * the getUserMedia constraints) is the first line of defence either way.
   */
  setPlaybackActive(active) {
    const next = Boolean(active);
    if (next === this._playbackActive) return;
    this._playbackActive = next;
    this._applyTrackEnabled();
    this._send({ type: 'playback_state', active: next });
  }

  setBargeInEnabled(enabled) {
    this._bargeInEnabled = Boolean(enabled);
    this._applyTrackEnabled();
    this._send({ type: 'configure', bargeInEnabled: this._bargeInEnabled });
  }

  setMicMuted(muted) {
    this._micMuted = Boolean(muted);
    this._applyTrackEnabled();
  }

  _applyTrackEnabled() {
    if (!this._mediaStream) return;
    const enabled = !this._micMuted && (!this._playbackActive || this._bargeInEnabled);
    for (const track of this._mediaStream.getAudioTracks()) {
      track.enabled = enabled;
    }
  }

  async listAudioInputDevices() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((device) => device.kind === 'audioinput')
        .map((device, index) => ({
          deviceId: device.deviceId || '',
          label: device.label || `Microphone ${index + 1}`,
        }));
    } catch {
      return [];
    }
  }

  async setInputDevice(deviceId) {
    const next = String(deviceId || '');
    if (next === this._inputDeviceId) return;
    this._inputDeviceId = next;
    if (this._capturing) {
      this.stopAudioCapture();
      await this.startAudioCapture();
    }
  }

  getInputDevice() {
    return this._inputDeviceId;
  }

  async startAudioCapture() {
    if (this._capturing) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;

    try {
      const audioConstraints = {
        channelCount: 1,
        sampleRate: AUDIO_SAMPLE_RATE,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      if (this._inputDeviceId) {
        audioConstraints.deviceId = { exact: this._inputDeviceId };
      }
      this._mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });

      // Fix (e) — detect the device disappearing mid-recording (unplugged,
      // disabled in OS settings, etc.) instead of silently going quiet. The
      // browser fires 'ended' on the track itself, not on the stream.
      for (const track of this._mediaStream.getAudioTracks()) {
        track.onended = () => {
          if (!this._capturing) return;
          this.stopAudioCapture();
          this.emit('error', Object.assign(
            new Error('Microphone device was disconnected during recording.'),
            { code: 'device-disconnected' },
          ));
        };
      }

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        this._releaseCaptureResources();
        return;
      }

      this._audioContext = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
      this._audioSource = this._audioContext.createMediaStreamSource(this._mediaStream);
      this._chunkBuffer = new Float32Array(0);
      this._scriptProcessor = this._audioContext.createScriptProcessor(AUDIO_PROCESSOR_BUFFER_SIZE, 1, 1);

      this._scriptProcessor.onaudioprocess = (event) => {
        const float32 = event.inputBuffer.getChannelData(0);
        this._emitMicLevel(float32);
        if (!this._connected || this._micMuted) return;
        // Barge-in: keep streaming to the sidecar during playback so its
        // RMS-threshold detector can see real audio — without this the
        // server-side barge-in check in main.py would never receive a
        // single chunk to evaluate. When barge-in is off, fall back to the
        // original drop-everything half-duplex behavior.
        if (this._playbackActive && !this._bargeInEnabled) return;
        this._pushSamples(float32);
      };

      this._audioSource.connect(this._scriptProcessor);
      this._scriptProcessor.connect(this._audioContext.destination);
      this._applyTrackEnabled();
      this._capturing = true;
      this.emit('audio_capture_started');
    } catch (err) {
      // Release anything acquired before the failure — leaving live tracks
      // behind kept the OS mic indicator on forever ("always listening").
      this._releaseCaptureResources();
      throw Object.assign(err, { code: this._classifyCaptureError(err) });
    }
  }

  // Fix (e) — turns getUserMedia's DOMException.name into one of three
  // explicit, UI-distinguishable states instead of one generic failure.
  _classifyCaptureError(err) {
    switch (err?.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'permission-denied';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'no-device';
      default:
        return 'mic-unavailable';
    }
  }

  _pushSamples(float32) {
    const merged = new Float32Array(this._chunkBuffer.length + float32.length);
    merged.set(this._chunkBuffer, 0);
    merged.set(float32, this._chunkBuffer.length);
    let offset = 0;
    while (merged.length - offset >= AUDIO_CHUNK_SIZE) {
      const frame = merged.subarray(offset, offset + AUDIO_CHUNK_SIZE);
      const pcmInt16 = this._float32ToPcmInt16(frame);
      const b64 = this._arrayBufferToBase64(pcmInt16.buffer);
      this._send({ type: 'audio_chunk', data: b64 });
      offset += AUDIO_CHUNK_SIZE;
    }
    this._chunkBuffer = merged.slice(offset);
  }

  _emitMicLevel(float32) {
    if (this.listenerCount('mic_level') === 0) return;
    let sum = 0;
    for (let i = 0; i < float32.length; i += 1) sum += float32[i] * float32[i];
    const rms = Math.sqrt(sum / Math.max(1, float32.length));
    this.emit('mic_level', { rms, muted: this._micMuted || (this._playbackActive && !this._bargeInEnabled) });
  }

  _releaseCaptureResources() {
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
    this._chunkBuffer = new Float32Array(0);
  }

  stopAudioCapture() {
    if (!this._capturing) return;
    this._releaseCaptureResources();
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
