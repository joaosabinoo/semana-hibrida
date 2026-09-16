/* Service worker: guarda o app para funcionar offline. */
const CACHE = 'semana-hibrida-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800&family=Karla:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap';

// baixa na instalação todas as fontes que o app usa, para nenhuma faltar offline
async function cacheFonts(c) {
  try {
    const res = await fetch(FONT_CSS);
    if (!res.ok) return;
    await c.put(FONT_CSS, res.clone());
    const css = await res.text();
    const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]);
    await Promise.all(urls.map((u) =>
      fetch(u, { mode: 'cors' }).then((r) => (r.ok ? c.put(u, r) : null)).catch(() => null)));
  } catch (e) { /* sem internet na instalação: as fontes entram no cache no próximo uso online */ }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE).then(() => cacheFonts(c)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // fontes: do cache primeiro; baixadas uma vez quando houver internet
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE).then((c) => c.match(req.url, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
        c.put(req, res.clone());
        return res;
      })))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // app: responde do cache na hora e atualiza em segundo plano (nova versão vale na próxima abertura)
  event.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(req, { ignoreSearch: true }).then((hit) => {
        const update = fetch(req).then((res) => {
          if (res && res.ok) c.put(req, res.clone());
          return res;
        }).catch(() => null);
        if (hit) return hit;
        return update.then((res) => res || (req.mode === 'navigate' ? c.match('./index.html') : Response.error()));
      })
    )
  );
});
