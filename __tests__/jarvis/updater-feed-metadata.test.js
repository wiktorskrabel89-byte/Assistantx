const crypto = require('crypto');

const {
  buildMetadataSignatureUrl,
  classifyInstallerBlocker,
  classifySignatureDiagnostic,
  classifyUpdateVersionSanity,
  compareSemver,
  exportPublicKeyPem,
  extractLatestFeedMetadata,
  isUserWithinStagedRollout,
  signDetachedMetadata,
  validateLatestFeedMetadata,
  verifyDetachedMetadataSignature,
} = require('../../jarvis/desktop/electron/updater/feed-metadata');

describe('jarvis updater feed metadata helpers', () => {
  it('parses stable feed metadata extras', () => {
    const raw = [
      'version: 1.2.3',
      'channel: stable',
      'path: JarvisSetup-x64.exe',
      'minimumAllowedVersion: 1.2.0',
      'stagingPercentage: 25',
    ].join('\n');

    expect(extractLatestFeedMetadata(raw)).toEqual(expect.objectContaining({
      version: '1.2.3',
      channel: 'stable',
      minimumAllowedVersion: '1.2.0',
      stagingPercentage: 25,
      artifacts: ['JarvisSetup-x64.exe'],
      hasArtifactRef: true,
    }));
  });

  it('validates stable metadata structure and rejects invalid rollout values', () => {
    const invalid = extractLatestFeedMetadata([
      'version: 1.2.3',
      'channel: stable',
      'path: JarvisSetup-x64.exe',
      'stagingPercentage: 101',
    ].join('\n'));

    expect(validateLatestFeedMetadata({ metadata: invalid, runtimeChannel: 'stable' })).toEqual(expect.objectContaining({
      ok: false,
      reason: 'feed-rollout-invalid',
    }));
  });

  it('rejects updates that are not newer or violate minimumAllowedVersion', () => {
    expect(classifyUpdateVersionSanity({
      availableVersion: '1.2.3',
      currentVersion: '1.2.3',
      runtimeChannel: 'stable',
      metadataChannel: 'stable',
      minimumAllowedVersion: '1.2.0',
    })).toEqual(expect.objectContaining({
      ok: false,
      reason: 'feed-version-not-newer',
    }));

    expect(classifyUpdateVersionSanity({
      availableVersion: '1.2.3',
      currentVersion: '1.2.0',
      runtimeChannel: 'stable',
      metadataChannel: 'stable',
      minimumAllowedVersion: '1.2.4',
    })).toEqual(expect.objectContaining({
      ok: false,
      reason: 'feed-version-below-minimum-allowed',
    }));
  });

  it('verifies detached metadata signatures', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const payload = 'version: 1.2.3\npath: JarvisSetup-x64.exe\n';
    const signature = signDetachedMetadata({
      payload,
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    });

    expect(verifyDetachedMetadataSignature({
      payload,
      signature,
      publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    })).toEqual({ ok: true });

    expect(verifyDetachedMetadataSignature({
      payload: `${payload}tampered\n`,
      signature,
      publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    })).toEqual(expect.objectContaining({
      ok: false,
      reason: 'signature-validation-failed',
    }));
  });

  it('accepts escaped, base64 PEM, and DER-encoded key secrets', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const payload = 'version: 2.0.0\npath: JarvisSetup-arm64.exe\n';
    const escapedPrivatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n');
    const base64PublicPem = Buffer.from(publicKey.export({ type: 'spki', format: 'pem' }), 'utf8').toString('base64');
    const base64PrivateDer = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
    const base64PublicDer = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

    const escapedSignature = signDetachedMetadata({ payload, privateKey: escapedPrivatePem });
    const derSignature = signDetachedMetadata({ payload, privateKey: base64PrivateDer });

    expect(verifyDetachedMetadataSignature({
      payload,
      signature: escapedSignature,
      publicKey: base64PublicPem,
    })).toEqual({ ok: true });

    expect(verifyDetachedMetadataSignature({
      payload,
      signature: derSignature,
      publicKey: base64PublicDer,
    })).toEqual({ ok: true });

    expect(exportPublicKeyPem(base64PublicDer)).toContain('BEGIN PUBLIC KEY');
  });

  it('computes deterministic staged rollout eligibility from a stable id', () => {
    const first = isUserWithinStagedRollout({
      stagingPercentage: 50,
      stableId: 'device-token-123',
      version: '1.2.3',
    });
    const second = isUserWithinStagedRollout({
      stagingPercentage: 50,
      stableId: 'device-token-123',
      version: '1.2.3',
    });

    expect(first).toEqual(second);
    expect(typeof first.eligible).toBe('boolean');
    expect(typeof first.bucket).toBe('number');
  });

  it('classifies signature and installer diagnostics', () => {
    expect(classifySignatureDiagnostic('SmartScreen blocked this installer')).toBe('smartscreen-reputation');
    expect(classifySignatureDiagnostic('The installer is unsigned')).toBe('unsigned-installer');
    expect(classifyInstallerBlocker('Access is denied because the file is being used by another process')).toBe('file-lock-detected');
    expect(classifyInstallerBlocker('Installer blocked by antivirus policy')).toBe('security-software-block');
  });

  it('exposes helper utilities used by the runtime', () => {
    expect(buildMetadataSignatureUrl('https://updates.assistantx.pl/stable/latest.yml')).toBe(
      'https://updates.assistantx.pl/stable/latest.yml.sig',
    );
    expect(compareSemver('1.2.4', '1.2.3')).toBe(1);
  });
});
