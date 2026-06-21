'use strict';

// Voice Input gap-fix (Phase 1 Step 2a) — decides which component owns
// speech-to-text for the current utterance instead of hardcoding a vendor
// or always re-transcribing on the Electron side.
//
// Root cause this resolves: ai-agent/main.py already runs a complete
// local-first/cloud-fallback STT chain (whisper.cpp -> faster-whisper ->
// OpenAIWhisperSTT) and emits its own `stt_result` over the sidecar
// WebSocket. voice-gateway.js was *also* independently re-transcribing the
// same `audio_segment` payload via a remote REST call, so two producers
// raced to fill the same UI field for one utterance. `decideSttRoute`
// gives a single, explicit answer for "who transcribes this segment" so
// only one producer ever fires.

const ROUTE_SIDECAR = 'sidecar';
const ROUTE_REMOTE = 'remote';
const ROUTE_NONE = 'none';

/**
 * @param {object} input
 * @param {boolean} input.sidecarConnected - sidecar WebSocket is up and already streaming audio_segment/stt_result.
 * @param {boolean} input.sidecarHandlesStt - sidecar's own STT engine is available (true unless main.py reports it has none).
 * @param {boolean} input.remoteConfigured - a remote/server STT endpoint is reachable (assistantx-server mode has one).
 * @returns {{ route: 'sidecar'|'remote'|'none', reason: string }}
 */
function decideSttRoute({ sidecarConnected, sidecarHandlesStt, remoteConfigured } = {}) {
  if (sidecarConnected && sidecarHandlesStt) {
    return { route: ROUTE_SIDECAR, reason: 'sidecar-pipeline-active' };
  }
  if (remoteConfigured) {
    return { route: ROUTE_REMOTE, reason: sidecarConnected ? 'sidecar-stt-unavailable' : 'sidecar-disconnected' };
  }
  return { route: ROUTE_NONE, reason: 'no-stt-route-available' };
}

module.exports = {
  ROUTE_SIDECAR,
  ROUTE_REMOTE,
  ROUTE_NONE,
  decideSttRoute,
};
