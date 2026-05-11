export type PushSetupState =
  | "unsupported"
  | "permission-default"
  | "permission-denied"
  | "registered-no-vapid"
  | "subscribed"
  | "error";

export type PushSetupResult = {
  state: PushSetupState;
  registration: ServiceWorkerRegistration | null;
  subscription: PushSubscription | null;
  error?: string;
};

export function isPushSupported(): boolean {
  return typeof window !== "undefined"
    && typeof Notification !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function registerPushServiceWorker(scriptUrl = "/service-worker.js"): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register(scriptUrl);
}

export async function ensurePushSubscription(vapidPublicKey?: string | null): Promise<PushSetupResult> {
  if (!isPushSupported()) {
    return { state: "unsupported", registration: null, subscription: null };
  }

  try {
    const registration = await registerPushServiceWorker();
    if (!registration) {
      return { state: "unsupported", registration: null, subscription: null };
    }

    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission === "default") {
        return { state: "permission-default", registration, subscription: null };
      }
      if (permission !== "granted") {
        return { state: "permission-denied", registration, subscription: null };
      }
    } else if (Notification.permission !== "granted") {
      return { state: "permission-denied", registration, subscription: null };
    }

    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      return { state: "subscribed", registration, subscription: existingSubscription };
    }

    const trimmedVapidKey = vapidPublicKey?.trim();
    if (!trimmedVapidKey) {
      return { state: "registered-no-vapid", registration, subscription: null };
    }

    const applicationServerKeyBytes = urlBase64ToUint8Array(trimmedVapidKey);
    const applicationServerKey = applicationServerKeyBytes.buffer.slice(
      applicationServerKeyBytes.byteOffset,
      applicationServerKeyBytes.byteOffset + applicationServerKeyBytes.byteLength,
    ) as ArrayBuffer;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    return { state: "subscribed", registration, subscription };
  } catch (error) {
    return {
      state: "error",
      registration: null,
      subscription: null,
      error: error instanceof Error ? error.message : "Unknown push setup error.",
    };
  }
}

export async function syncPushSubscription(subscription: PushSubscription): Promise<boolean> {
  const response = await fetch("/api/notifications/push-subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  return response.ok;
}
