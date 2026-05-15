'use strict';

function buildJarvisApiV2(deps) {
  const {
    getToken,
    backend,
    localState,
    scheduler,
    accounts,
    runtime,
    sidecar,
    voiceGateway,
  } = deps;

  return {
    auth: { getToken },
    backend,
    localState,
    scheduler,
    accounts,
    runtime,
    voice: {
      sidecar,
      gateway: voiceGateway,
    },
  };
}

module.exports = {
  buildJarvisApiV2,
};
