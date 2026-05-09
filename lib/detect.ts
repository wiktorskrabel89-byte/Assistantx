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

export function isImageRequest(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;

  return /\b(generate|create|draw|make|design)\b.{0,30}\b(image|picture|photo|art|illustration|logo|poster|wallpaper|icon)\b/.test(text)
    || /^\s*\/image\b/.test(text)
    || /\bimage of\b/.test(text)
    || /\bplease.*\b(image|picture|photo)\b/.test(text);
}
