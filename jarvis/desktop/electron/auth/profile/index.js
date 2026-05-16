'use strict';

const { validateProfile, validateUserSettings } = require('../validators');

let cachedBundle = null;

function setCachedProfile(bundle) {
  cachedBundle = bundle ? {
    profile: bundle.profile || null,
    settings: bundle.settings || null,
    userId: bundle.userId || bundle.profile?.id || bundle.settings?.user_id || null,
    loadedAt: bundle.loadedAt || new Date().toISOString(),
  } : null;
  return cachedBundle;
}

function getCachedProfile() {
  return cachedBundle ? {
    profile: cachedBundle.profile,
    settings: cachedBundle.settings,
    userId: cachedBundle.userId,
    loadedAt: cachedBundle.loadedAt,
  } : null;
}

function clearProfileCache() {
  cachedBundle = null;
}

async function fetchSupabaseRow(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: accessToken,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase profile request failed (${response.status})`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data[0] || null : null;
}

async function fetchProfile(supabaseUrl, accessToken, userId) {
  if (!supabaseUrl || !accessToken || !userId) return null;
  const url = new URL('/rest/v1/profiles', supabaseUrl);
  url.searchParams.set('id', `eq.${userId}`);
  url.searchParams.set('select', 'id,username,avatar_url,display_name,created_at');
  return validateProfile(await fetchSupabaseRow(url, accessToken));
}

async function fetchUserSettings(supabaseUrl, accessToken, userId) {
  if (!supabaseUrl || !accessToken || !userId) return null;
  const url = new URL('/rest/v1/user_settings', supabaseUrl);
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('select', 'user_id,theme,voice_enabled,persona,preferences,updated_at');
  return validateUserSettings(await fetchSupabaseRow(url, accessToken));
}

async function getProfileBundle({ supabaseUrl, accessToken, userId, forceRefresh = false }) {
  if (!forceRefresh && cachedBundle && cachedBundle.userId === userId) {
    return getCachedProfile();
  }
  const [profile, settings] = await Promise.all([
    fetchProfile(supabaseUrl, accessToken, userId),
    fetchUserSettings(supabaseUrl, accessToken, userId),
  ]);
  return setCachedProfile({ profile, settings, userId, loadedAt: new Date().toISOString() });
}

module.exports = {
  clearProfileCache,
  fetchProfile,
  fetchUserSettings,
  getCachedProfile,
  getProfileBundle,
  setCachedProfile,
};
