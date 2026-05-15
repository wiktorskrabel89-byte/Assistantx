'use strict';

class AiProvider {
  async generate(_request) { throw new Error('generate() not implemented'); }
  async stream(_request, _onEvent) { throw new Error('stream() not implemented'); }
  async cancel(_requestId) { return { ok: true }; }
  async embeddings(_input) { throw new Error('embeddings() not implemented'); }
}

module.exports = { AiProvider };
