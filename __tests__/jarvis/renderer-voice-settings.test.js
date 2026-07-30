const fs = require('node:fs');
const path = require('node:path');

describe('renderer voice settings wiring', () => {
  it('forwards the user STT setting to the sidecar instead of forcing STT off', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'jarvis/desktop/renderer.js'), 'utf8');

    expect(source).not.toMatch(/sttEnabled:\s*false/);
    expect(source.match(/sttEnabled:\s*Boolean\(voiceSettings\.sttEnabled\)/g)).toHaveLength(2);
  });
});
