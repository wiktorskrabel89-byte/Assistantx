'use strict';

const { createPromptLoader } = require('./loader');
const { createPromptComposer } = require('./composer');

function createPromptRegistry() {
  const loader = createPromptLoader();
  const composer = createPromptComposer({ loader });
  return {
    loader,
    composer,
  };
}

module.exports = {
  createPromptRegistry,
};
