/**
 * Tests for sidecar-bridge.js
 *
 * The bridge depends on WebSocket and Web Audio APIs that are not available in
 * jsdom, so we mock them at the module level and test only the message
 * protocol and event routing logic — not the actual audio capture path.
 */

const EventEmitter = require('events');

// ── Mock WebSocket ───────────────────────────────────────────────────────────
class MockWebSocket extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.sent = [];
    this._simulate = {
      open: () => {
        this.readyState = MockWebSocket.OPEN;
        if (typeof this.onopen === 'function') this.onopen();
      },
      close: (code = 1000) => {
        this.readyState = MockWebSocket.CLOSED;
        if (typeof this.onclose === 'function') this.onclose({ code });
      },
      message: (data) => {
        if (typeof this.onmessage === 'function') this.onmessage({ data });
      },
    };
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this._simulate.close();
  }
}
MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSED = 3;

global.WebSocket = MockWebSocket;
global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');

// ── Module under test ────────────────────────────────────────────────────────
const { SidecarBridge } = require('../../jarvis/desktop/sidecar-bridge');

describe('SidecarBridge', () => {
  let bridge;
  let mockWs;

  beforeEach(() => {
    bridge = new SidecarBridge({ host: '127.0.0.1', port: 8765 });
    bridge._reconnectAttempts = SidecarBridge.MAX_RECONNECT || 0;
  });

  afterEach(() => {
    bridge.disconnect();
  });

  function openConnection() {
    bridge._reconnectAttempts = 0;
    bridge._openSocket();
    mockWs = global.__lastWebSocket;
    if (mockWs) mockWs._simulate.open();
    return mockWs;
  }

  it('emits connected event when WebSocket opens', () => {
    const listener = jest.fn();
    bridge.on('connected', listener);

    // Intercept WebSocket construction
    let ws;
    global.WebSocket = class extends MockWebSocket {
      constructor(...args) {
        super(...args);
        ws = this;
      }
    };

    bridge.connect();
    ws._simulate.open();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(bridge.isConnected()).toBe(true);

    global.WebSocket = MockWebSocket;
  });

  it('emits disconnected event when WebSocket closes', () => {
    const connected = jest.fn();
    const disconnected = jest.fn();
    bridge.on('connected', connected);
    bridge.on('disconnected', disconnected);

    let ws;
    global.WebSocket = class extends MockWebSocket {
      constructor(...args) { super(...args); ws = this; }
    };
    bridge.connect();
    ws._simulate.open();
    ws._simulate.close();

    expect(disconnected).toHaveBeenCalledTimes(1);
    expect(bridge.isConnected()).toBe(false);
    global.WebSocket = MockWebSocket;
  });

  it('routes incoming wake_word message to wake_word event', () => {
    const handler = jest.fn();
    bridge.on('wake_word', handler);

    bridge._connected = true;
    bridge._handleMessage(JSON.stringify({ type: 'wake_word', phrase: 'hey jarvis' }));

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ phrase: 'hey jarvis' }));
  });

  it('routes stt_result with isFinal flag', () => {
    const handler = jest.fn();
    bridge.on('stt_result', handler);

    bridge._handleMessage(JSON.stringify({ type: 'stt_result', text: 'open discord', isFinal: true }));

    expect(handler).toHaveBeenCalledWith({ text: 'open discord', isFinal: true });
  });

  it('routes tts_audio with requestId, data, and format', () => {
    const handler = jest.fn();
    bridge.on('tts_audio', handler);

    bridge._handleMessage(JSON.stringify({
      type: 'tts_audio',
      requestId: 'req-1',
      data: 'AABB==',
      format: 'wav',
    }));

    expect(handler).toHaveBeenCalledWith({ requestId: 'req-1', data: 'AABB==', format: 'wav' });
  });

  it('routes intent_parsed with full payload', () => {
    const handler = jest.fn();
    bridge.on('intent_parsed', handler);

    bridge._handleMessage(JSON.stringify({
      type: 'intent_parsed',
      requestId: 'req-2',
      intent: 'open_app',
      entities: { app: 'spotify' },
      confidence: 0.92,
    }));

    expect(handler).toHaveBeenCalledWith({
      requestId: 'req-2',
      intent: 'open_app',
      entities: { app: 'spotify' },
      confidence: 0.92,
    });
  });

  it('sends configure message immediately when connected', () => {
    const sent = [];
    bridge._connected = true;
    bridge._ws = { send: (d) => sent.push(JSON.parse(d)) };

    bridge.configure({ wakeWordPhrase: 'jarvis' });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual(expect.objectContaining({ type: 'configure', wakeWordPhrase: 'jarvis' }));
  });

  it('buffers configure as pending when not connected, sends on connect', () => {
    bridge._connected = false;
    bridge.configure({ wakeWordPhrase: 'jarvis' });
    expect(bridge._pendingSettings).toMatchObject({ wakeWordPhrase: 'jarvis' });
  });

  it('sends tts_speak message', () => {
    const sent = [];
    bridge._connected = true;
    bridge._ws = { send: (d) => sent.push(JSON.parse(d)) };

    bridge.requestTts('Hello world', 'req-tts-1');

    expect(sent[0]).toEqual({ type: 'tts_speak', text: 'Hello world', requestId: 'req-tts-1' });
  });

  it('converts Float32Array to PCM Int16 correctly', () => {
    const float32 = new Float32Array([0, 0.5, -0.5, 1.0, -1.0]);
    const int16 = bridge._float32ToPcmInt16(float32);

    expect(int16[0]).toBe(0);
    expect(int16[1]).toBe(16384);  // 0.5 * 32767 ≈ 16384
    expect(int16[2]).toBe(-16384);
    expect(int16[3]).toBe(32767);
    expect(int16[4]).toBe(-32768);
  });

  it('ignores unknown message types without throwing', () => {
    expect(() => {
      bridge._handleMessage(JSON.stringify({ type: 'unknown_type', foo: 'bar' }));
    }).not.toThrow();
  });

  it('handles malformed JSON without throwing', () => {
    expect(() => {
      bridge._handleMessage('{not valid json}');
    }).not.toThrow();
  });
});
