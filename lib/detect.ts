/**
 * Shared request-type detection helpers.
 * Imported by both the chat API route (server) and useChatTransport (client).
 */

export function isCodeRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;

  if (/```/.test(text)) return true;
  if (/<\/?[a-z][^>]*>/i.test(text)) return true;
  if (/\b(function|class|interface|type|const|let|var|import|export|npm|yarn|pnpm|sql|regex|api|endpoint|typescript|javascript|python|java|c\+\+|c#|golang|rust|debug|bug|refactor|algorithm)\b/i.test(text)) return true;
  if (/\b(write|generate|create|build|fix|optimize|review|explain)\b.{0,30}\b(code|script|query|function|component)\b/i.test(text)) return true;
  if (/^[\s\w]*[{}()[\];=<>/\\]{2,}[\s\w]*$/.test(text)) return true;

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

  return /\b(debug|debugging|refactor|refactoring|architect|architecture|review|security|performance|optimize|optimise|migrate|migration|design pattern|dependency injection|async|concurrency|race condition|memory leak|bottleneck|test coverage|integration test|end.?to.?end|multi.?step|large codebase|legacy code|why (is|does|am|are) (my|this|the))\b/i.test(text)
    || /\b(fix (this |the )?bug|broken|not working|doesn'?t work|error in|exception in|failing test|how (do|can) (i|we|you) (fix|refactor|improve|redesign|migrate|optimise|optimize))\b/i.test(text);
}

export function isImageRequest(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;

  return /\b(generate|create|draw|make|design)\b.{0,30}\b(image|picture|photo|art|illustration|logo|poster|wallpaper|icon)\b/.test(text)
    || /^\s*\/image\b/.test(text)
    || /\bimage of\b/.test(text)
    || /\bplease.*\b(image|picture|photo)\b/.test(text);
}

/**
 * Returns true for messages that require deep analytical or multi-step reasoning:
 * planning, agent design, complex workflows, logic-heavy problems.
 */
export function isHeavyReasoningRequest(message: string): boolean {
  const text = message.trim();
  if (!text) return false;

  return /\b(step.?by.?step|reasoning|think through|analyze|analyse|plan|planning|architect|workflow|agent|pipeline|strategy|logic|deduce|infer|evaluate|complex|hard problem|multi.?step|break down)\b/i.test(text)
    || /\b(how (should|would|do) (i|we|you) (design|build|structure|implement|approach|solve))\b/i.test(text)
    || /\b(pros and cons|trade.?off|compare|contrast|decision|choose between)\b/i.test(text);
}

/**
 * Returns true when the combined message + context is very long (> 6000 chars),
 * making a long-context model like Gemini 2.5 Flash more suitable.
 */
export function isVeryLongContext(message: string, additionalContextLength = 0): boolean {
  return message.length + additionalContextLength > 6000;
}
