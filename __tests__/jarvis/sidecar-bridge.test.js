/**
 * Tests for sidecar-bridge.js
 */

const EventEmitter = require('events');

const mockInvoke = jest.fn();
const mockIpcListeners = new Map();

jest.mock('electron', () => ({
  ipcRenderer: {
    invoke: (...args) => mockInvoke(...args),
    on: (channel, listener) => {
      mockIpcListeners.set(channel, listener);
    },
    removeListener: (channel) => {
      mockIpcListeners.delete(channel);
    },
  },
}), { virtual: true });

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
      close: () => {
        this.readyState = MockWebSocket.CLOSED;
        if (typeof this.onclose === 'function') this.onclose();
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

const { SidecarBridge } = require('../../jarvis/desktop/sidecar-bridge');

async function flushPromises() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SidecarBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIpcListeners.clear();
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'get-sidecar-status') {
        return Promise.resolve({ status: 'running' });
      }
      if (channel === 'sidecar:send') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({});
    });
  });

  it('connects in stdio mode and emits connected', async () => {
    const bridge = new SidecarBridge({ ipcMode: 'stdio' });
    const onConnected = jest.fn();
    bridge.on('connected', onConnected);

    bridge.connect();
    await flushPromises();

    expect(onConnected).toHaveBeenCalledTimes(1);
    expect(bridge.isConnected()).toBe(true);
  });

  it('sends stdio payloads through main-process IPC', async () => {
    const bridge = new SidecarBridge({ ipcMode: 'stdio' });
    bridge.connect();
    await flushPromises();

    const ok = bridge.requestTts('Hello world', 'req-1');

    expect(ok).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('sidecar:send', {
      type: 'tts_speak',
      text: 'Hello world',
      requestId: 'req-1',
    });
  });

  it('routes stdio sidecar messages to events', async () => {
    const bridge = new SidecarBridge({ ipcMode: 'stdio' });
    const handler = jest.fn();
    bridge.on('intent_parsed', handler);

    bridge.connect();
    await flushPromises();
    mockIpcListeners.get('sidecar-message')?.({}, {
      type: 'intent_parsed',
      requestId: 'req-2',
      intent: 'open_app',
      entities: { app: 'spotify' },
      confidence: 0.9,
    });

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'req-2',
      intent: 'open_app',
      entities: { app: 'spotify' },
      confidence: 0.9,
    }));
  });

  it('falls back to websocket transport when requested', () => {
    const bridge = new SidecarBridge({ ipcMode: 'websocket', url: 'ws://127.0.0.1:8765' });
    const onConnected = jest.fn();
    bridge.on('connected', onConnected);

    bridge.connect();
    bridge._transport._ws._simulate.open();

    expect(onConnected).toHaveBeenCalledTimes(1);
    expect(bridge.isConnected()).toBe(true);
  });

  it('handles malformed JSON without throwing', () => {
    const bridge = new SidecarBridge({ ipcMode: 'websocket', url: 'ws://127.0.0.1:8765' });
    expect(() => bridge._handleMessage('{not valid json}')).not.toThrow();
  });
});
