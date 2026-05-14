const fs = require('fs');
const os = require('os');
const path = require('path');

describe('jarvis launcher catalog', () => {
  let tempDir;
  let dbPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assistantx-launcher-'));
    dbPath = path.join(tempDir, 'launcher.db');
    process.env.JARVIS_LAUNCHER_DB_PATH = dbPath;
    jest.resetModules();
  });

  afterEach(() => {
    const { closeDb } = require('../../jarvis/desktop/launcher/db');
    closeDb();
    delete process.env.JARVIS_LAUNCHER_DB_PATH;
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.resetModules();
  });

  it('stores discovered apps in SQLite and auto-learns aliases from repeated resolver decisions', () => {
    const catalog = require('../../jarvis/desktop/launcher/catalog');

    catalog.upsertApps([
      {
        key: 'spotify',
        name: 'Spotify',
        launchTarget: 'C:\\Users\\me\\AppData\\Roaming\\Spotify\\Spotify.exe',
        launchType: 'executable',
        aliases: ['spotify app'],
      },
    ], { provider: 'windows-fallback', replaceProvider: true });

    expect(catalog.getAppByKey('spotify')).toEqual(expect.objectContaining({
      key: 'spotify',
      name: 'Spotify',
      launchType: 'executable',
    }));

    for (let index = 0; index < 3; index += 1) {
      catalog.recordResolverDecision({
        input: 'music',
        resolvedKey: 'spotify',
        strategy: 'rank_auto',
        confidence: 0.95,
        matchedInput: 'spotify',
        trigger: 'voice',
      });
    }

    expect(catalog.getAliasMap().music).toBe('spotify');
  });
});
