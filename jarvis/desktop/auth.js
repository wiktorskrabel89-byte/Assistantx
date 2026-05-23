'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'JarvisDesktop');
const TOKEN_PATH = path.join(BASE_DIR, 'device-token');

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function ensureBaseDir() {
  fs.mkdirSync(BASE_DIR, { recursive: true });
}

function getToken() {
  ensureBaseDir();
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const token = fs.readFileSync(TOKEN_PATH, 'utf-8').trim();
      if (token) return token;
    }
  } catch {
    // ignore read errors and regenerate token
  }
  const token = generateToken();
  fs.writeFileSync(TOKEN_PATH, token, { encoding: 'utf-8', mode: 0o600 });
  return token;
}

function getSupabaseAuthConfig() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const supabasePublishableKey = String(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      || process.env.SUPABASE_ANON_KEY
      || '',
  ).trim();

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Supabase client is not configured.');
  }

  return { supabaseUrl, supabasePublishableKey };
}

async function handleLogin(username, password) {
  let authConfig;
  try {
    authConfig = getSupabaseAuthConfig();
  } catch (error) {
    console.error('Login failed:', error?.message || error);
    return false;
  }

  let response;
  try {
    response = await fetch(`${authConfig.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: authConfig.supabasePublishableKey,
        Authorization: `Bearer ${authConfig.supabasePublishableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: String(username || '').trim(),
        password,
      }),
    });
  } catch (error) {
    console.error('Network or auth error:', error?.message || error);
    return false;
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok || !data?.user || data?.error) {
    console.error('Login failed:', data?.error_description || data?.error || response.statusText || 'Unknown error');
    return false;
  }

  if (typeof window !== 'undefined') {
    window.location.href = '/dashboard';
  }

  return true;
}

module.exports = {
  generateToken,
  handleLogin,
  getToken,
};
