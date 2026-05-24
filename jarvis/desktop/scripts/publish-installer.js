const fs = require('node:fs');
const path = require('node:path');

const distDir = path.join(__dirname, '..', 'dist');
const publicDir = path.join(__dirname, '..', '..', '..', 'public', 'jarvis');

fs.mkdirSync(publicDir, { recursive: true });

const files = fs.existsSync(distDir) ? fs.readdirSync(distDir) : [];
const installers = files.filter((file) => /^JarvisSetup-.*-(x64|arm64)\.exe$/i.test(file));
let published = 0;

for (const installer of installers) {
  const source = path.join(distDir, installer);
  const destination = path.join(publicDir, installer);
  fs.copyFileSync(source, destination);
  console.log(`Published installer to ${destination}`);
  published++;
}

if (published === 0) {
  console.error('No installers found in dist/. Run `npm run dist:win:all` first.');
  process.exit(1);
}
