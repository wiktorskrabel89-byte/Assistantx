'use strict';

const { decideRoute } = require('../../jarvis/desktop/electron/ai/router/policy');
const { analyzeRequest, classifyIntent } = require('../../jarvis/desktop/electron/ai/router/analyzer');

const DISPATCH = {
  chat: 'gemma3:4b',
  code: 'qwen2.5-coder:7b',
  code_heavy: 'qwen2.5-coder:14b',
  reasoning: 'deepseek-r1:8b',
  router: 'qwen2.5:1.5b',
  vision: 'moondream2:1.4b',
};

const LOCAL_OK = { ollama_available: true, required_models_present: true };

function baseAnalysis(overrides = {}) {
  return {
    intent: 'chat',
    intentConfidence: 0.8,
    confidence: 0.8,
    retryCount: 0,
    contextSize: 'small',
    codingDepth: 'basic',
    complexity: 'simple',
    codingHeavy: false,
    hasImage: false,
    secondaryIntent: null,
    priority: 50,
    ...overrides,
  };
}

describe('ai router policy — multi-model dispatch', () => {
  it('routes casual conversation to the general chat model', () => {
    const route = decideRoute(baseAnalysis(), { availability: LOCAL_OK, dispatch: DISPATCH });
    expect(route.provider).toBe('ollama');
    expect(route.model).toBe('gemma3:4b');
    expect(route.lane).toBe('chat');
  });

  it('routes standard coding tasks to the coder model', () => {
    const route = decideRoute(baseAnalysis({ intent: 'code' }), { availability: LOCAL_OK, dispatch: DISPATCH });
    expect(route.model).toBe('qwen2.5-coder:7b');
    expect(route.lane).toBe('code');
    expect(route.gpuAffinity).toBe('gpu0');
  });

  it('escalates heavy coding to the extended coder tier', () => {
    const route = decideRoute(
      baseAnalysis({ intent: 'code', codingHeavy: true }),
      { availability: LOCAL_OK, dispatch: DISPATCH },
    );
    expect(route.model).toBe('qwen2.5-coder:14b');
    expect(route.lane).toBe('code_heavy');
  });

  it('routes reasoning intent to the reasoning model', () => {
    const route = decideRoute(
      baseAnalysis({ intent: 'reasoning' }),
      { availability: LOCAL_OK, dispatch: DISPATCH },
    );
    expect(route.model).toBe('deepseek-r1:8b');
    expect(route.lane).toBe('reasoning');
  });

  it('escalates complex chat to the reasoning tier', () => {
    const route = decideRoute(
      baseAnalysis({ complexity: 'hard' }),
      { availability: LOCAL_OK, dispatch: DISPATCH },
    );
    expect(route.lane).toBe('reasoning');
    expect(route.model).toBe('deepseek-r1:8b');
  });

  it('routes vision intent to the vision model', () => {
    const route = decideRoute(
      baseAnalysis({ intent: 'vision', hasImage: true, secondaryIntent: 'vision' }),
      { availability: LOCAL_OK, dispatch: DISPATCH },
    );
    expect(route.model).toBe('moondream2:1.4b');
    expect(route.lane).toBe('vision');
    expect(route.relay).toBeNull();
  });

  it('flags vision+code requests for the vision→coder relay', () => {
    const route = decideRoute(
      baseAnalysis({ intent: 'vision', hasImage: true, secondaryIntent: 'code' }),
      { availability: LOCAL_OK, dispatch: DISPATCH },
    );
    expect(route.model).toBe('moondream2:1.4b');
    expect(route.relay).toEqual({ intent: 'code', model: 'qwen2.5-coder:7b', slot: 'code' });
  });

  it('flags vision+conversation requests for the vision→chat relay', () => {
    const route = decideRoute(
      baseAnalysis({ intent: 'vision', hasImage: true, secondaryIntent: 'chat' }),
      { availability: LOCAL_OK, dispatch: DISPATCH },
    );
    expect(route.relay).toEqual({ intent: 'chat', model: 'gemma3:4b', slot: 'chat' });
  });

  it('falls down the slot chain when the preferred model is not installed', () => {
    const route = decideRoute(
      baseAnalysis({ intent: 'code', codingHeavy: true }),
      {
        availability: { ...LOCAL_OK, installed_models: ['gemma3:4b', 'qwen2.5-coder:7b'] },
        dispatch: DISPATCH,
      },
    );
    // code_heavy model missing → standard coder instead.
    expect(route.model).toBe('qwen2.5-coder:7b');
    expect(route.lane).toBe('code');
  });

  it('uses a cloud vision model instead of a blind text model when no local vision model exists', () => {
    const route = decideRoute(
      baseAnalysis({ intent: 'vision', hasImage: true, secondaryIntent: 'vision' }),
      {
        availability: {
          ...LOCAL_OK,
          installed_models: ['gemma3:4b'],
          cloud: { providers: { groq: { ready: true } } },
        },
        dispatch: DISPATCH,
        cloudProviderOrder: ['groq'],
      },
    );
    expect(route.provider).toBe('groq');
    expect(route.model).toBe('llama-3.2-90b-vision-preview');
  });

  it('falls back to a cloud reasoning model when local runtime is unavailable', () => {
    const route = decideRoute(
      baseAnalysis({ intent: 'reasoning' }),
      {
        availability: { ollama_available: false, cloud: { providers: { groq: { ready: true } } } },
        cloudProviderOrder: ['groq', 'openrouter'],
        dispatch: DISPATCH,
      },
    );
    expect(route.provider).toBe('groq');
    expect(route.model).toBe('deepseek-r1-distill-llama-70b');
    expect(route.reason).toContain('cloud-fallback-intent-reasoning');
  });
});

describe('ai router analyzer — intent classification', () => {
  it('classifies casual conversation as chat', () => {
    expect(classifyIntent('how was your day?').intent).toBe('chat');
  });

  it('classifies coding requests as code', () => {
    expect(classifyIntent('refactor this typescript function to be async').intent).toBe('code');
  });

  it('classifies deep research as reasoning', () => {
    expect(classifyIntent('do a deep dive and compare the options with pros and cons').intent).toBe('reasoning');
    expect(classifyIntent('research this topic step by step').intent).toBe('reasoning');
  });

  it('treats attached images as a vision signal even without keywords', () => {
    expect(classifyIntent("what's wrong here?", { hasImage: true }).intent).toBe('vision');
    expect(classifyIntent('', { hasImage: true }).intent).toBe('vision');
  });

  it('marks complex code work as codingHeavy', () => {
    const heavy = analyzeRequest({ message: 'refactor the entire codebase architecture to fix the race condition' });
    expect(heavy.intent).toBe('code');
    expect(heavy.codingHeavy).toBe(true);

    const light = analyzeRequest({ message: 'write a function that adds two numbers' });
    expect(light.intent).toBe('code');
    expect(light.codingHeavy).toBe(false);
  });

  it('computes a secondary intent for image-bearing requests', () => {
    const analysis = analyzeRequest({
      message: 'implement the typescript class shown in this screenshot',
      images: ['base64data'],
    });
    expect(analysis.intent).toBe('vision');
    expect(analysis.secondaryIntent).toBe('code');
    expect(analysis.hasImage).toBe(true);
  });
});
