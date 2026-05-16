'use strict';

const EventEmitter = require('events');
const { createVoiceBackendAbstraction } = require('./voice/backend-abstraction');

const DEFAULT_STT_MODEL = 'whisper-large-v3-turbo';
const DEFAULT_VOICE_PERSONA = 'jarvis';
const DEFAULT_LANGUAGE = 'en';
const PROVIDER_MODE_SERVER = 'assistantx-server';
const PROVIDER_MODE_DIRECT = 'desktop-direct';

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
      sttModel: DEFAULT_STT_MODEL,
      persona: DEFAULT_VOICE_PERSONA,
      autoSubmit: true,
      fallbackToBrowserSpeech: true,
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
    this._sidecar.on('connected', () => this.emit('status', { phase: 'connected', source: 'sidecar' }));
    this._sidecar.on('disconnected', () => this.emit('status', { phase: 'disconnected', source: 'sidecar' }));
    this._sidecar.on('unavailable', () => this.emit('status', { phase: 'unavailable', source: 'sidecar' }));
    this._sidecar.on('wake_word', (payload) => this.emit('wake_word', payload || {}));
    this._sidecar.on('vad_event', (payload) => this.emit('vad_event', payload || {}));
    this._sidecar.on('error', (error) => this.emit('error', error));
    this._sidecar.on('audio_segment', (payload) => {
      void this._handleAudioSegment(payload || {});
    });
  }

  configure(settings = {}) {
    this._settings = { ...this._settings, ...settings };
    if (this._sidecar && typeof this._sidecar.configure === 'function') {
      this._sidecar.configure({
        wakeWordEnabled: Boolean(this._settings.wakeWordEnabled),
        wakeWordPhrase: String(this._settings.wakeWordPhrase || '').trim() || 'Hey Jarvis',
        language: String(this._settings.language || DEFAULT_LANGUAGE).split('-')[0],
        sttEnabled: false,
        ttsEnabled: false,
        nlpEnabled: false,
        vadEnabled: true,
        listeningForCommand: false,
      });
    }
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
    this.emit('status', { phase: 'transcribing', source: 'gateway' });
    try {
      const stt = await this._transcribeSegment({
        audioBase64: data,
        mimeType: String(payload.format || 'audio/raw'),
        sampleRate: Number(payload.sampleRate || 16000),
        model: this._settings.sttModel || DEFAULT_STT_MODEL,
        language: this._settings.language || DEFAULT_LANGUAGE,
      });
      const text = String(stt?.text || '').trim();
      if (!text) return;
      this.emit('stt_result', { text, isFinal: true, source: stt?.provider || 'assistantx-server' });
      this._routeTranscript(text);
    } catch (error) {
      this.emit('error', error);
      if (this._settings.fallbackToBrowserSpeech) {
        this.emit('fallback_required', { reason: 'stt_unavailable' });
      }
    }
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
      return { ok: false, reason: 'desktop-direct-not-implemented' };
    }

    const persona = String(options.persona || this._settings.persona || DEFAULT_VOICE_PERSONA);
    const language = String(options.language || this._settings.language || DEFAULT_LANGUAGE);
    try {
      const payload = await this._backend.synthesize({
        text: input,
        persona,
        language,
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
    if (this._settings.providerMode === PROVIDER_MODE_DIRECT) {
      throw new Error('Desktop-direct STT mode is not implemented yet.');
    }
    return this._backend.transcribe(payload);
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

module.exports = {
  VoiceGateway,
  PROVIDER_MODE_DIRECT,
  PROVIDER_MODE_SERVER,
};
