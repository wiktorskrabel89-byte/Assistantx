export type ChatStreamChunk = {
  model?: string;
  token?: string;
  reasoning?: string;
  status?: string;
  routeReason?: string;
};

export type ActiveRequestTarget = {
  workspaceId: string;
  chatId: string;
  queueId: string;
};

export function isAbortLikeError(error: unknown) {
  if (error instanceof DOMException) return error.name === "AbortError";
  if (error instanceof Error) return error.name === "AbortError" || /aborted/i.test(error.message);
  return false;
}