'use strict';

const EventEmitter = require('events');
const { createVoiceBackendAbstraction } = require('./voice/backend-abstraction');
const { decideSttRoute, ROUTE_SIDECAR, ROUTE_NONE } = require('./electron/ai/router/stt-policy');

const DEFAULT_VOICE_PERSONA = 'jarvis';
const DEFAULT_LANGUAGE = 'en';
const DEFAULT_TTS_MODEL = 'kokoro';
const DEFAULT_TTS_BACKEND = 'kokoro-local';
const PROVIDER_MODE_SERVER = 'assistantx-server';
const PROVIDER_MODE_DIRECT = 'desktop-direct';
// Skill Confidence store tracks binary success/failure; this is the
// deliberate threshold for collapsing a continuous STT confidence score
// (faster-whisper avg_logprob -> exp()) onto that binary outcome.
const STT_CONFIDENCE_SUCCESS_THRESHOLD = 0.55;
const TTS_DIRECT_TIMEOUT_MS = 15_000;

class VoiceGateway extends EventEmitter {
  constructor(options = {}) {
    super();
    this._sidecar = options.sidecar || null;
    this._invokeMain = options.invokeMain || null;
    this._getApiBaseUrl = options.getApiBaseUrl || (() => '');
    this._getAccessToken = options.getAccessToken || (() => null);
    this._queuePromptExecution = options.queuePromptExecution || null;
    this._executeStructuredCommand = options.executeStructuredCommand || null;
    this._settings = {
      providerMode: PROVIDER_MODE_SERVER,
      language: DEFAULT_LANGUAGE,
      wakeWordEnabled: true,
      wakeWordPhrase: 'Hey Jarvis',
      persona: DEFAULT_VOICE_PERSONA,
      ttsBackend: DEFAULT_TTS_BACKEND,
      ttsModel: DEFAULT_TTS_MODEL,
      autoSubmit: true,
      fallbackToBrowserSpeech: true,
      noiseSuppressionEnabled: true,
      // Legacy numeric slider, kept for backward compat — superseded by
      // wakeWordSensitivityPreset below as the primary control (sidecar
      // applies the preset after the numeric value, so the preset wins
      // whenever both are present; see ai-agent/main.py _handle_configure).
      wakeWordSensitivity: 0.65,
      wakeWordSensitivityPreset: 'relaxed',
    };
    this._backend = createVoiceBackendAbstraction({
      sidecar: this._sidecar,
      remoteApi: {
        transcribe: (payload) => this._requestJson('/api/jarvis/voice/stt', payload),
        synthesize: (payload) => this._requestJson('/api/jarvis/voice/tts', payload),
      },
    });
    this._bindSidecarEvents();
  }

  _bindSidecarEvents() {
    if (!this._sidecar || typeof this._sidecar.on !== 'function') return;
    // Store bound handlers so dispose() can remove them and prevent
    // listener accumulation across reconnects (audit finding).
    this._sidecarHandlers = {
      connected: () => this.emit('status', { phase: 'connected', source: 'sidecar' }),
      disconnected: () => this.emit('status', { phase: 'disconnected', source: 'sidecar' }),
      unavailable: () => this.emit('status', { phase: 'unavailable', source: 'sidecar' }),
      wake_word: (payload) => this.emit('wake_word', payload || {}),
      vad_event: (payload) => this.emit('vad_event', payload || {}),
      rms_level: (payload) => this.emit('rms_level', payload || {}),
      error: (error) => this.emit('error', error),
      audio_segment: (payload) => { void this._handleAudioSegment(payload || {}); },
      // The sidecar's own local/cloud STT pipeline is the producer of
      // record here — voice-gateway only listens, in order to feed the
      // Confidence Engine analog (fix d). It never re-emits this as its own
      // 'stt_result' — renderer.js already consumes the sidecar's event
      // directly, so re-emitting would recreate the dual-producer race.
      stt_result: (payload) => { this._trackSttOutcome(payload || {}); },
    };
    for (const [evt, fn] of Object.entries(this._sidecarHandlers)) {
      this._sidecar.on(evt, fn);
    }
  }

  dispose() {
    // Detach every sidecar listener registered by _bindSidecarEvents so
    // reconstructing the gateway (or hot-reloading the renderer) doesn't
    // leave dangling subscribers.
    if (this._sidecar && this._sidecarHandlers && typeof this._sidecar.off === 'function') {
      for (const [evt, fn] of Object.entries(this._sidecarHandlers)) {
        try { this._sidecar.off(evt, fn); } catch { /* listener already gone */ }
      }
    }
    this._sidecarHandlers = null;
    this.removeAllListeners?.();
  }

