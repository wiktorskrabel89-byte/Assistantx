/**
 * Mic-capture pipeline tests for sidecar-bridge.js
 *
 * Locks in the 2026-06 voice-pipeline fixes:
 * - ScriptProcessorNode must be created with a valid power-of-two buffer
 *   (createScriptProcessor(1600) throws IndexSizeError in Chromium, which
 *   used to kill capture at startup).
 * - A failed capture start must release the acquired mic stream (the old
 *   catch block leaked live tracks → OS mic indicator stuck on).
 * - Audio is re-chunked into exact 100 ms / 1600-sample frames.
 * - The half-duplex playback gate hard-mutes the mic during TTS playback.
 * - Device selection / enumeration for the Settings → Audio panel.
 */

const VALID_BUFFER_SIZES = [0, 256, 512, 1024, 2048, 4096, 8192, 16384];

jest.mock('electron', () => ({
  ipcRenderer: {
    invoke: jest.fn(() => Promise.resolve({})),
    on: jest.fn(),
    removeListener: jest.fn(),
  },
}), { virtual: true });

class FakeTrack {
  constructor() {
    this.kind = 'audio';
    this.enabled = true;
    this.stopped = false;
  }

  stop() {
    this.stopped = true;
  }
}

class FakeMediaStream {
  constructor() {
    this.tracks = [new FakeTrack()];
  }

  getTracks() {
    return this.tracks;
  }

  getAudioTracks() {
    return this.tracks;
  }
}

class FakeScriptProcessor {
  constructor(bufferSize) {
    this.bufferSize = bufferSize;
    this.onaudioprocess = null;
  }

  connect() {}

  disconnect() {}
}

class FakeAudioContext {
  constructor(options) {
    this.options = options || {};
    this.destination = {};
    this.processor = null;
    FakeAudioContext.instances.push(this);
  }

  createMediaStreamSource() {
    return { connect: () => {}, disconnect: () => {} };
  }

  createScriptProcessor(bufferSize) {
    if (!VALID_BUFFER_SIZES.includes(bufferSize)) {
      // Mirrors Chromium: "buffer size (1600) must be 0 or a power of two
      // between 256 and 16384" — the original bug.
      throw new Error(`IndexSizeError: buffer size (${bufferSize}) must be 0 or a power of two between 256 and 16384.`);
    }
    if (FakeAudioContext.failProcessorCreation) {
      throw new Error('IndexSizeError: simulated failure');
    }
    this.processor = new FakeScriptProcessor(bufferSize);
    return this.processor;
  }

  close() {
    return Promise.resolve();
  }
}
FakeAudioContext.instances = [];
FakeAudioContext.failProcessorCreation = false;

global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');

const { SidecarBridge } = require('../../jarvis/desktop/sidecar-bridge');

const CHUNK_SAMPLES = 1600; // 100 ms at 16 kHz
const CHUNK_BYTES = CHUNK_SAMPLES * 2;

function decodeChunk(payload) {
  return Buffer.from(payload.data, 'base64');
}

