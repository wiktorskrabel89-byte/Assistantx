const { planPrompt, planSegment } = require('../../jarvis/desktop/task-planner');

describe('jarvis task planner', () => {
  it('splits multi-step natural language prompts into executable steps', () => {
    const plan = planPrompt('open Roblox and take a screenshot then list files');

    expect(plan.steps).toEqual([
      expect.objectContaining({ command: 'openApp', app: 'Roblox' }),
      expect.objectContaining({ command: 'screenshot' }),
      expect.objectContaining({ command: 'listFiles' }),
    ]);
  });

  it('maps favorite app references when a favorite app is known', () => {
    const step = planSegment('open my favorite app', { favoriteApp: 'discord' });

    expect(step).toEqual(expect.objectContaining({
      command: 'openApp',
      app: 'discord',
    }));
  });

  it('detects file read requests', () => {
    const step = planSegment('read file notes.txt');

    expect(step).toEqual(expect.objectContaining({
      command: 'readFile',
      targetPath: 'notes.txt',
    }));
  });

  it('extracts alias learning commands', () => {
    const step = planSegment('set music as spotify');

    expect(step).toEqual(expect.objectContaining({
      command: 'setAppAlias',
      intent: 'set_app_alias',
      alias: 'music',
      app: 'spotify',
    }));
  });

  it('extracts refresh app catalog commands', () => {
    const step = planSegment('refresh app catalog');

    expect(step).toEqual(expect.objectContaining({
      command: 'refreshAppCatalog',
      intent: 'refresh_app_catalog',
    }));
  });
});
