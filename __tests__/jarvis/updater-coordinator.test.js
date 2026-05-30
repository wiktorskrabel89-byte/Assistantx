'use strict';

function createDeps() {
  return {
    app: {
      isPackaged: true,
      getVersion: jest.fn(() => '1.0.0'),
      getPath: jest.fn(() => '/tmp/assistantx-updater-tests'),
    },
    startupDiagnostics: {
      setComponent: jest.fn(),
      pushEvent: jest.fn(),
    },
    telemetryBus: {
      publish: jest.fn(),
    },
    onState: jest.fn(),
    onHealth: jest.fn(),
  };
}

describe('jarvis updater coordinator', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('uses electron.net.fetch for manifest requests when available', async () => {
    const globalFetch = jest.fn().mockRejectedValue(new Error('should-not-use-global-fetch'));
    global.fetch = globalFetch;

    const netFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    jest.doMock('electron', () => ({
      net: {
        fetch: netFetch,
        isOnline: () => true,
      },
    }), { virtual: true });

    const { createUpdateCoordinator } = require('../../jarvis/desktop/electron/updater/coordinator');
    const coordinator = createUpdateCoordinator(createDeps());

    const result = await coordinator.fetchUpdatesManifest();

    expect(result).toEqual({ ok: true });
    expect(netFetch).toHaveBeenCalledWith(
      'https://updates.assistantx.pl/versions.json',
      expect.objectContaining({
        cache: 'no-store',
        redirect: 'follow',
        headers: { Accept: 'application/json,text/plain,*/*' },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('skips packaged update checks while electron reports offline', async () => {
    const autoUpdater = {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      setFeedURL: jest.fn(),
      checkForUpdates: jest.fn(),
      on: jest.fn(),
    };

    jest.doMock('electron', () => ({
      net: {
        isOnline: () => false,
      },
    }), { virtual: true });

    jest.doMock('electron-updater', () => ({
      autoUpdater,
    }), { virtual: true });

    const { createUpdateCoordinator } = require('../../jarvis/desktop/electron/updater/coordinator');
    const deps = createDeps();
    const coordinator = createUpdateCoordinator(deps);

    const result = await coordinator.check({ source: 'manual' });

    expect(result).toEqual({ ok: false, reason: 'network-offline' });
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(deps.onState).toHaveBeenCalledWith(expect.objectContaining({
      status: 'unavailable',
      reason: 'network-offline',
    }));
  });
});
