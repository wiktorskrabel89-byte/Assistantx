const fs = require('node:fs');
const path = require('node:path');

const source = path.join(__dirname, '..', 'dist', 'JarvisSetup.exe');
const destination = path.join(__dirname, '..', '..', '..', 'public', 'jarvis', 'JarvisSetup.exe');

if (!fs.existsSync(source)) {
  console.error(`Missing installer: ${source}`);
  console.error('Run `npm run dist:win` first to build the Windows installer.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);

console.log(`Published installer to ${destination}`);