// Hilfsprogramm für den Home-Bildschirm.
// Es holt immer zuerst die neueste Version aus dem Internet.
// Nur wenn kein Netz da ist, nimmt es die gespeicherte Kopie.

const CACHE = 'tour-app';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((antwort) => {
        const kopie = antwort.clone();
        caches.open(CACHE).then((c) => c.put(e.request, kopie));
        return antwort;
      })
      .catch(() => caches.match(e.request))
  );
});
