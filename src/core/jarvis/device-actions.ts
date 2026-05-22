const ROBLOX_GAME_ID_PATTERN = /^\d{1,20}$/;

export const DEFAULT_ROBLOX_GAME_ID = "185655149";

export type DeviceActionType = "launch_roblox";

export type DeviceActionPayload = {
  gameId?: string;
};

export function normalizeRobloxGameId(value: unknown): string {
  const normalized = String(value ?? "").trim();
  return ROBLOX_GAME_ID_PATTERN.test(normalized) ? normalized : DEFAULT_ROBLOX_GAME_ID;
}

export function normalizeDeviceActionPayload(actionType: DeviceActionType, value: unknown): DeviceActionPayload {
  const payload = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (actionType === "launch_roblox") {
    return {
      gameId: normalizeRobloxGameId(payload.gameId ?? payload.game_id),
    };
  }
  return {};
}

export function buildDeviceActionPrompt(actionType: DeviceActionType, payload: DeviceActionPayload): string {
  if (actionType === "launch_roblox") {
    return `Launch Roblox place ${normalizeRobloxGameId(payload.gameId)}`;
  }
  return actionType;
}
