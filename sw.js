// Service worker for quickresponse.now (same pattern as orrery.live / i.cant.dance).
//
// Strategy:
//  - Code and navigations: NETWORK-FIRST. Online users always get the freshly
//    deployed files; the cached copy only serves when the network is
//    unavailable. The encoder ships in qrcode.js, so generation works
//    completely offline — which is rather the point for a privacy tool.
//  - Images/icons: CACHE-FIRST.
//  - Cross-origin requests (Google Fonts) are not intercepted — offline, the
//    display fonts fall back to system sans-serif.
//  - Bump CACHE on deploys that change any precached file (activate deletes
//    every other cache version).
const CACHE = 'qrn-v1';
const CORE = [
	'/',
	'/index.html',
	'/styles.css',
	'/app.js',
	'/qrcode.js',
	'/favicon.svg',
	'/manifest.json'
];

self.addEventListener('install', (e) => {
	e.waitUntil(
		caches.open(CACHE)
			.then((c) => c.addAll(CORE))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (e) => {
	e.waitUntil(
		caches.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (e) => {
	const req = e.request;
	if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

	if (req.destination === 'image') {
		e.respondWith(
			caches.open(CACHE).then(async (c) => {
				const hit = await c.match(req);
				if (hit) return hit;
				const res = await fetch(req);
				if (res.ok) c.put(req, res.clone());
				return res;
			})
		);
		return;
	}

	e.respondWith(
		fetch(req)
			.then((res) => {
				if (res.ok) {
					const copy = res.clone();
					caches.open(CACHE).then((c) => c.put(req, copy));
				}
				return res;
			})
			.catch(async () => {
				const hit = await caches.match(req);
				if (hit) return hit;
				if (req.mode === 'navigate') {
					const shell = await caches.match('/index.html');
					if (shell) return shell;
				}
				return Response.error();
			})
	);
});
