export const FASTAPI_BRIDGE_STATUS = {
  mode: "compatibility-only",
  frozen: true,
  notes:
    "FastAPI remains temporarily for Jarvis compatibility. New runtime capabilities must be implemented in Node/TypeScript.",
} as const;

export function isFastApiBridgeWriteAllowed() {
  return false;
}

