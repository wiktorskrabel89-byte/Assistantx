'use strict';

const { EventEmitter } = require('events');

// Regex that detects a map trigger embedded in an LLM response, e.g.:
//   [TRIGGER_MAP: Tokyo]
const MAP_TRIGGER_RE = /\[TRIGGER_MAP:\s*([^\]]+)\]/i;

/**
 * VoicePipeline orchestrates the full STT → LLM → (map trigger) → TTS chain.
 *
 * Lifecycle per utterance:
 *   1. stt_result (isFinal) arrives via sidecar event
 *   2. routeRequest() is called on the AIRouter with the transcribed text
 *   3. LLM response is scanned for [TRIGGER_MAP: <location>] tags
 *   4. If found, mapWidget.goTo(location) is called and map:fly-to is emitted
 *   5. The spoken-text portion (tag stripped) is sent to the sidecar for TTS
 *
 * Emits:
 *   'stt-final'      { text }
 *   'llm-token'      { token, provider, model }
 *   'llm-complete'   { text, provider, model }
 *   'map-trigger'    { location, lat, lon, label }
 *   'tts-request'    { requestId, text }
 *   'error'          { phase, message }
 */
class VoicePipeline extends EventEmitter {
  /**
   * @param {object} options
   * @param {object}   options.router      - AIRouter instance
   * @param {object}   [options.mapWidget] - MapWidget instance (optional)
   * @param {Function} [options.sendSidecarMessage] - fn(payload) → writes to sidecar stdin
   * @param {Function} [options.onMapFlyTo] - called when a map trigger fires; (location) => void
   */
  constructor(options = {}) {
    super();
    this._router = options.router || null;
    this._mapWidget = options.mapWidget || null;
    this._sendSidecarMessage = typeof options.sendSidecarMessage === 'function'
      ? options.sendSidecarMessage
      : null;
    this._onMapFlyTo = typeof options.onMapFlyTo === 'function'
      ? options.onMapFlyTo
      : null;
    this._busy = false;
  }

  /**
   * Handle a finalised STT result coming from the sidecar.
   * Safe to call concurrently — extra calls are ignored while busy.
   */
  async handleSttResult(sttResult = {}) {
    const text = String(sttResult.text || '').trim();
    if (!text || this._busy) return;

    this._busy = true;
    this.emit('stt-final', { text });
    try {
      await this._runLlm(text);
    } catch (err) {
      this.emit('error', { phase: 'llm', message: String(err?.message || err) });
    } finally {
      this._busy = false;
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  async _runLlm(userText) {
    if (!this._router) {
      this.emit('error', { phase: 'llm', message: 'AIRouter not connected to VoicePipeline.' });
      return;
    }

    let fullText = '';

    const response = await this._router.routeRequest(
      { message: userText, profile: 'chat' },
      (chunkEvent) => {
        if (chunkEvent?.token) {
          fullText += chunkEvent.token;
          this.emit('llm-token', chunkEvent);
        }
      },
    );

    // Use accumulated text from streaming or fallback to response.text
    const responseText = fullText || String(response?.text || '');
    this.emit('llm-complete', {
      text: responseText,
      provider: response?.route?.provider || 'unknown',
      model: response?.route?.model || 'unknown',
    });

    await this._processResponse(responseText);
  }

  async _processResponse(responseText) {
    // ── 1. Extract and fire map trigger ──────────────────────────────────────
    const match = MAP_TRIGGER_RE.exec(responseText);
    const spokenText = responseText.replace(MAP_TRIGGER_RE, '').trim();

    if (match) {
      const location = match[1].trim();
      await this._handleMapTrigger(location);
    }

    // ── 2. Send spoken text to TTS via sidecar ───────────────────────────────
    if (spokenText) {
      await this._requestTts(spokenText);
    }
  }

  async _handleMapTrigger(location) {
    this.emit('map-trigger', { location });
    if (this._onMapFlyTo) {
      try {
        this._onMapFlyTo(location);
      } catch (err) {
        this.emit('error', { phase: 'map', message: String(err?.message || err) });
      }
      return;
    }
    if (this._mapWidget && typeof this._mapWidget.goTo === 'function') {
      try {
        const result = await this._mapWidget.goTo(location);
        this.emit('map-trigger', { location, ...result });
      } catch (err) {
        this.emit('error', { phase: 'map', message: String(err?.message || err) });
      }
    }
  }

  async _requestTts(text) {
    const requestId = `vp-tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.emit('tts-request', { requestId, text });
    if (this._sendSidecarMessage) {
      this._sendSidecarMessage({ type: 'tts_speak', text, requestId });
    }
  }
}

/**
 * Legacy factory kept for backward-compatibility with existing callers.
 * @deprecated Use `new VoicePipeline(options)` directly.
 */
function createVoicePipeline({ router, tools, tts }) {
  return {
    async run(input) {
      const route = await router.route(input);
      const toolResult = await tools.execute(route.action);
      return tts.speak(toolResult.summary || 'Done');
    },
  };
}

module.exports = { VoicePipeline, createVoicePipeline, MAP_TRIGGER_RE };