  configure(settings = {}) {
    this._settings = { ...this._settings, ...settings };
    if (this._sidecar && typeof this._sidecar.configure === 'function') {
      this._sidecar.configure({
        wakeWordEnabled: Boolean(this._settings.wakeWordEnabled),
        wakeWordPhrase: String(this._settings.wakeWordPhrase || '').trim() || 'Hey Jarvis',
        language: String(this._settings.language || DEFAULT_LANGUAGE).split('-')[0],
        sttEnabled: false,
        ttsEnabled: Boolean(isLocalTtsBackend(this._settings.ttsBackend)),
        ttsBackend: toSidecarTtsBackend(this._settings.ttsBackend),
        nlpEnabled: false,
        vadEnabled: true,
        noiseSuppressionEnabled: this._settings.noiseSuppressionEnabled !== false,
        wakeWordSensitivity: Number.isFinite(Number(this._settings.wakeWordSensitivity))
          ? Number(this._settings.wakeWordSensitivity)
          : 0.5,
        wakeWordSensitivityPreset: String(this._settings.wakeWordSensitivityPreset || 'relaxed'),
        listeningForCommand: false,
      });
    }
  }

  setPlaybackActive(active) {
    if (this._sidecar && typeof this._sidecar.setPlaybackActive === 'function') {
      this._sidecar.setPlaybackActive(Boolean(active));
    }
  }

  listAudioInputDevices() {
    if (this._sidecar && typeof this._sidecar.listAudioInputDevices === 'function') {
      return this._sidecar.listAudioInputDevices();
    }
    return Promise.resolve([]);
  }

  setInputDevice(deviceId) {
    if (this._sidecar && typeof this._sidecar.setInputDevice === 'function') {
      return this._sidecar.setInputDevice(deviceId);
    }
    return Promise.resolve();
  }

  connect() {
    if (this._sidecar && typeof this._sidecar.connect === 'function') {
      this._sidecar.connect();
    }
  }

  startAudioCapture() {
    if (this._sidecar && typeof this._sidecar.startAudioCapture === 'function') {
      return this._sidecar.startAudioCapture();
    }
    return Promise.resolve();
  }

  stopAudioCapture() {
    if (this._sidecar && typeof this._sidecar.stopAudioCapture === 'function') {
      this._sidecar.stopAudioCapture();
    }
  }

  setListeningForCommand(active) {
    if (this._sidecar && typeof this._sidecar.setListeningForCommand === 'function') {
      this._sidecar.setListeningForCommand(Boolean(active));
    }
  }

  async _handleAudioSegment(payload) {
    const data = String(payload.data || '');
    if (!data) return;

    // Root-cause fix: ai-agent/main.py already runs the same audio through
    // its own local-first/cloud-fallback STT chain and emits its own
    // 'stt_result' for it. Re-transcribing here unconditionally created two
    // producers racing to fill the same UI field for one utterance. Decide
    // once, explicitly, who owns this segment.
    const route = decideSttRoute({
      sidecarConnected: Boolean(this._sidecar?.isConnected?.()),
      sidecarHandlesStt: Boolean(this._sidecar?.getCapabilities?.()?.sttAvailable),
      remoteConfigured: this._settings.providerMode === PROVIDER_MODE_SERVER,
    });
    this.emit('route', { mode: `stt-${route.route}`, reason: route.reason });

    if (route.route === ROUTE_SIDECAR) {
      // Sidecar's own pipeline already owns this segment and will emit its
      // own stt_result; nothing for the gateway to do.
      return;
    }
    if (route.route === ROUTE_NONE) {
      this._emitCaptureError('stt-unavailable', 'No speech-to-text route is available.');
      return;
    }

    this.emit('status', { phase: 'transcribing', source: 'gateway' });
    try {
      const sttModelId = await this._resolveSttModelId();
      const stt = await this._transcribeSegment({
        audioBase64: data,
        mimeType: String(payload.format || 'audio/raw'),
        sampleRate: Number(payload.sampleRate || 16000),
        // No vendor/model is ever hardcoded here — when the Model Router has
        // no STT lane assignment configured, `model` is simply omitted and
        // the remote endpoint applies its own default.
        ...(sttModelId ? { model: sttModelId } : {}),
        language: this._settings.language || DEFAULT_LANGUAGE,
      });
      const text = String(stt?.text || '').trim();
      if (!text) return;
      this.emit('stt_result', { text, isFinal: true, source: stt?.provider || 'assistantx-server' });
      this._routeTranscript(text);
    } catch (error) {
      this._emitCaptureError('stt-transcribe-failed', error?.message || 'Remote transcription failed.');
    }
  }

