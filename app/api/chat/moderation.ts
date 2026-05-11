/** Prompt injection and harmful content patterns to block before sending to the model. */
const BLOCKED_PATTERNS: RegExp[] = [
  /ignore previous instructions/i,
  /system prompt/i,
  /bypass restrictions/i,
  /jailbreak/i,
  /disregard (all|your|previous) (rules|instructions|guidelines)/i,
  /pretend (you are|to be) (an? )?(evil|unethical|unrestricted|uncensored)/i,
  /dan mode/i,
];

export function isModerationBlocked(message: string): boolean {
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(message));
}
