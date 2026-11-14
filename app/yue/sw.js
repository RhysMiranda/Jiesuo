// Caches the Cantonese app so it works offline after one visit. Bump VERSION when the shell or data change.
// Audio (audio/…mp3) is never precached: it is cached the first time it is played.
const VERSION = "jiesuo-yue-v1";
const FILES = ["./", "index.html", "yue.css", "../style.css", "../journey.js", "../tone.js",
  "jyutping.js", "tones.js", "drills.js", "state.js", "audio.js", "today.js", "sounds.js", "app.js",
  "data/stage0.json", "data/audio.json", "data/readings.json", "data/tonecheck.json",
  "manifest.webmanifest", "icons/favicon-32.png", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
  "licences/"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
// Delete only this app's own old caches, never the Mandarin app's.
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => /^jiesuo-yue-v\d+$/.test(k) && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.open(VERSION).then((cache) => cache.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.status === 200 || res.type === "opaque") cache.put(e.request, res.clone()).catch(() => {});
    return res;
  }))));
});
