'use strict';

function createVoiceBackendAbstraction({ sidecar, remoteApi } = {}) {
  return {
    async transcribe(payload) {
      if (remoteApi?.transcribe) return remoteApi.transcribe(payload);
      if (sidecar?.requestIntentParse) {
        return { ok: false, reason: 'sidecar-transcribe-push-only' };
      }
      return { ok: false, reason: 'no-transcribe-backend' };
    },
    async synthesize(payload) {
      if (remoteApi?.synthesize) return remoteApi.synthesize(payload);
      if (sidecar?.requestTts) {
        sidecar.requestTts(payload.text || '', payload.requestId || `tts-${Date.now()}`);
        return { ok: true, mode: 'sidecar-push' };
      }
      return { ok: false, reason: 'no-tts-backend' };
    },
    interrupt() {
      if (typeof sidecar?.setListeningForCommand === 'function') sidecar.setListeningForCommand(false);
      if (typeof sidecar?.stopAudioCapture === 'function') sidecar.stopAudioCapture();
      return { ok: true };
    },
  };
}

module.exports = { createVoiceBackendAbstraction };
