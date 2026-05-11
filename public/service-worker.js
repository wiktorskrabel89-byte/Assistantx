const CACHE_NAME = "assistantx-static-v1";
const APP_SHELL_ASSETS = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_ASSETS)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.mode !== "navigate") return;

  event.respondWith((async () => {
    try {
      const networkResponse = await fetch(request);
      const cache = await caches.open(CACHE_NAME);
      void cache.put(request, networkResponse.clone());
      return networkResponse;
    } catch {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) return cachedResponse;
      return caches.match("/");
    }
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "AssistantX";
  const options = {
    body: data.body || "Masz nową aktualizację w AssistantX.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: {
      url: data.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil((async () => {
    const clientList = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const matchingClient = clientList.find((client) => client.url.includes(targetUrl));
    if (matchingClient) {
      await matchingClient.focus();
      return;
    }
    await clients.openWindow(targetUrl);
  })());
});
