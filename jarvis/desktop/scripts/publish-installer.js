const fs = require('node:fs');
const path = require('node:path');

const distDir = path.join(__dirname, '..', 'dist');
const publicDir = path.join(__dirname, '..', '..', '..', 'public', 'jarvis');

fs.mkdirSync(publicDir, { recursive: true });

const arches = ['x64', 'arm64'];
let published = 0;

for (const arch of arches) {
  const source = path.join(distDir, `JarvisSetup-${arch}.exe`);
  const destination = path.join(publicDir, `JarvisSetup-${arch}.exe`);

  if (!fs.existsSync(source)) {
    console.warn(`Skipping missing installer: ${source}`);
    continue;
  }

  fs.copyFileSync(source, destination);
  console.log(`Published installer to ${destination}`);
  published++;
}

if (published === 0) {
  console.error('No installers found in dist/. Run `npm run dist:win:all` first.');
  process.exit(1);
}
