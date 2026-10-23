// App shell cache: network first, cached copy when offline. Data sync is handled by the app itself.
const VERSION = 'cos-v6'
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())) })
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())) })
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || u.origin !== location.origin) return
  const key = e.request.mode === 'navigate' ? '/' : e.request
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(key, copy)) }
    return res
  }).catch(() => caches.match(key).then((r) => r || caches.match('/'))))
})
// Push: morning summary and post-time reminders (sent by the content-push edge function).
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { title: 'Content OS', body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || 'Content OS', {
    body: d.body || '', tag: d.tag || undefined, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url || '#/today' },
  }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const hash = (e.notification.data && e.notification.data.url) || '#/today'
  const target = new URL('/' + hash, self.registration.scope).href
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list[0]
    if (w) return w.navigate ? w.navigate(target).then((c) => (c || w).focus()).catch(() => w.focus()) : w.focus()
    return self.clients.openWindow(target)
  }))
})
