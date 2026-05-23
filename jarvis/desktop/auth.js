function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function handleLogin(username, password) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.signInWithPassword({
    email: username,
    password: password
  });

  if (error || !user) {
    console.error('Login failed:', error);
    return false;
  }

  // Redirect to the main page after successful login
  window.location.href = '/dashboard';
  return true;
}

function deleteLegacyTokenSync() {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
    }
  } catch {
    // ignore cleanup errors
  }
}
