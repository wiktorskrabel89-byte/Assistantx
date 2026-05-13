const DEFAULT_DEV_WEB_URL = 'http://localhost:3000';
const DEFAULT_PROD_WEB_URL = 'https://www.assistantx.pl';

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/$/, '');
}

function isPackagedDesktopRuntime() {
  const hasElectron = Boolean(process.versions?.electron);
  if (!hasElectron) return false;

  const execPath = String(process.execPath || '').toLowerCase();
  return process.env.NODE_ENV === 'production' || (!process.defaultApp && !execPath.includes('electron'));
}

function getJarvisWebUrl() {
  return trimTrailingSlash(
    process.env.JARVIS_WEB_URL
    || process.env.JARVIS_API_URL
    || (isPackagedDesktopRuntime() ? DEFAULT_PROD_WEB_URL : DEFAULT_DEV_WEB_URL),
  );
}

function getJarvisApiUrl() {
  return trimTrailingSlash(process.env.JARVIS_API_URL || getJarvisWebUrl());
}

module.exports = {
  getJarvisApiUrl,
  getJarvisWebUrl,
  isPackagedDesktopRuntime,
};
