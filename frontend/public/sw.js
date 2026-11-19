/* Aulensia service worker: push notifications when the app is closed, and the app shell kept on the device so a teacher can
   reopen Today with no network (PRD E11). Only the page and its fingerprinted files are cached; /api is never cached here. */
const SHELL = 'aulensia-shell-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('aulensia-shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return; const u = new URL(r.url); if (u.origin !== self.location.origin || u.pathname.startsWith('/api') || u.pathname.startsWith('/uploads')) return;
  if (r.mode === 'navigate') { // newest page when online, the last one seen when not
    e.respondWith(fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(SHELL).then((x) => x.put('/index.html', c)); } return res; }).catch(() => caches.match('/index.html').then((h) => h || Response.error()))); return;
  }
  if (u.pathname.startsWith('/assets/') || /\.(svg|png|woff2?)$/.test(u.pathname)) { // fingerprinted, so a cached copy is never stale
    e.respondWith(caches.match(r).then((h) => h || fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(SHELL).then((x) => x.put(r, c)); } return res; })));
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'Aulensia', body: event.data && event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Aulensia', {
      icon: '/favicon.svg',
      body: data.body || '',
      data: { url: data.url || '/' },
      tag: data.url || undefined,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
      return self.clients.openWindow(url);
    })
  );
});
