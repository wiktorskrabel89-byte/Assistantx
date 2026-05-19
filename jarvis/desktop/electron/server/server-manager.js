'use strict';

const EventEmitter = require('events');
const { ServerBridge } = require('./server-bridge');

const AUTONOMY = {
  DEFAULT: 'default',
  AUTO: 'auto',
  FULL: 'full',
};

const DESTRUCTIVE_TOOLS = new Set(['delete_file']);
const LOW_RISK_TOOLS = new Set(['get_metrics', 'list_files']);

function isDestructiveTool(tool, args = {}) {
  if (DESTRUCTIVE_TOOLS.has(tool)) return true;
  if (tool === 'manage_service') {
    const action = String(args.action || '').toLowerCase();
    return action === 'stop' || action === 'restart';
  }
  return false;
}

function isLowRiskTool(tool, args = {}) {
  if (LOW_RISK_TOOLS.has(tool)) return true;
  if (tool === 'manage_service') {
    const action = String(args.action || '').toLowerCase();
    return action === 'status';
  }
  return false;
}

class ServerManager extends EventEmitter {
  constructor({ permissions, tokenFactory, logger = () => {}, appState = null, allowFullControl = () => false } = {}) {
    super();
    this.permissions = permissions;
    this.tokenFactory = tokenFactory;
    this.log = logger;
    this.appState = appState;
    this.allowFullControl = allowFullControl;

    this.bridge = null;
    this.serverIp = null;
    this.connected = false;
    this.autonomyLevel = AUTONOMY.DEFAULT;

    this._pendingApprovals = new Map();
    this._approvalTimerMs = 60_000;
  }

  getStatus() {
    return {
      connected: this.connected,
      ip: this.serverIp,
      autonomyLevel: this.autonomyLevel,
      pendingCount: this._pendingApprovals.size,
    };
  }

  _bindBridge(bridge) {
    bridge.on('connected', (payload) => {
      this.connected = true;
      this.emit('status', this.getStatus());
      this.emit('activity', { type: 'connected', payload });
    });

    bridge.on('disconnected', (payload) => {
      this.connected = false;
      this.emit('status', this.getStatus());
      this.emit('activity', { type: 'disconnected', payload });
      this._flushApprovals('server-disconnected');
    });

    bridge.on('agent_event', (payload) => {
      this.emit('activity', { type: 'agent_event', payload });
    });

    bridge.on('tool_result', (payload) => {
      this.emit('activity', { type: 'tool_result', payload });
    });

    bridge.on('status', (payload) => {
      this.emit('activity', { type: 'status', payload });
    });

    bridge.on('error', (error) => {
      this.emit('activity', { type: 'error', payload: { message: error?.message || 'unknown' } });
    });

    bridge.on('unavailable', () => {
      this.emit('activity', { type: 'unavailable', payload: { ip: this.serverIp } });
    });
  }

  connect(ip, tokenFactory = null) {
    const host = String(ip || '').trim();
    if (!host) {
      return { ok: false, error: 'server-ip-required' };
    }

    if (this.bridge) {
      this.bridge.disconnect('reconnect');
      this.bridge.removeAllListeners();
    }

    this.serverIp = host;
    this.bridge = new ServerBridge({
      host,
      tokenFactory: tokenFactory || this.tokenFactory,
      logger: this.log,
    });

    this._bindBridge(this.bridge);
    this.bridge.connect();
    return { ok: true, ip: host };
  }

  disconnect() {
    if (this.bridge) {
      this.bridge.disconnect('manual');
      this.bridge.removeAllListeners();
      this.bridge = null;
    }
    this.connected = false;
    this._flushApprovals('manual-disconnect');
    this.emit('status', this.getStatus());
    return { ok: true };
  }

  killSwitch() {
    const result = this.disconnect();
    this.autonomyLevel = AUTONOMY.DEFAULT;
    this.emit('status', this.getStatus());
    return { ...result, autonomyLevel: this.autonomyLevel };
  }

