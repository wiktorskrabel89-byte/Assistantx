const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'JarvisDesktop');
const TOKEN_PATH = path.join(BASE_DIR, 'token.txt');

function getToken() {
  fs.mkdirSync(BASE_DIR, { recursive: true });

  if (fs.existsSync(TOKEN_PATH)) {
    return fs.readFileSync(TOKEN_PATH, 'utf-8');
  }

  const token = generateToken();
  fs.writeFileSync(TOKEN_PATH, token);
  return token;
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

module.exports = {
  getToken,
  tokenPath: TOKEN_PATH,
};
