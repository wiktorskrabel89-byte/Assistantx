const EventEmitter = require('events');
const { VoiceGateway, PROVIDER_MODE_SERVER } = require('../../jarvis/desktop/voice-gateway');

class FakeSidecar extends EventEmitter {
  isConnected() {
    return true;
  }

  getCapabilities() {
    return { sttAvailable: true, sttBackend: 'whisper.cpp' };
  }
}

describe('VoiceGateway STT routing', () => {
  it('uses remote fallback for audio segments marked as sidecar STT fallback', async () => {
    const sidecar = new FakeSidecar();
    const queuePromptExecution = jest.fn();
    const gateway = new VoiceGateway({
      sidecar,
      invokeMain: jest.fn().mockResolvedValue({}),
      queuePromptExecution,
    });
    gateway.on('error', () => {});
    gateway.configure({ providerMode: PROVIDER_MODE_SERVER, language: 'en' });
    gateway._backend.transcribe = jest.fn().mockResolvedValue({
      text: 'hello from fallback',
      provider: 'groq',
    });

    const sttResults = [];
    gateway.on('stt_result', (payload) => sttResults.push(payload));

    await gateway._handleAudioSegment({
      data: 'base64-pcm',
      format: 'audio/raw',
      sampleRate: 16000,
      sidecarSttFallback: true,
    });

    expect(gateway._backend.transcribe).toHaveBeenCalledWith(expect.objectContaining({
      audioBase64: 'base64-pcm',
      mimeType: 'audio/raw',
      sampleRate: 16000,
      language: 'en',
    }));
    expect(sttResults).toEqual([
      expect.objectContaining({
        text: 'hello from fallback',
        isFinal: true,
        source: 'groq',
      }),
    ]);
    expect(queuePromptExecution).toHaveBeenCalledWith(
      'hello from fallback',
      expect.objectContaining({ origin: 'voice-gateway' }),
    );
  });
});
