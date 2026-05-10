export type DeviceType = "phone" | "pc";

export type PairingStatus = "none" | "pending" | "paired";

export type PairingStatusResponse = {
  status: PairingStatus;
  code?: string | null;
  expiresAt?: string | null;
  pairedAt?: string | null;
  initiatorDevice?: DeviceType | null;
};

export const DEVICE_PAIRING_CODE_LENGTH = 6;
export const DEVICE_PAIRING_TTL_MINUTES = 10;
export const DEVICE_PAIRING_TTL_MS = DEVICE_PAIRING_TTL_MINUTES * 60 * 1000;
export const DEVICE_PAIRING_SKIP_KEY = "assistantx:pairing_skipped";
export const DEVICE_PAIRING_CODE_PATTERN = /^[A-Z0-9]{6}$/;

export function normalizePairingCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidPairingCode(value: string): boolean {
  return DEVICE_PAIRING_CODE_PATTERN.test(normalizePairingCode(value));
}
