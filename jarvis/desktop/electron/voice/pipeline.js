'use strict';

function createVoicePipeline({ router, tools, tts }) {
  return {
    async run(input) {
      const route = await router.route(input);
      const toolResult = await tools.execute(route.action);
      return tts.speak(toolResult.summary || 'Done');
    },
  };
}

module.exports = { createVoicePipeline };
