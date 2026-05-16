'use strict';

class RuntimeFailure extends Error {
  constructor(message, code = 'runtime-failure', details = {}) {
    super(message);
    this.name = 'RuntimeFailure';
    this.code = code;
    this.details = details;
  }
}

class ProviderFailure extends RuntimeFailure {
  constructor(message, details = {}) {
    super(message, 'provider-failure', details);
    this.name = 'ProviderFailure';
  }
}

class ToolFailure extends RuntimeFailure {
  constructor(message, details = {}) {
    super(message, 'tool-failure', details);
    this.name = 'ToolFailure';
  }
}

class WorkflowStuckFailure extends RuntimeFailure {
  constructor(message, details = {}) {
    super(message, 'workflow-stuck', details);
    this.name = 'WorkflowStuckFailure';
  }
}

module.exports = {
  RuntimeFailure,
  ProviderFailure,
  ToolFailure,
  WorkflowStuckFailure,
};