  setAutonomyLevel(level) {
    const normalized = String(level || '').toLowerCase();
    if (![AUTONOMY.DEFAULT, AUTONOMY.AUTO, AUTONOMY.FULL].includes(normalized)) {
      return { ok: false, error: 'invalid-autonomy-level' };
    }

    if (normalized === AUTONOMY.FULL && !this.allowFullControl()) {
      return { ok: false, error: 'disclaimer-required' };
    }

    this.autonomyLevel = normalized;
    this.emit('status', this.getStatus());
    this.emit('activity', {
      type: 'autonomy-level-changed',
      payload: { autonomyLevel: this.autonomyLevel },
    });
    return { ok: true, autonomyLevel: this.autonomyLevel };
  }

  _flushApprovals(reason) {
    for (const [, pending] of this._pendingApprovals.entries()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(reason));
    }
    this._pendingApprovals.clear();
  }

  _queueApproval(tool, args = {}, reason = 'manual-approval-required') {
    return new Promise((resolve, reject) => {
      const id = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const pendingAction = {
        id,
        action_type: 'OS_MODIFICATION',
        command: `${tool}(${JSON.stringify(args)})`,
        reason,
        timestamp: new Date().toISOString(),
        tool,
        args,
      };

      const timeoutId = setTimeout(() => {
        this._pendingApprovals.delete(id);
        reject(new Error('approval-timeout'));
      }, this._approvalTimerMs);

      this._pendingApprovals.set(id, {
        resolve,
        reject,
        timeoutId,
        action: pendingAction,
      });

      this.emit('approval-required', pendingAction);
    });
  }

  approveAction(approvalId) {
    const pending = this._pendingApprovals.get(String(approvalId || ''));
    if (!pending) return { ok: false, error: 'approval-not-found' };
    clearTimeout(pending.timeoutId);
    this._pendingApprovals.delete(String(approvalId));
    pending.resolve({ approved: true, action: pending.action });
    return { ok: true };
  }

  rejectAction(approvalId) {
    const pending = this._pendingApprovals.get(String(approvalId || ''));
    if (!pending) return { ok: false, error: 'approval-not-found' };
    clearTimeout(pending.timeoutId);
    this._pendingApprovals.delete(String(approvalId));
    pending.reject(new Error('approval-rejected'));
    return { ok: true };
  }

  _isApprovalRequired(tool, args) {
    if (isDestructiveTool(tool, args)) return true;
    if (this.autonomyLevel === AUTONOMY.DEFAULT) return true;
    if (this.autonomyLevel === AUTONOMY.AUTO) return !isLowRiskTool(tool, args);
    return false;
  }

  async _authorize(tool, args) {
    if (!this.permissions?.authorize) return { allowed: true };
    return this.permissions.authorize('server:exec-tool', { tool, args });
  }

  async execTool(tool, args = {}) {
    if (!this.bridge || !this.connected) {
      throw new Error('server-not-connected');
    }

    const normalizedTool = String(tool || '').trim();
    if (!normalizedTool) throw new Error('tool-required');

    const auth = await this._authorize(normalizedTool, args);
    if (!auth.allowed) {
      throw new Error(`permission-denied:${auth.reason}`);
    }

    if (this._isApprovalRequired(normalizedTool, args)) {
      await this._queueApproval(normalizedTool, args, isDestructiveTool(normalizedTool, args)
        ? 'destructive-action-requires-approval'
        : 'manual-approval-required');
    }

    this.appState?.setThinking(true, 'server-tool');
    this.appState?.setExecuting(true, 'server-tool');
    this.emit('activity', {
      type: 'tool-executing',
      payload: { tool: normalizedTool, args, autonomyLevel: this.autonomyLevel },
    });

    try {
      const result = await this.bridge.callTool(normalizedTool, args);
      this.emit('activity', {
        type: 'tool-finished',
        payload: { tool: normalizedTool, ok: true },
      });
      return result;
    } catch (error) {
      this.emit('activity', {
        type: 'tool-finished',
        payload: { tool: normalizedTool, ok: false, error: error?.message || 'unknown' },
      });
      throw error;
    } finally {
      this.appState?.setExecuting(false, 'server-tool');
      this.appState?.setThinking(false, 'server-tool');
    }
  }

  sendState(state) {
    this.bridge?.sendState(state);
  }
}

module.exports = {
  AUTONOMY,
  isDestructiveTool,
  isLowRiskTool,
  ServerManager,
};
