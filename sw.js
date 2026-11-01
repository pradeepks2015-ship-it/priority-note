// Service worker: lets the app open without internet.
// Pages load from the network first (so updates show up), with the saved copy as a fallback.
const CACHE = 'priority-note-v2';
// Map tiles you have looked at (OpenStreetMap only), so the map also shows without internet. Kept across updates.
const TILES = 'pn-tiles';
const TILE_MAX = 3000;
const isTile = (u) => u.hostname === 'tile.openstreetmap.org';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './lib/leaflet/leaflet.js', './lib/leaflet/leaflet.css'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== TILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Tiles: the network first (fresh, and as the tile policy asks), the saved copy only when that fails.
  if (isTile(url)) {
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(TILES).then((c) => c.put(req.url, copy)).then(trimTiles); } return res; })
      .catch(() => caches.match(req.url, { cacheName: TILES }).then((hit) => hit || Response.error())));
    return;
  }
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !isFont) return;
  // Always ask the network for the version number, so the app can spot an update.
  if (url.pathname.endsWith('/version.json')) return;

  if (req.mode === 'navigate') {
    // 'no-cache' makes the browser check with the server every time, so a new version shows at once
    // (GitHub Pages otherwise lets the browser reuse the old page for up to 10 minutes).
    e.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});

// Oldest tiles go first once there are more than TILE_MAX (checked now and then, not on every tile).
let puts = 0;
function trimTiles() {
  if (++puts % 50) return;
  caches.open(TILES).then((c) => c.keys().then((k) => Promise.all(k.slice(0, Math.max(0, k.length - TILE_MAX)).map((r) => c.delete(r)))));
}

// "📥 गाँव का नक्शा फ़ोन में रखें": the page sends the village's tile addresses (zoom 13–16, at most 150);
// fetched two at a time with a pause, skipping ones already saved, with progress back to the page.
self.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.type !== 'tiles' || !Array.isArray(m.urls)) return;
  const urls = m.urls.filter((u) => { try { return isTile(new URL(u)); } catch (_) { return false; } }).slice(0, 150);
  const src = e.source;
  e.waitUntil(caches.open(TILES).then(async (c) => {
    let ok = 0;
    for (let i = 0; i < urls.length; i += 2) {
      await Promise.all(urls.slice(i, i + 2).map(async (u) => {
        try {
          if (!(await c.match(u))) { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await c.put(u, r); else return; }
          ok++;
        } catch (_) { /* skip a tile that does not come */ }
      }));
      const n = Math.min(urls.length, i + 2);
      if (src) src.postMessage({ type: 'tiles', n, of: urls.length });
      await new Promise((r) => { setTimeout(r, 150); });
    }
    if (src) src.postMessage({ type: 'tiles', done: true, ok });
  }));
});

// Hourly reminder sent by .github/workflows/remind.yml (data-only message: {title, body}).
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (_) {}
  const n = m.data || m.notification || {};
  e.waitUntil(self.registration.showNotification(n.title || 'प्राथमिकता नोट', {
    body: n.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
    tag: 'pn-hourly', renotify: true, data: { url: './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    return open ? open.focus() : self.clients.openWindow('./');
  }));
});
