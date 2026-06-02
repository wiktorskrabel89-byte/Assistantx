/**
 * Task Classifier for Jarvis — Intelligent request routing (Path A vs Path B).
 *
 * Analyzes user prompts and attached images to determine optimal execution strategy:
 *   - Path A: Vision-only (fast path for analysis, explanation)
 *   - Path B: Vision → Coder relay (when code generation needed)
 *   - Path C: Text-only (no image, lightweight processing)
 */

const EXECUTION_PATHS = {
  VISION_ONLY: 'vision_only',      // Path A: Vision model only
  VISION_TO_CODER: 'vision_to_coder', // Path B: Vision + Coder relay
  TEXT_ONLY: 'text_only',           // Path C: No image, text model
  UNKNOWN: 'unknown',
};

const CODE_KEYWORDS = new Set([
  'write', 'generate', 'code', 'script', 'function', 'class', 'module',
  'refactor', 'fix', 'debug', 'implement', 'create', 'build', 'design',
  'component', 'develop', 'program', 'coding', 'react', 'html',
  'css', 'javascript', 'typescript', 'rust', 'go', 'java', 'python',
  'api', 'endpoint', 'algorithm', 'data structure', 'database',
]);

const VISION_ONLY_KEYWORDS = new Set([
  'analyze', 'describe', 'explain', 'what is', 'identify', 'recognize',
  'read', 'extract', 'ocr', 'translate', 'summarize', 'understand',
  'diagram', 'chart', 'graph', 'layout', 'design review', 'screenshot',
]);

/**
 * Classify a user request and determine optimal execution path.
 *
 * @param {string} prompt - User's text prompt
 * @param {boolean} hasImage - Whether an image is attached
 * @param {object} [sessionContext] - Optional session state for multi-turn
 * @returns {object} Classification result with execution path and metadata
 */
function classify(prompt, hasImage = false, sessionContext = null) {
  const promptLower = prompt.toLowerCase().trim();

  // Path C: Text-only (no image)
  if (!hasImage) {
    const needsCode = detectCodeIntent(promptLower);
    const path = needsCode ? EXECUTION_PATHS.VISION_TO_CODER : EXECUTION_PATHS.TEXT_ONLY;
    const confidence = needsCode ? 0.85 : 0.90;
    const reasoning = needsCode
      ? 'Text-only request with code generation intent'
      : 'Text-only request for discussion/analysis';

    return {
      path,
      needsVision: false,
      needsCoder: needsCode,
      confidence,
      reasoning,
      models: getModelRequirements(path, needsCode, false),
    };
  }

  // Has image: determine if code generation needed
  const needsCode = detectCodeIntent(promptLower);

  // Path B: Image + code generation (Vision → Coder relay)
  if (needsCode) {
    return {
      path: EXECUTION_PATHS.VISION_TO_CODER,
      needsVision: true,
      needsCoder: true,
      confidence: 0.95,
      reasoning: 'Image present with code generation intent — using Vision→Coder relay',
      models: getModelRequirements(EXECUTION_PATHS.VISION_TO_CODER, true, true),
    };
  }

  // Path A: Image analysis only (Vision model)
  return {
    path: EXECUTION_PATHS.VISION_ONLY,
    needsVision: true,
    needsCoder: false,
    confidence: 0.92,
    reasoning: 'Image present, code not needed — Vision-only path',
    models: getModelRequirements(EXECUTION_PATHS.VISION_ONLY, false, true),
  };
}

/**
 * Detect if prompt intends code generation.
 * @param {string} promptLower - Lowercase prompt text
 * @returns {boolean} Whether code generation is needed
 */
function detectCodeIntent(promptLower) {
  // Direct code keyword match
  const codeKeywordPattern = new RegExp(`\\b(${[...CODE_KEYWORDS].join('|')})\\b`);
  if (codeKeywordPattern.test(promptLower)) {
    return true;
  }

  // Patterns like "make X component", "create a Y function"
  if (/\b(make|create|build|write|generate)\s+(?:a\s+)?(component|function|script|page|app|website)\b/.test(promptLower)) {
    return true;
  }

  // Code file references
  if (/\.(js|jsx|ts|tsx|py|rs|go|java|cpp|c|html|css|json|yaml|xml)(?:\s|$)/.test(promptLower)) {
    return true;
  }

  return false;
}

/**
 * Get model loading requirements based on classification.
 * @param {string} path - Execution path
 * @param {boolean} needsCode - Code generation needed
 * @param {boolean} needsVision - Vision analysis needed
 * @returns {object} Model requirements and alternatives
 */
function getModelRequirements(path, needsCode, needsVision) {
  return {
    visionModel: {
      enabled: needsVision,
      primary: 'gemma-2-2b-vision', // Lightweight, fast
      sizeGb: 2.5,
      alternatives: [
        { name: 'paligemma-2-4b', sizeGb: 4.0 },
        { name: 'qwen2.5-vl-7b', sizeGb: 5.5 },
        { name: 'llama3.2-vision-11b', sizeGb: 8.0 },
      ],
    },
    coderModel: {
      enabled: needsCode,
      primary: 'qwen3-coder-next-32b-q4_k_m', // Best overall for coding
      sizeGb: 18.0,
      alternatives: [
        { name: 'deepseek-coder-v3-distilled-q4_k_m', sizeGb: 12.0, note: 'Fast & reliable' },
        { name: 'qwen3-8b-q4_k_m', sizeGb: 5.0, note: 'Lightweight, still capable' },
        { name: 'phi-4-q4_k_m', sizeGb: 8.5, note: 'Good balance' },
        { name: 'codestral-25.12-q4_k_m', sizeGb: 15.0, note: 'Fast inline completion' },
      ],
    },
  };
}

/**
 * Get human-readable label for execution path.
 * @param {string} path - Execution path constant
 * @returns {string} Human-readable label
 */
function getPathLabel(path) {
  const labels = {
    [EXECUTION_PATHS.VISION_ONLY]: '👁️ Vision Only (Fast)',
    [EXECUTION_PATHS.VISION_TO_CODER]: '🔄 Vision → Code (Full Relay)',
    [EXECUTION_PATHS.TEXT_ONLY]: '💬 Text Only (Lightweight)',
    [EXECUTION_PATHS.UNKNOWN]: '❓ Unknown',
  };
  return labels[path] || labels[EXECUTION_PATHS.UNKNOWN];
}

module.exports = {
  classify,
  detectCodeIntent,
  getModelRequirements,
  getPathLabel,
  EXECUTION_PATHS,
};