  // Resolves the STT lane's assigned model id through the existing Model
  // Router assignment store — never a hardcoded vendor/model id.
  async _resolveSttModelId() {
    if (typeof this._invokeMain !== 'function') return null;
    try {
      const result = await this._invokeMain('local-server:get-model-assignment');
      const id = result?.localModelAssignment?.sttModelId;
      return id ? String(id) : null;
    } catch {
      return null;
    }
  }

  // Structured, explicit error path (fix b) — replaces the old unconditional
  // silent 'fallback_required' emission. Real browser-speech fallback is
  // only requested when the setting is on, and the error itself always
  // carries a code + message so the UI never just goes silent.
  _emitCaptureError(code, message) {
    this.emit('error', Object.assign(new Error(message), { code }));
    if (this._settings.fallbackToBrowserSpeech) {
      this.emit('fallback_required', { reason: code });
    }
  }

  // Reports a confidence-tracked outcome for the sidecar's own STT result
  // into the Skill Confidence store (fix d). Engines that don't report a
  // confidence score (whisper.cpp, OpenAI Whisper API, Parakeet) skip
  // tracking entirely rather than recording a fabricated outcome.
  _trackSttOutcome(payload) {
    if (!payload?.isFinal) return;
    const confidence = Number(payload.confidence);
    if (!Number.isFinite(confidence)) return;
    if (typeof this._invokeMain !== 'function') return;
    const outcome = confidence >= STT_CONFIDENCE_SUCCESS_THRESHOLD ? 'success' : 'failure';
    void this._invokeMain('workspace:skill-track', { skillId: 'voice.stt', outcome, confidence });
  }

  _routeTranscript(text) {
    const command = mapVoiceTextToCommand(text);
    if (command) {
      this.emit('route', { mode: 'automation', reason: 'intent_match', command: command.command });
      if (typeof this._executeStructuredCommand === 'function') {
        void this._executeStructuredCommand(command, { source: 'local', origin: 'voice-gateway' });
      }
      return;
    }

    const tier = getComplexityTier(text);
    this.emit('route', {
      mode: tier === 'reasoning' ? 'deep-reasoning' : 'fast',
      reason: tier === 'reasoning' ? 'complexity_score' : 'default_fast',
    });
    if (typeof this._queuePromptExecution === 'function') {
      this._queuePromptExecution(text, { source: 'local', origin: 'voice-gateway', routeTier: tier });
    }
  }

  async synthesize(text, options = {}) {
    const input = String(text || '').trim();
    if (!input) return { ok: false, reason: 'empty-text' };

    if (this._settings.providerMode === PROVIDER_MODE_DIRECT) {
      // Desktop-direct mode (fix c) — synthesize entirely through the local
      // sidecar (Piper/Kokoro), never through the assistantx-server API.
      return this._synthesizeViaSidecar(input);
    }

    const persona = String(options.persona || this._settings.persona || DEFAULT_VOICE_PERSONA);
    const language = String(options.language || this._settings.language || DEFAULT_LANGUAGE);
    const provider = String(options.provider || resolveCloudProvider(this._settings.ttsBackend));
    const model = String(options.model || this._settings.ttsModel || DEFAULT_TTS_MODEL);
    try {
      const payload = await this._backend.synthesize({
        text: input,
        persona,
        language,
        provider,
        model,
      });
      return {
        ok: Boolean(payload?.ok && payload.audioBase64),
        audioBase64: String(payload?.audioBase64 || ''),
        format: String(payload?.format || 'wav'),
        provider: String(payload?.provider || 'assistantx-server'),
        reason: payload?.ok ? undefined : String(payload?.error || 'tts-unavailable'),
      };
    } catch (error) {
      return { ok: false, reason: error?.message || 'tts-unavailable' };
    }
  }

  async _transcribeSegment(payload) {
    // Only ever reached when decideSttRoute() picked the remote route, which
    // requires providerMode === PROVIDER_MODE_SERVER — desktop-direct mode
    // relies entirely on the sidecar's own pipeline (see _handleAudioSegment)
    // and never reaches this method.
    return this._backend.transcribe(payload);
  }

