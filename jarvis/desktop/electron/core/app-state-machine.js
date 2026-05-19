'use strict';

const EventEmitter = require('events');

const APP_STATE = {
  IDLE: 'IDLE',
  THINKING: 'THINKING',
  LISTENING: 'LISTENING',
  SPEAKING: 'SPEAKING',
  EXECUTING: 'EXECUTING',
};

function computeState(flags) {
  if (flags.executing) return APP_STATE.EXECUTING;
  if (flags.speaking) return APP_STATE.SPEAKING;
  if (flags.listening) return APP_STATE.LISTENING;
  if (flags.thinking) return APP_STATE.THINKING;
  return APP_STATE.IDLE;
}

class AppStateMachine extends EventEmitter {
  constructor({ initial = APP_STATE.IDLE } = {}) {
    super();
    this.flags = {
      thinking: initial === APP_STATE.THINKING,
      listening: initial === APP_STATE.LISTENING,
      speaking: initial === APP_STATE.SPEAKING,
      executing: initial === APP_STATE.EXECUTING,
    };
    this.state = computeState(this.flags);
  }

  _setFlag(flag, active, source = 'unknown') {
    const next = Boolean(active);
    if (this.flags[flag] === next) return;
    this.flags[flag] = next;
    const prevState = this.state;
    this.state = computeState(this.flags);
    if (prevState !== this.state) {
      this.emit('state-changed', {
        previous: prevState,
        state: this.state,
        source,
        at: new Date().toISOString(),
      });
    }
  }

  setThinking(active, source) {
    this._setFlag('thinking', active, source);
  }

  setListening(active, source) {
    this._setFlag('listening', active, source);
  }

  setSpeaking(active, source) {
    this._setFlag('speaking', active, source);
  }

  setExecuting(active, source) {
    this._setFlag('executing', active, source);
  }

  getState() {
    return this.state;
  }
}

module.exports = {
  APP_STATE,
  AppStateMachine,
};
