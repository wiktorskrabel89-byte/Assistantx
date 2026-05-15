'use strict';

const { invalidResult } = require('../../services/ipc-guards');

function withSchema(channel, validator, handler) {
  return async (event, payload) => {
    const parsed = typeof validator === 'function' ? validator(payload) : payload;
    if (parsed === null || parsed === undefined) {
      return invalidResult(channel, 'schema-validation-failed');
    }
    return handler(event, parsed);
  };
}

module.exports = {
  withSchema,
};
