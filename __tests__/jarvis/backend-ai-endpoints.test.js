describe('jarvis desktop AI endpoint candidates', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('does not include invalid /chat fallback when backend URL is not configured', () => {
    process.env.JARVIS_BACKEND_URL = '';
    process.env.JARVIS_AI_URL = '';

    jest.doMock('../../jarvis/desktop/runtime-config', () => ({
      getJarvisApiUrl: () => 'https://www.assistantx.pl',
    }));

    const backend = require('../../jarvis/desktop/backend');
    const endpoints = backend.getJarvisAiEndpointCandidates();

    expect(endpoints).toContain('https://www.assistantx.pl/api/chat');
    expect(endpoints).not.toContain('/chat');
    expect(endpoints.some((value) => String(value).includes('://undefined'))).toBe(false);
  });

  it('includes legacy /chat fallback only when explicit backend URL is configured', () => {
    process.env.JARVIS_BACKEND_URL = 'ws://127.0.0.1:8000/ws';
    process.env.JARVIS_AI_URL = '';

    jest.doMock('../../jarvis/desktop/runtime-config', () => ({
      getJarvisApiUrl: () => 'https://www.assistantx.pl',
    }));

    const backend = require('../../jarvis/desktop/backend');
    const endpoints = backend.getJarvisAiEndpointCandidates();

    expect(endpoints).toContain('https://www.assistantx.pl/api/chat');
    expect(endpoints).toContain('http://127.0.0.1:8000/chat');
  });
});
