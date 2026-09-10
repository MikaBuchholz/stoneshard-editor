/*
 * Caches the editor's static files so a return visit does not wait on the host for every sprite, panel
 * and icon. GitHub Pages caps caching at ten minutes; this keeps the game images and the hashed bundle
 * until VERSION changes. Bump VERSION after rebuilding the catalogs, since sprites and panels keep their
 * names across rebuilds. Save files never pass through here: they are read from the user's own disk.
 */
const VERSION = "v1";
const CACHE = `stoneshard-editor-${VERSION}`;
const scope = new URL(self.registration.scope).pathname;

/** Files whose content only changes when their name does, or when the catalogs are rebuilt. */
function isImmutable(pathname) {
  const relative = pathname.slice(scope.length);
  return ["assets/", "sprites/", "skills/", "trees/"].some((prefix) => relative.startsWith(prefix)) || relative === "favicon.svg";
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scope)) return;
  event.respondWith(isImmutable(url.pathname) ? cacheFirst(request) : networkFirst(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/** The page and the catalogs: take the network so a deploy shows up, fall back to the cache when offline. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw error;
  }
}