  // Desktop-direct TTS (fix c) — routes synthesis through the sidecar's own
  // local Piper/Kokoro engine instead of returning "not implemented". The
  // sidecar's tts_speak protocol is fire-and-forget over the WebSocket; the
  // audio comes back asynchronously as a 'tts_audio' event tagged with the
  // same requestId, so this waits for that event (or a timeout/error).
  _synthesizeViaSidecar(text) {
    return new Promise((resolve) => {
      if (!this._sidecar || typeof this._sidecar.requestTts !== 'function') {
        resolve({ ok: false, reason: 'sidecar-unavailable' });
        return;
      }
      const requestId = `tts-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        this._sidecar.off?.('tts_audio', onAudio);
        this._sidecar.off?.('error', onError);
      };
      const settle = (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };
      const onAudio = (payload) => {
        if (payload?.requestId !== requestId) return;
        settle({
          ok: true,
          audioBase64: String(payload.data || ''),
          format: String(payload.format || 'wav'),
          provider: 'desktop-direct',
        });
      };
      const onError = (error) => {
        settle({ ok: false, reason: error?.message || 'desktop-direct-tts-failed' });
      };
      const timer = setTimeout(() => {
        settle({ ok: false, reason: 'desktop-direct-tts-timeout' });
      }, TTS_DIRECT_TIMEOUT_MS);
      this._sidecar.on('tts_audio', onAudio);
      this._sidecar.on('error', onError);
      this._sidecar.requestTts(text, requestId);
    });
  }

  interrupt(reason = 'user-interrupt') {
    this.emit('status', { phase: 'interrupted', source: 'gateway', reason });
    this._backend.interrupt();
  }

  async _requestJson(path, payload) {
    if (typeof this._invokeMain !== 'function') {
      throw new Error('Voice gateway is missing invokeMain bridge.');
    }
    const apiBase = String(this._getApiBaseUrl() || '').replace(/\/$/, '');
    if (!apiBase) {
      throw new Error('AssistantX API URL is not configured.');
    }
    const token = this._getAccessToken();
    const result = await this._invokeMain('jarvis-ai-request', {
      endpoint: `${apiBase}${path}`,
      payload,
      token,
      timeoutMs: 45_000,
    });
    const status = Number(result?.status || 500);
    let parsed;
    try {
      parsed = JSON.parse(String(result?.body || '{}'));
    } catch {
      parsed = { error: String(result?.body || 'Voice gateway request failed.') };
    }
    if (!result?.ok || status >= 400) {
      throw new Error(String(parsed?.error || `Voice gateway request failed (${status}).`));
    }
    return parsed;
  }
}

function getComplexityTier(text) {
  const normalized = String(text || '').toLowerCase();
  const complexitySignals = [
    'architecture',
    'refactor',
    'debug',
    'workflow',
    'multi-step',
    'compare',
    'analyze',
    'research',
    'long context',
    'plan',
  ];
  const score = complexitySignals.reduce((acc, token) => (
    normalized.includes(token) ? acc + 1 : acc
  ), 0);
  if (score >= 2 || normalized.length > 260) return 'reasoning';
  return 'fast';
}

function mapVoiceTextToCommand(text) {
  const input = String(text || '').trim();
  if (!input) return null;
  const lower = input.toLowerCase();
  const openMatch = lower.match(/^(?:open|launch|start|run)\s+(.+)$/);
  if (openMatch?.[1]) return { command: 'openApp', app: openMatch[1].trim() };
  const closeMatch = lower.match(/^(?:close|quit|stop)\s+(.+)$/);
  if (closeMatch?.[1]) return { command: 'closeApp', app: closeMatch[1].trim() };
  const webMatch = lower.match(/^(?:search|find|google)\s+(.+)$/);
  if (webMatch?.[1]) return { command: 'searchWeb', query: webMatch[1].trim() };
  if (lower.includes('volume up')) return { command: 'volumeUp' };
  if (lower.includes('volume down')) return { command: 'volumeDown' };
  if (lower.includes('mute')) return { command: 'mute' };
  if (lower.includes('screenshot')) return { command: 'screenshot' };
  return null;
}

function isLocalTtsBackend(backend) {
  const value = String(backend || '').toLowerCase();
  return value === 'kokoro-local' || value === 'piper-local' || value === 'auto-local';
}

function toSidecarTtsBackend(backend) {
  const value = String(backend || '').toLowerCase();
  if (value === 'kokoro-local') return 'kokoro';
  if (value === 'piper-local') return 'piper';
  return 'auto';
}

function resolveCloudProvider(backend) {
  const value = String(backend || '').toLowerCase();
  if (value === 'openai-cloud') return 'openai';
  if (value === 'elevenlabs-cloud') return 'elevenlabs';
  return 'groq';
}

module.exports = {
  VoiceGateway,
  PROVIDER_MODE_DIRECT,
  PROVIDER_MODE_SERVER,
};
