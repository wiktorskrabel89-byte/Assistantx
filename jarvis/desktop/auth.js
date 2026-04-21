// jarvis/desktop/auth.js
// Prosty szkielet autoryzacji komputera (token)

const fs = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, 'token.txt');

function getToken() {
  if (fs.existsSync(TOKEN_PATH)) {
    return fs.readFileSync(TOKEN_PATH, 'utf-8');
  } else {
    const token = generateToken();
    fs.writeFileSync(TOKEN_PATH, token);
    return token;
  }
}

function generateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

module.exports = { getToken };

// Przykład użycia:
// const { getToken } = require('./auth');
// const token = getToken();
// console.log('Token komputera:', token);
