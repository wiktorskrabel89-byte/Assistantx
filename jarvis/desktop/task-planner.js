const { parseRelativeTime } = require('./electron/temporal/parse-relative-time');

function normalizeText(text) {
  return String(text || '').trim();
}

function createStep(command, payload = {}, label) {
  const COMMAND_INTENT_MAP = {
    openApp: 'open_app',
    closeApp: 'close_app',
    searchWeb: 'search_web',
    searchYouTube: 'search_youtube',
    setAppAlias: 'set_app_alias',
    refreshAppCatalog: 'refresh_app_catalog',
    addReminder: 'add_reminder',
  };
  return {
    command,
    intent: COMMAND_INTENT_MAP[command] || command,
    ...payload,
    label: label || command,
  };
}

function splitPromptIntoSteps(text) {
  return normalizeText(text)
    .split(/\s+(?:and then|then|and|następnie|potem|i)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildFilePath(raw) {
  return String(raw || '')
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

function planSegment(segment, options = {}) {
  const text = normalizeText(segment);
  if (!text) return null;

   const slashMatch = text.match(/^\/([a-z]+)(?:\s+(.+))?$/i);
   if (slashMatch) {
     const slashCommand = slashMatch[1].toLowerCase();
     const slashArgs = (slashMatch[2] || '').trim();
     if (slashCommand === 'open' && slashArgs) return createStep('openApp', { app: slashArgs }, `Open ${slashArgs}`);
     if (slashCommand === 'game' && slashArgs) return createStep('openApp', { app: slashArgs }, `Launch ${slashArgs}`);
     if (slashCommand === 'screenshot') return createStep('screenshot', {}, 'Capture screenshot');
     if (slashCommand === 'sleep') return createStep('sleep', {}, 'Put PC to sleep');
     if (slashCommand === 'os') return createStep('sysinfo', {}, 'Collect system info');
     if (slashCommand === 'file' && slashArgs) return createStep('readFile', { targetPath: buildFilePath(slashArgs) }, `Read file ${buildFilePath(slashArgs)}`);
     if (slashCommand === 'search' && slashArgs) return createStep('searchWeb', { query: slashArgs }, `Search the web for ${slashArgs}`);
     if (slashCommand === 'db' && slashArgs) return createStep('typeText', { text: slashArgs }, 'Insert DB query text');
     if (slashCommand === 'repo') return createStep('listFiles', { targetPath: buildFilePath(slashArgs) }, `List files ${slashArgs ? `in ${buildFilePath(slashArgs)}` : 'in the default folder'}`);
     if (slashCommand === 'index') return createStep('refreshAppCatalog', {}, 'Refresh local catalog');
     if (slashCommand === 'ignore' && slashArgs) return createStep('typeText', { text: slashArgs }, 'Type ignore pattern');
   }

  const favoriteApp = options.favoriteApp;
  const favoriteAwareText = favoriteApp
    ? text.replace(/\b(?:(?:my|moja|moją|moj[aąę]?)\s+)?(?:favorite|ulubion[aey])\s+(app|game|aplikacj[aeę]?|gr[aeę])\b/gi, favoriteApp)
    : text;

  let match = favoriteAwareText.match(/(?:open|launch|start|uruchom|odpal|otw[oó]rz)\s+(?:app\s+)?(.+)/i);
  if (match) return createStep('openApp', { app: match[1].trim() }, `Open ${match[1].trim()}`);

  match = favoriteAwareText.match(/(?:close|zamknij|wy[łl][aą]cz)\s+(.+)/i);
  if (match) return createStep('closeApp', { app: match[1].trim() }, `Close ${match[1].trim()}`);

  match = favoriteAwareText.match(/(?:open\s+(?:site|url)|go to|navigate to|otw[oó]rz\s+stron[ęe]?|przejd[zź]\s+na)\s+(.+)/i);
  if (match) return createStep('openUrl', { url: match[1].trim() }, `Open URL ${match[1].trim()}`);

  match = favoriteAwareText.match(/(?:youtube|yt)\s+(.+)/i);
  if (match) return createStep('searchYouTube', { query: match[1].trim() }, `Search YouTube for ${match[1].trim()}`);

  match = favoriteAwareText.match(/(?:search(?: for)?|find|google|wyszukaj|znajd[zź]|szukaj)\s+(.+)/i);
  if (match) return createStep('searchWeb', { query: match[1].trim() }, `Search the web for ${match[1].trim()}`);

  if (/(?:screenshot|screen shot|zrzut ekranu|poka[zż] ekran|what(?:'s| is)? on (?:my |the )?screen|describe (?:my |the )?screen|look at (?:my |the )?screen|co (?:jest|mam) na ekranie|sprawd[zź].*(?:ekran|widzisz))/i.test(favoriteAwareText)) {
    return createStep('screenshot', {}, 'Capture and describe screen');
  }

  if (/(?:system info|sysinfo|informacje o komputerze|info o systemie)/i.test(favoriteAwareText)) {
    return createStep('sysinfo', {}, 'Collect system info');
  }

  if (/(?:processes|top processes|lista proces[oó]w|okna)/i.test(favoriteAwareText)) {
    return createStep('listProcesses', {}, 'List processes');
  }

  match = favoriteAwareText.match(/(?:list|browse|show|poka[zż]|wylistuj)\s+(?:files|folder|directory|katalog|pliki)(?:\s+(?:in|for|w))?\s*(.*)/i);
  if (match) {
    return createStep('listFiles', { targetPath: buildFilePath(match[1]) }, `List files ${match[1] ? `in ${buildFilePath(match[1])}` : 'in the default folder'}`);
  }

  match = favoriteAwareText.match(/(?:read|show|czytaj|odczytaj)\s+file\s+(.+)/i)
    || favoriteAwareText.match(/(?:czytaj|odczytaj|poka[zż]\s+plik)\s+(.+)/i);
  if (match) return createStep('readFile', { targetPath: buildFilePath(match[1]) }, `Read file ${buildFilePath(match[1])}`);

  match = favoriteAwareText.match(/(?:open|launch|otw[oó]rz)\s+(?:file|folder|path|plik|katalog)\s+(.+)/i);
  if (match) return createStep('openFile', { targetPath: buildFilePath(match[1]) }, `Open path ${buildFilePath(match[1])}`);

  match = favoriteAwareText.match(/(?:type|write|enter|wpisz|napisz)\s+(.+)/i);
  if (match) return createStep('typeText', { text: match[1].trim() }, 'Type provided text');

  match = favoriteAwareText.match(/(?:set volume to|ustaw g[łl]o[sś]no[sś][ćc] na)\s*(\d{1,3})/i);
  if (match) return createStep('setVolume', { level: Number(match[1]) }, `Set volume to ${match[1]}%`);

  if (/(?:volume up|g[łl]o[sś]niej|zwi[eę]ksz g[łl]o[sś]no[sś][ćc])/i.test(favoriteAwareText)) return createStep('volumeUp', {}, 'Increase volume');
  if (/(?:volume down|ciszej|zmniejsz g[łl]o[sś]no[sś][ćc])/i.test(favoriteAwareText)) return createStep('volumeDown', {}, 'Decrease volume');
  if (/(?:mute|wycisz)/i.test(favoriteAwareText)) return createStep('mute', {}, 'Toggle mute');
  if (/(?:lock(?: screen)?|zablokuj)/i.test(favoriteAwareText)) return createStep('lockScreen', {}, 'Lock screen');
  if (/(?:sleep|u[śs]pij)/i.test(favoriteAwareText)) return createStep('sleep', {}, 'Put PC to sleep');
  if (/(?:shutdown|wy[łl][aą]cz komputer)/i.test(favoriteAwareText)) return createStep('shutdown', {}, 'Shutdown PC');
  if (/(?:restart|uruchom ponownie|zrestartuj)/i.test(favoriteAwareText)) return createStep('restart', {}, 'Restart PC');
  if (/(?:cancel shutdown|anuluj wy[łl][aą]czenie)/i.test(favoriteAwareText)) return createStep('cancelShutdown', {}, 'Cancel shutdown');

  match = favoriteAwareText.match(/(?:set|remember|map|alias)\s+(.+?)\s+(?:as|to)\s+(.+)/i)
    || favoriteAwareText.match(/(?:ustaw alias|zapami[eę]taj alias)\s+(.+?)\s+(?:jako|na)\s+(.+)/i);
  if (match) {
    return createStep('setAppAlias', {
      alias: match[1].trim(),
      app: match[2].trim(),
    }, `Set alias ${match[1].trim()} → ${match[2].trim()}`);
  }

  if (/(?:scan|refresh|rescan|rebuild|update)\s+(?:(?:app\s+)?catalog|apps|applications|start menu|app list)/i.test(favoriteAwareText)
    || /(?:przeskanuj|od[śs]wie[zż]|zaktualizuj)\s+(?:aplikacje|menu start|katalog aplikacji)/i.test(favoriteAwareText)) {
    return createStep('refreshAppCatalog', {}, 'Refresh app catalog');
  }

  match = favoriteAwareText.match(/(?:remind me|set reminder|create reminder|przypomnij mi|ustaw przypomnienie)\s+(.+)/i);
  if (match) {
    const reminderInput = match[1].trim();
    const parsed = parseRelativeTime(reminderInput);
    return createStep('addReminder', {
      text: reminderInput,
      temporal: parsed || null,
    }, `Create reminder: ${reminderInput}`);
  }

  return null;
}

function planPrompt(text, options = {}) {
  const steps = [];
  const unmatched = [];
  for (const segment of splitPromptIntoSteps(text)) {
    const step = planSegment(segment, options);
    if (step) steps.push(step);
    else unmatched.push(segment);
  }

  return {
    originalText: normalizeText(text),
    steps,
    unmatched,
    summary: steps.length > 0
      ? steps.map((step) => step.label).join(' → ')
      : 'No executable steps detected',
  };
}

module.exports = {
  createStep,
  planPrompt,
  planSegment,
  splitPromptIntoSteps,
};
