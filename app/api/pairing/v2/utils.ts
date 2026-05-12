import { createHash, randomInt } from "node:crypto";

export type PairingV2DevicePlatform = "android" | "desktop" | "web" | "server";
export type PairingV2DeviceRole = "control" | "runtime" | "operator";

export type PairingV2DevicePayload = {
  platform: PairingV2DevicePlatform;
  role: PairingV2DeviceRole;
  label?: string;
  fingerprint?: string;
  metadata?: Record<string, unknown>;
};

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAIRING_CODE_LENGTH = 7;

export function isPairingV2DevicePayload(value: unknown): value is PairingV2DevicePayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  if (
    payload.platform !== "android"
    && payload.platform !== "desktop"
    && payload.platform !== "web"
    && payload.platform !== "server"
  ) {
    return false;
  }
  if (
    payload.role !== "control"
    && payload.role !== "runtime"
    && payload.role !== "operator"
  ) {
    return false;
  }
  if (payload.label !== undefined && typeof payload.label !== "string") return false;
  if (payload.fingerprint !== undefined && typeof payload.fingerprint !== "string") return false;
  if (payload.metadata !== undefined && (typeof payload.metadata !== "object" || Array.isArray(payload.metadata))) return false;
  return true;
}

export function createPairingV2Code(): string {
  const suffix = Array.from({ length: PAIRING_CODE_LENGTH }, () => {
    const index = randomInt(0, PAIRING_ALPHABET.length);
    return PAIRING_ALPHABET[index];
  }).join("");
  return `AX-${suffix}`;
}

export function normalizePairingV2Code(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidPairingV2Code(input: string): boolean {
  return /^AX-[A-Z0-9]{7}$/.test(normalizePairingV2Code(input));
}

export function normalizeFingerprint(input?: string | null): string | null {
  if (!input) return null;
  const normalized = input.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

