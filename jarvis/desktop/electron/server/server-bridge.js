'use strict';

const EventEmitter = require('events');
const WebSocket = require('ws');

const DEFAULT_PORT = 9000;
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;

class ServerBridge extends EventEmitter {
  constructor({ host, port = DEFAULT_PORT, tokenFactory, logger = () => {} } = {}) {
    super();
    this.host = host;
    this.port = port;
    this.tokenFactory = tokenFactory;
    this.log = logger;

    this._ws = null;
    this._connected = false;
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;
    this._manualDisconnect = false;
    this._requestSeq = 0;
    this._pending = new Map();
  }

  _url() {
    return `ws://${this.host}:${this.port}`;
  }

  isConnected() {
    return this._connected;
  }

  connect() {
    this._manualDisconnect = false;
    this._openSocket();
  }

  disconnect(reason = 'manual') {
    this._manualDisconnect = true;
    clearTimeout(this._reconnectTimer);
    this._reconnectAttempts = MAX_RECONNECT_ATTEMPTS;

    for (const [, pending] of this._pending.entries()) {
      pending.reject(new Error(`server-bridge-disconnected:${reason}`));
    }
    this._pending.clear();

    if (this._ws) {
      try {
        this._ws.close();
      } catch {
        // ignore
      }
      this._ws = null;
    }
    this._connected = false;
    this.emit('disconnected', { reason });
  }

  async _openSocket() {
    if (!this.host) {
      this.emit('error', new Error('server-host-not-configured'));
      return;
    }

    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    let token = '';
    try {
      token = await this.tokenFactory();
    } catch (error) {
      this.emit('error', new Error(`token-factory-failed:${error?.message || 'unknown'}`));
      this._scheduleReconnect();
      return;
    }

    try {
      this._ws = new WebSocket(this._url());
    } catch (error) {
      this.emit('error', error);
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      this._send({ type: 'handshake', auth: token, client: 'jarvis-desktop' });
    };

    this._ws.onclose = () => {
      const wasConnected = this._connected;
      this._connected = false;
      if (wasConnected) this.emit('disconnected', { reason: 'socket-closed' });
      if (!this._manualDisconnect) this._scheduleReconnect();
    };

    this._ws.onerror = () => {
      // handled by close handler
    };

    this._ws.onmessage = (event) => {
      this._handleMessage(event.data);
    };
  }

  _scheduleReconnect() {
    if (this._manualDisconnect) return;
    if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.emit('unavailable');
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

  _send(payload) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false;
    try {
      this._ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  _handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    const type = String(message?.type || '');
    if (type === 'status' && message.phase === 'authenticated') {
      this._connected = true;
      this._reconnectAttempts = 0;
      this.emit('connected', { host: this.host, port: this.port, subject: message.subject || null });
      return;
    }

    if (type === 'tool_result') {
      const requestId = String(message.requestId || '');
      const pending = this._pending.get(requestId);
      if (!pending) {
        this.emit('tool_result', message);
        return;
      }
      this._pending.delete(requestId);
      if (message.ok === false) {
        pending.reject(new Error(String(message.error || 'tool-call-failed')));
      } else {
        pending.resolve(message.result || null);
      }
      this.emit('tool_result', message);
      return;
    }

    if (type === 'agent_event') {
      this.emit('agent_event', message);
      return;
    }

    if (type === 'error') {
      this.emit('error', new Error(String(message.error || message.message || 'server-error')));
      return;
    }

    if (type === 'pong') {
      this.emit('pong', message);
      return;
    }

    this.emit('status', message);
  }

  sendState(state) {
    this._send({ type: 'state_sync', state: String(state || 'IDLE') });
  }

  ping() {
    return this._send({ type: 'ping', ts: Date.now() });
  }

  callTool(tool, args = {}) {
    if (!this._connected) return Promise.reject(new Error('server-not-connected'));

    const requestId = `srv-${Date.now()}-${++this._requestSeq}`;
    const payload = {
      type: 'tool_call',
      requestId,
      tool,
      args: args && typeof args === 'object' ? args : {},
    };

    return new Promise((resolve, reject) => {
      this._pending.set(requestId, { resolve, reject });
      const sent = this._send(payload);
      if (!sent) {
        this._pending.delete(requestId);
        reject(new Error('server-send-failed'));
      }
    });
  }
}

module.exports = {
  ServerBridge,
};
