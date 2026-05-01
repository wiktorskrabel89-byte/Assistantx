self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  self.clients.claim();
});

self.addEventListener('fetch', () => {
  // Możesz dodać cache lub inne strategie
});
