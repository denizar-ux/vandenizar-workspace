// Vandenizar offline cache. Bump VERSION when deploying a new build.
const VERSION = 'vz-pm-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.endsWith('/version.json')) return; // always ask the network
  // App pages: network first so updates arrive, cache as fallback for offline use.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('./index.html', copy)); return res; }).catch(() => caches.match('./index.html')));
    return;
  }
  // Static assets and the PDF library: cache first.
  if (url.origin === location.origin || url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })));
  }
});
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Vandenizar', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Vandenizar', {
    body: d.body || '', tag: d.tag || undefined, icon: './icon-192.png', badge: './icon-192.png', data: { url: d.url || '#/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const hash = (e.notification.data && e.notification.data.url) || '#/';
  const target = new URL('./' + hash, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list[0];
    if (w) return w.navigate ? w.navigate(target).then((c) => (c || w).focus()).catch(() => w.focus()) : w.focus();
    return self.clients.openWindow(target);
  }));
});
