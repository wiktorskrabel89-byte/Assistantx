const { resolveAppTarget, similarity } = require('../../jarvis/desktop/app-resolver');

describe('jarvis app resolver', () => {
  const knownOpenMap = {
    spotify: ['spotify', 'spotify:'],
    discord: ['discord', 'discord:'],
    chrome: 'chrome',
  };

  it('resolves exact aliases before other strategies', () => {
    const result = resolveAppTarget('music', {
      aliases: { music: 'spotify' },
      discoveredApps: [],
      knownOpenMap,
    });

    expect(result.status).toBe('resolved');
    expect(result.strategy).toBe('alias_exact');
    expect(result.resolvedKey).toBe('spotify');
    expect(result.candidates[0].value).toBe('spotify');
  });

  it('resolves discovered apps when not in static map', () => {
    const result = resolveAppTarget('obs', {
      aliases: {},
      discoveredApps: [{ key: 'obs', name: 'OBS Studio', launchTarget: 'C:\\Tools\\obs64.exe', launchMode: 'filePath' }],
      knownOpenMap,
    });

    expect(result.status).toBe('resolved');
    expect(result.strategy).toBe('discovered_exact');
    expect(result.candidates[0]).toEqual(expect.objectContaining({
      value: 'C:\\Tools\\obs64.exe',
      launchMode: 'filePath',
    }));
  });

  it('uses fuzzy matching for typos with confidence feedback', () => {
    const result = resolveAppTarget('discrod', {
      aliases: {},
      discoveredApps: [],
      knownOpenMap,
    });

    expect(result.status).toBe('resolved');
    expect(result.strategy).toBe('fuzzy_auto');
    expect(result.resolvedKey).toBe('discord');
    expect(result.feedback).toContain('discrod');
  });

  it('is stricter for remote fuzzy resolution', () => {
    const local = resolveAppTarget('spofity', {
      aliases: {},
      discoveredApps: [],
      knownOpenMap,
      strictRemote: false,
    });
    const remote = resolveAppTarget('spofity', {
      aliases: {},
      discoveredApps: [],
      knownOpenMap,
      strictRemote: true,
    });

    expect(['resolved', 'ambiguous']).toContain(local.status);
    expect(['ambiguous', 'unknown']).toContain(remote.status);
  });

  it('returns suggestions when no confident match exists', () => {
    const result = resolveAppTarget('totally-random-app', {
      aliases: {},
      discoveredApps: [],
      knownOpenMap,
    });

    expect(result.status).toBe('unknown');
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  it('computes bounded string similarity', () => {
    expect(similarity('discord', 'discord')).toBe(1);
    expect(similarity('discord', 'discrod')).toBeGreaterThan(0.6);
    expect(similarity('discord', 'spotify')).toBeLessThan(0.5);
  });
});
