// Caches the app so it works offline after one visit. Bump VERSION when the data changes.
// Stroke files (strokes/*.json) are cached as they are used, and Today prefetches the next few.
const VERSION = "jiesuo-v9";
const FILES = ["./", "index.html", "style.css", "core.js", "journey.js", "today.js", "writer.js", "app.js", "vendor/hanzi-writer.min.js",
  "data/dict.json", "data/parts.json", "data/grammar.json", "data/order.json", "data/hsk.json", "data/sentences.json", "data/stroke-parts.json", "data/pictures.json",
  "manifest.webmanifest", "icons/favicon-32.png", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
  "licences/"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok || res.type === "opaque") {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
    }
    return res;
  })));
});
