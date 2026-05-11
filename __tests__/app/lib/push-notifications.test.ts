import {
  ensurePushSubscription,
  isPushSupported,
  registerPushServiceWorker,
  syncPushSubscription,
  urlBase64ToUint8Array,
} from "@/app/lib/push-notifications";

function setupPushEnvironment(options?: {
  permission?: NotificationPermission;
  existingRegistration?: boolean;
  existingSubscription?: boolean;
}) {
  const mockSubscription = {
    endpoint: "https://push.example/subscription",
    toJSON: () => ({
      endpoint: "https://push.example/subscription",
      expirationTime: null,
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    }),
  } as unknown as PushSubscription;

  const mockPushManager = {
    getSubscription: jest.fn().mockResolvedValue(options?.existingSubscription ? mockSubscription : null),
    subscribe: jest.fn().mockResolvedValue(mockSubscription),
  };

  const mockRegistration = {
    pushManager: mockPushManager,
    update: jest.fn().mockResolvedValue(undefined),
  } as unknown as ServiceWorkerRegistration;

  const getRegistration = jest.fn().mockResolvedValue(options?.existingRegistration ? mockRegistration : null);
  const register = jest.fn().mockResolvedValue(mockRegistration);

  Object.defineProperty(window, "PushManager", {
    configurable: true,
    writable: true,
    value: function PushManager() {},
  });

  Object.defineProperty(window, "Notification", {
    configurable: true,
    writable: true,
    value: {
      permission: options?.permission ?? "granted",
      requestPermission: jest.fn().mockResolvedValue(options?.permission ?? "granted"),
    } satisfies Pick<typeof Notification, "permission" | "requestPermission">,
  });

  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    writable: true,
    value: {
      getRegistration,
      register,
    },
  });

  return {
    mockSubscription,
    mockPushManager,
    getRegistration,
    register,
  };
}

describe("push-notifications helpers", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("converts base64-url VAPID keys to Uint8Array", () => {
    const result = urlBase64ToUint8Array("SGVsbG8");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it("detects push support when browser APIs are present", () => {
    setupPushEnvironment();
    expect(isPushSupported()).toBe(true);
  });

  it("reuses existing service worker registration", async () => {
    const env = setupPushEnvironment({ existingRegistration: true });
    const registration = await registerPushServiceWorker();
    expect(registration).toBeTruthy();
    expect(env.register).not.toHaveBeenCalled();
  });

  it("returns registered-no-vapid when permission is granted but VAPID key is missing", async () => {
    setupPushEnvironment();
    const result = await ensurePushSubscription();
    expect(result.state).toBe("registered-no-vapid");
    expect(result.subscription).toBeNull();
  });

  it("subscribes and returns subscribed when VAPID key is provided", async () => {
    const env = setupPushEnvironment();
    const result = await ensurePushSubscription("BEl6Q3NoV0l4eG1lLWtleQ");
    expect(result.state).toBe("subscribed");
    expect(env.mockPushManager.subscribe).toHaveBeenCalled();
    expect(result.subscription).toBeTruthy();
  });

  it("syncs subscription payload to API", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    const env = setupPushEnvironment({ existingSubscription: true });

    const result = await ensurePushSubscription("BEl6Q3NoV0l4eG1lLWtleQ");
    expect(result.subscription).toBeTruthy();

    const synced = await syncPushSubscription(env.mockSubscription);
    expect(synced).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notifications/push-subscriptions",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
