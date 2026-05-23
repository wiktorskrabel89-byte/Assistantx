'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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

function createSupabaseAuthClient() {
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

  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function handleLogin(username, password) {
  let supabase;
  try {
    supabase = createSupabaseAuthClient();
  } catch (error) {
    console.error('Login failed:', error?.message || error);
    return false;
  }

  const { data: { user } = {}, error } = await supabase.auth.signInWithPassword({
    email: String(username || '').trim(),
    password,
  });

  if (error || !user) {
    console.error('Login failed:', error?.message || error);
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
