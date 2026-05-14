const { rankApps } = require('../../jarvis/desktop/launcher/matcher');
const { classifyLaunchRisk } = require('../../jarvis/desktop/launcher/launch-service');

describe('jarvis launcher matcher and safety', () => {
  const apps = [
    {
      key: 'spotify',
      name: 'Spotify',
      aliases: ['music'],
      sourceProvider: 'everything',
      launchCount: 12,
      launchType: 'executable',
      metadata: { usageHours: {} },
    },
    {
      key: 'discord',
      name: 'Discord',
      aliases: ['chat'],
      sourceProvider: 'windows-fallback',
      launchCount: 1,
      launchType: 'executable',
      metadata: { usageHours: {} },
    },
  ];

  it('boosts exact/alias matches with usage history', () => {
    const ranking = rankApps('music', apps);

    expect(ranking.status).toBe('auto');
    expect(ranking.best.app.key).toBe('spotify');
    expect(ranking.best.reasons).toContain('alias-match');
  });

  it('classifies protected and script launches for confirmation', () => {
    expect(classifyLaunchRisk({
      key: 'powershell',
      name: 'PowerShell',
      launchTarget: 'powershell',
      launchType: 'shell',
    }).level).toBe('protected');

    expect(classifyLaunchRisk({
      key: 'build script',
      name: 'Build Script',
      launchTarget: 'C:\\tools\\deploy.ps1',
      launchType: 'executable',
    }).level).toBe('script');
  });
});
