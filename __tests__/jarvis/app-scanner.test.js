const { dedupeApps, normalizeKey, normalizeName } = require('../../jarvis/desktop/app-scanner');

describe('jarvis app scanner helpers', () => {
  it('normalizes names and keys', () => {
    expect(normalizeName('Discord.exe')).toBe('Discord');
    expect(normalizeKey('  Discord-App  ')).toBe('discord app');
  });

  it('deduplicates discovered apps by normalized key', () => {
    const apps = dedupeApps([
      { key: 'Discord', name: 'Discord', launchTarget: 'C:\\Discord\\Discord.exe', launchMode: 'filePath', aliases: ['chat'] },
      { key: 'discord', name: 'Discord.lnk', launchTarget: 'discord:', launchMode: 'start', aliases: ['voice chat'] },
    ]);

    expect(apps).toHaveLength(1);
    expect(apps[0].key).toBe('discord');
    expect(apps[0].launchTarget).toBe('C:\\Discord\\Discord.exe');
    expect(apps[0].aliases).toEqual(expect.arrayContaining(['chat', 'voice chat', 'Discord', 'discord']));
  });
});
