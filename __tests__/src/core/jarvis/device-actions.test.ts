import {
  buildDeviceActionPrompt,
  DEFAULT_ROBLOX_GAME_ID,
  normalizeDeviceActionPayload,
  normalizeRobloxGameId,
} from "@/src/core/jarvis/device-actions";

describe("device-actions", () => {
  it("falls back to the default Roblox game id for invalid input", () => {
    expect(normalizeRobloxGameId("abc")).toBe(DEFAULT_ROBLOX_GAME_ID);
    expect(normalizeRobloxGameId("")).toBe(DEFAULT_ROBLOX_GAME_ID);
  });

  it("accepts numeric Roblox game ids from either payload shape", () => {
    expect(normalizeDeviceActionPayload("launch_roblox", { gameId: "12345" })).toEqual({ gameId: "12345" });
    expect(normalizeDeviceActionPayload("launch_roblox", { game_id: "999" })).toEqual({ gameId: "999" });
  });

  it("builds a stable prompt for queued device actions", () => {
    expect(buildDeviceActionPrompt("launch_roblox", { gameId: "222" })).toBe("Launch Roblox place 222");
  });
});
