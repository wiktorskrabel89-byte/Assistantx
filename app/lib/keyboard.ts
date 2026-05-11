export function isEditableElementTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT"
    || tag === "TEXTAREA"
    || target.isContentEditable
    || target.contentEditable === "plaintext-only";
}
