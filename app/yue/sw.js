// Caches the Cantonese app so it works offline after one visit.
// Strategy: audio (audio/...mp3) is cache-first and is cached the first time it is played (full 200 responses only).
// Everything else (shell, scripts, data) is NETWORK-FIRST: fetch, store a copy, return it; only when the network fails
// is the cached copy used. So an update reaches an installed app on the next online visit. Bump VERSION on big changes.
const VERSION = "jiesuo-yue-v3";
const FILES = ["./", "index.html", "yue.css", "../style.css", "../journey.js", "../tone.js",
  "jyutping.js", "tones.js", "drills.js", "state.js", "lesson.js", "audio.js", "speak.js", "today.js", "sounds.js", "app.js",
  "data/stage0.json", "data/audio.json", "data/readings.json", "data/tonecheck.json",
  "manifest.webmanifest", "icons/favicon-32.png", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
  "licences/"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
// Delete only this app's own old caches, never the Mandarin app's.
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => /^jiesuo-yue-v\d+$/.test(k) && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
const isAudio = (url) => /\/audio\/.+\.mp3$/.test(new URL(url).pathname);
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (isAudio(req.url)) { // cache-first
    e.respondWith(caches.open(VERSION).then((cache) => cache.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.status === 200) cache.put(req, res.clone()).catch(() => {});
      return res;
    }))));
    return;
  }
  // network-first for everything else
  e.respondWith(caches.open(VERSION).then((cache) => fetch(req).then((res) => {
    if (res.status === 200) cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => cache.match(req).then((hit) => hit || (req.mode === "navigate" ? cache.match("./").then((r) => r || cache.match("index.html")) : undefined) || Response.error()))));
});
