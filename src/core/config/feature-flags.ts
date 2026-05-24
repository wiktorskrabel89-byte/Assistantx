function parseBool(value: string | undefined, fallback = false) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export const FEATURE_FLAGS = {
  wakeV2Enabled: parseBool(process.env.WAKE_V2_ENABLED, false),
  hibernateInterceptEnabled: parseBool(process.env.HIBERNATE_INTERCEPT_ENABLED, false),
  p2pTunnelEnabled: parseBool(process.env.P2P_TUNNEL_ENABLED, false),
  systemActionsBetaEnabled: parseBool(process.env.SYSTEM_ACTIONS_BETA_ENABLED, false),
  rufloEnabled: parseBool(process.env.RUFLO_ENABLED, false),
  rufloTrainingEnabled: parseBool(process.env.RUFLO_TRAINING_ENABLED, false),
};
