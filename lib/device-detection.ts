import type { DeviceType } from "@/lib/device-pairing";

const MOBILE_DEVICE_PATTERN = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i;

export function isMobileDevice(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  return MOBILE_DEVICE_PATTERN.test(userAgent);
}

export function getDeviceType(userAgent?: string): DeviceType {
  return isMobileDevice(userAgent) ? "phone" : "pc";
}
