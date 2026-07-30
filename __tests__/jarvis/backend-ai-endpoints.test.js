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

describe('jarvis desktop background web search', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('uses headless Playwright for standard web search instead of opening a visible launcher window', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const goto = jest.fn().mockResolvedValue(undefined);
    const evaluate = jest.fn().mockResolvedValue([
      {
        title: 'AssistantX',
        rawHref: '/l/?uddg=https%3A%2F%2Fassistantx.pl%2F',
        snippet: 'AI workspace',
      },
    ]);
    const newPage = jest.fn().mockResolvedValue({ goto, evaluate });
    const launch = jest.fn().mockResolvedValue({ newPage, close });
    const backend = require('../../jarvis/desktop/backend');

    const result = await backend.__test.searchWeb('assistantx', {
      playwright: { chromium: { launch } },
    });

    expect(launch).toHaveBeenCalledWith({ headless: true });
    expect(goto).toHaveBeenCalledWith(
      'https://duckduckgo.com/html/?q=assistantx',
      expect.objectContaining({ waitUntil: 'domcontentloaded' }),
    );
    expect(close).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      category: 'background-automation',
      engine: 'playwright-headless',
      visibleBrowserOpened: false,
      query: 'assistantx',
    }));
    expect(result.results).toEqual([
      expect.objectContaining({
        title: 'AssistantX',
        url: 'https://assistantx.pl/',
        snippet: 'AI workspace',
      }),
    ]);
    expect(result.summary).toContain('Background search results for: assistantx');
  });

  it('keeps Category 1 search non-visible even when Playwright fails', async () => {
    const backend = require('../../jarvis/desktop/backend');

    const result = await backend.__test.searchWeb('assistantx', {
      playwright: {
        chromium: {
          launch: jest.fn().mockRejectedValue(new Error('browser missing')),
        },
      },
    });

    expect(result).toEqual(expect.objectContaining({
      category: 'background-automation',
      engine: 'playwright-headless',
      visibleBrowserOpened: false,
      error: 'browser missing',
    }));
  });
});

describe('jarvis desktop background YouTube search', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('uses headless Playwright for YouTube search instead of opening a visible launcher window', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const goto = jest.fn().mockResolvedValue(undefined);
    const evaluate = jest.fn().mockResolvedValue([
      {
        title: 'AssistantX demo',
        rawHref: '/watch?v=abc123&list=ignored',
        channel: 'AssistantX',
        metadata: '2 days ago | 10K views',
        snippet: 'Demo walkthrough',
      },
    ]);
    const newPage = jest.fn().mockResolvedValue({ goto, evaluate });
    const launch = jest.fn().mockResolvedValue({ newPage, close });
    const backend = require('../../jarvis/desktop/backend');

    const result = await backend.__test.searchYouTube('assistantx demo', {
      playwright: { chromium: { launch } },
    });

    expect(launch).toHaveBeenCalledWith({ headless: true });
    expect(goto).toHaveBeenCalledWith(
      'https://www.youtube.com/results?search_query=assistantx%20demo',
      expect.objectContaining({ waitUntil: 'domcontentloaded' }),
    );
    expect(close).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      category: 'background-automation',
      engine: 'playwright-headless-youtube',
      visibleBrowserOpened: false,
      query: 'assistantx demo',
    }));
    expect(result.results).toEqual([
      expect.objectContaining({
        title: 'AssistantX demo',
        url: 'https://www.youtube.com/watch?v=abc123',
        channel: 'AssistantX',
        metadata: '2 days ago | 10K views',
        snippet: 'Demo walkthrough',
      }),
    ]);
    expect(result.summary).toContain('Background YouTube results for: assistantx demo');
  });

  it('keeps YouTube search non-visible even when Playwright fails', async () => {
    const backend = require('../../jarvis/desktop/backend');

    const result = await backend.__test.searchYouTube('assistantx demo', {
      playwright: {
        chromium: {
          launch: jest.fn().mockRejectedValue(new Error('youtube browser missing')),
        },
      },
    });

    expect(result).toEqual(expect.objectContaining({
      category: 'background-automation',
      engine: 'playwright-headless-youtube',
      visibleBrowserOpened: false,
      error: 'youtube browser missing',
    }));
  });
});
