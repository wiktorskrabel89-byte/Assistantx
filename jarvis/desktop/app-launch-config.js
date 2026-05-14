const APP_OPEN_MAP = {
  chrome: 'chrome',
  firefox: 'firefox',
  edge: 'msedge',
  notepad: 'notepad',
  // Protocol handlers are listed first so Windows uses the registered URI scheme
  // immediately, avoiding the "Windows cannot find '<name>'" error dialog that
  // appears when trying a plain executable name that isn't on PATH.
  roblox: ['roblox-player:', 'roblox:', 'roblox'],
  spotify: ['spotify:', 'spotify'],
  discord: ['discord:', 'discord'],
  steam: ['steam://open/main', 'steam'],
  explorer: 'explorer',
  calc: 'calc',
  calculator: 'calc',
  cmd: 'cmd',
  powershell: 'powershell',
  taskmgr: 'taskmgr',
  paint: 'mspaint',
  vlc: 'vlc',
  word: 'winword',
  excel: 'excel',
  powerpoint: 'powerpnt',
  teams: ['ms-teams:', 'msteams:', 'msteams'],
  zoom: ['zoommtg:', 'zoom'],
  vscode: 'code',
  notepadpp: 'notepad++',
};

const APP_OPEN_MAP_DARWIN = {
  chrome: 'Google Chrome',
  firefox: 'Firefox',
  safari: 'Safari',
  edge: 'Microsoft Edge',
  notepad: 'TextEdit',
  roblox: 'Roblox',
  spotify: 'Spotify',
  discord: 'Discord',
  steam: 'Steam',
  explorer: 'Finder',
  calc: 'Calculator',
  calculator: 'Calculator',
  taskmgr: 'Activity Monitor',
  vlc: 'VLC',
  word: 'Microsoft Word',
  excel: 'Microsoft Excel',
  powerpoint: 'Microsoft PowerPoint',
  teams: 'Microsoft Teams',
  zoom: 'zoom.us',
  vscode: 'Visual Studio Code',
};

const APP_CLOSE_MAP = {
  jarvis: 'Jarvis.exe',
  assistantx: 'Jarvis.exe',
  chrome: 'chrome.exe',
  firefox: 'firefox.exe',
  edge: 'msedge.exe',
  notepad: 'notepad.exe',
  discord: 'Discord.exe',
  spotify: 'Spotify.exe',
  teams: 'Teams.exe',
  zoom: 'Zoom.exe',
  vscode: 'Code.exe',
  vlc: 'vlc.exe',
};

const APP_CLOSE_MAP_DARWIN = {
  jarvis: 'Jarvis',
  assistantx: 'Jarvis',
  chrome: 'Google Chrome',
  firefox: 'Firefox',
  safari: 'Safari',
  edge: 'Microsoft Edge',
  discord: 'Discord',
  spotify: 'Spotify',
  teams: 'Microsoft Teams',
  zoom: 'zoom.us',
  vscode: 'Visual Studio Code',
  vlc: 'VLC',
};

module.exports = {
  APP_OPEN_MAP,
  APP_OPEN_MAP_DARWIN,
  APP_CLOSE_MAP,
  APP_CLOSE_MAP_DARWIN,
};
