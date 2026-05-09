/**
 * Shared request-type detection helpers.
 * Imported by both the chat API route (server) and useChatTransport (client).
 */

const CODE_FENCE_RE = /```/;
const HTML_TAG_RE = /<\/?[a-z][^>\n]{0,200}>/i;
const CODE_KEYWORDS_RE = /\b(function|class|interface|type|const|let|var|import|export|npm|yarn|pnpm|sql|regex|api|endpoint|typescript|javascript|python|java|c\+\+|c#|golang|rust|debug|bug|refactor|algorithm)\b/i;
const CODE_ACTION_RE = /\b(write|generate|create|build|fix|optimize|review|explain)\b.{0,30}\b(code|script|query|function|component)\b/i;
const CODE_SYMBOL_DENSITY_RE = /^[\s\w]*[{}()[\];=<>/\\]{2,}[\s\w]*$/;

export function isCodeRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;

  if (CODE_FENCE_RE.test(text)) return true;
  if (HTML_TAG_RE.test(text)) return true;
  if (CODE_KEYWORDS_RE.test(text)) return true;
  if (CODE_ACTION_RE.test(text)) return true;
  if (CODE_SYMBOL_DENSITY_RE.test(text)) return true;

  return false;
}

/**
 * Returns true when a coding request is complex enough to warrant high reasoning effort.
 * Complex = debugging, refactoring, architecture, code review, multi-step implementation.
 * Simple = write a small helper, autocomplete, explain a snippet.
 */
export function isComplexCodingRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;

  return COMPLEX_CODING_PATTERNS.some((pattern) => pattern.test(text));
}

export function isImageRequest(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;

  return IMAGE_INTENT.test(text)
    || IMAGE_COMMAND.test(text)
    || IMAGE_OF.test(text)
    || IMAGE_PLEASE.test(text);
}

/**
 * Returns true for messages that require deep analytical or multi-step reasoning:
 * planning, agent design, complex workflows, logic-heavy problems.
 */
export function isHeavyReasoningRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;

  return HEAVY_REASONING_KEYWORDS.test(text)
    || HEAVY_REASONING_HOW.test(text)
    || HEAVY_REASONING_COMPARE.test(text);
}

/**
 * Returns true when the combined message + context is very long (> 6000 chars),
 * making a long-context model like Gemini 2.5 Flash more suitable.
 */
export function isVeryLongContext(message: string, additionalContextLength = 0): boolean {
  return message.length + additionalContextLength > 6000;
}
