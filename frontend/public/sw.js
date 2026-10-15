/**
 * Service worker for the EEx Iran PWA.
 *
 * Strategy:
 *   - Static build assets  -> cache first (they are content-hashed).
 *   - API GET requests     -> network first, falling back to the last good
 *                             response, so a factory with a flaky 4G link still
 *                             sees its most recent numbers.
 *   - Navigations          -> network first, falling back to the offline page.
 *
 * Only successful (response.ok) responses are ever stored.
 */
// Bumping VERSION deletes every older cache on activate. v1 stored error
// responses and authenticated data, so v2 starts from a clean slate.
const VERSION = "eex-v2";
const STATIC_CACHE = `${VERSION}-static`;
// Invariant: API responses are per user, but the cache key ignores the
// Authorization header. This cache is only safe because the app deletes every
// cache whose name ends in "-data" on login, logout and session expiry (401);
// see clearClientData in src/lib/auth.tsx. Keep the "-data" suffix in sync.
const DATA_CACHE = `${VERSION}-data`;
const PAGE_CACHE = `${VERSION}-pages`;

const PRECACHE = ["/offline.html", "/icons/icon.svg", "/icons/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      /\.(?:woff2?|png|svg|jpg|jpeg|webp|ico)$/.test(url.pathname))
  );
}

/** Network response passthrough that stores a copy only when it is a success. */
function storeIfOk(cacheName, request) {
  return (response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(cacheName).then((cache) => cache.put(request, copy));
    }
    return response;
  };
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then(storeIfOk(STATIC_CACHE, request))),
    );
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    // Auth responses (tokens, the current user) are never stored.
    if (url.pathname.startsWith("/api/v1/auth/")) return;
    event.respondWith(fetch(request).then(storeIfOk(DATA_CACHE, request)).catch(() => caches.match(request)));
    return;
  }

  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then(storeIfOk(PAGE_CACHE, request))
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/offline.html"))),
    );
  }
});