describe('SidecarBridge mic capture', () => {
  let bridge;
  let sendMock;
  let getUserMediaMock;
  let enumerateDevicesMock;
  let mediaStreams;

  beforeEach(() => {
    FakeAudioContext.instances = [];
    FakeAudioContext.failProcessorCreation = false;
    mediaStreams = [];

    getUserMediaMock = jest.fn(async () => {
      const stream = new FakeMediaStream();
      mediaStreams.push(stream);
      return stream;
    });
    enumerateDevicesMock = jest.fn(async () => [
      { kind: 'audioinput', deviceId: 'mic-1', label: 'Desk microphone' },
      { kind: 'audioinput', deviceId: 'mic-2', label: '' },
      { kind: 'videoinput', deviceId: 'cam-1', label: 'Webcam' },
    ]);

    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: getUserMediaMock,
        enumerateDevices: enumerateDevicesMock,
      },
    });
    window.AudioContext = FakeAudioContext;

    bridge = new SidecarBridge({ ipcMode: 'websocket', url: 'ws://127.0.0.1:0' });
    sendMock = jest.fn(() => true);
    bridge._transport = { send: sendMock };
    bridge._connected = true;
  });

  function audioChunkPayloads() {
    return sendMock.mock.calls
      .map(([payload]) => payload)
      .filter((payload) => payload && payload.type === 'audio_chunk');
  }

  function driveAudio(samples) {
    const context = FakeAudioContext.instances[0];
    context.processor.onaudioprocess({
      inputBuffer: { getChannelData: () => samples },
    });
  }

  it('creates the ScriptProcessor with a valid power-of-two buffer size', async () => {
    await bridge.startAudioCapture();
    const context = FakeAudioContext.instances[0];
    expect(VALID_BUFFER_SIZES).toContain(context.processor.bufferSize);
    expect(bridge.isCapturing()).toBe(true);
  });

  it('requests echo cancellation, noise suppression and AGC from getUserMedia', async () => {
    await bridge.startAudioCapture();
    const constraints = getUserMediaMock.mock.calls[0][0];
    expect(constraints.audio.echoCancellation).toBe(true);
    expect(constraints.audio.noiseSuppression).toBe(true);
    expect(constraints.audio.autoGainControl).toBe(true);
    expect(constraints.audio.sampleRate).toBe(16000);
  });

  it('re-chunks processor buffers into exact 100 ms frames', async () => {
    await bridge.startAudioCapture();

    driveAudio(new Float32Array(2048).fill(0.25));
    expect(audioChunkPayloads()).toHaveLength(1); // 2048 → one 1600 frame + 448 leftover

    driveAudio(new Float32Array(2048).fill(0.25));
    // 448 + 2048 = 2496 → one more frame, 896 leftover
    expect(audioChunkPayloads()).toHaveLength(2);

    for (const payload of audioChunkPayloads()) {
      expect(decodeChunk(payload)).toHaveLength(CHUNK_BYTES);
    }
  });

  it('converts float32 to int16 with clamping', () => {
    const int16 = bridge._float32ToPcmInt16(new Float32Array([0, 0.5, 1.5, -1.5]));
    expect(Array.from(int16)).toEqual([0, 16384, 32767, -32767]);
  });

  it('releases the mic stream when processor creation fails (no leaked tracks)', async () => {
    FakeAudioContext.failProcessorCreation = true;

    await expect(bridge.startAudioCapture()).rejects.toThrow(/IndexSizeError/);

    expect(mediaStreams).toHaveLength(1);
    expect(mediaStreams[0].tracks[0].stopped).toBe(true);
    expect(bridge.isCapturing()).toBe(false);
    expect(bridge._mediaStream).toBeNull();
  });

  it('hard-mutes the mic and notifies the sidecar while TTS plays', async () => {
    await bridge.startAudioCapture();
    const track = mediaStreams[0].tracks[0];

    bridge.setPlaybackActive(true);
    expect(track.enabled).toBe(false);
    expect(sendMock).toHaveBeenCalledWith({ type: 'playback_state', active: true });

    // Audio arriving during playback must not be forwarded.
    driveAudio(new Float32Array(2048).fill(0.5));
    expect(audioChunkPayloads()).toHaveLength(0);

    bridge.setPlaybackActive(false);
    expect(track.enabled).toBe(true);
    expect(sendMock).toHaveBeenCalledWith({ type: 'playback_state', active: false });

    driveAudio(new Float32Array(2048).fill(0.5));
    expect(audioChunkPayloads()).toHaveLength(1);
  });

  it('keeps capture live during TTS only when barge-in is explicitly enabled', async () => {
    await bridge.startAudioCapture();
    const track = mediaStreams[0].tracks[0];

    bridge.setBargeInEnabled(true);
    bridge.setPlaybackActive(true);

    expect(track.enabled).toBe(true);
    expect(sendMock).toHaveBeenCalledWith({ type: 'configure', bargeInEnabled: true });
    expect(sendMock).toHaveBeenCalledWith({ type: 'playback_state', active: true });

    driveAudio(new Float32Array(2048).fill(0.5));
    expect(audioChunkPayloads()).toHaveLength(1);
  });

  it('emits renderer-side mic levels for the Settings test-mic meter', async () => {
    await bridge.startAudioCapture();
    const levels = [];
    bridge.on('mic_level', (payload) => levels.push(payload));

    driveAudio(new Float32Array(2048).fill(0.25));

    expect(levels).toHaveLength(1);
    expect(levels[0].rms).toBeCloseTo(0.25, 5);
    expect(levels[0].muted).toBe(false);
  });

  it('restarts capture on the selected input device', async () => {
    await bridge.startAudioCapture();
    await bridge.setInputDevice('mic-2');

    expect(getUserMediaMock).toHaveBeenCalledTimes(2);
    const constraints = getUserMediaMock.mock.calls[1][0];
    expect(constraints.audio.deviceId).toEqual({ exact: 'mic-2' });
    expect(bridge.isCapturing()).toBe(true);
    expect(bridge.getInputDevice()).toBe('mic-2');
    // The first stream must be fully released.
    expect(mediaStreams[0].tracks[0].stopped).toBe(true);
  });

  it('lists only audio input devices with label fallbacks', async () => {
    const devices = await bridge.listAudioInputDevices();
    expect(devices).toEqual([
      { deviceId: 'mic-1', label: 'Desk microphone' },
      { deviceId: 'mic-2', label: 'Microphone 2' },
    ]);
  });

  it('preserves the sidecar STT fallback marker on final audio segments', () => {
    const segments = [];
    bridge.on('audio_segment', (payload) => segments.push(payload));

    bridge._handleMessage({
      type: 'audio_segment',
      data: 'pcm',
      format: 'audio/raw',
      sampleRate: 16000,
      sidecarSttFallback: true,
    });

    expect(segments).toEqual([
      expect.objectContaining({
        data: 'pcm',
        format: 'audio/raw',
        sampleRate: 16000,
        sidecarSttFallback: true,
      }),
    ]);
  });

  it('stopAudioCapture stops every acquired track', async () => {
    await bridge.startAudioCapture();
    bridge.stopAudioCapture();
    expect(mediaStreams[0].tracks[0].stopped).toBe(true);
    expect(bridge.isCapturing()).toBe(false);
  });
});
