// Caches the Cantonese app so it works offline after one visit.
// Strategy: audio (audio/...mp3) is cache-first and is cached the first time it is played (full 200 responses only).
// Audio lives in its own unversioned cache (AUDIO), so bumping VERSION never throws the learner's clips away.
// Everything else (shell, scripts, data) is NETWORK-FIRST: fetch, store a copy, return it. If the network fails, or
// has not answered within NET_MS while a cached copy exists, the cached copy is used and the fetch still updates the
// cache in the background. So an update reaches an installed app on the next online visit. Bump VERSION on big changes.
const VERSION = "jiesuo-yue-v13";
const AUDIO = "jiesuo-yue-audio-v1"; // never matched by the shell-cache cleanup below
const NET_MS = 3000;
const FILES = ["./", "index.html", "yue.css", "../style.css", "../journey.js", "../tone.js",
  "jyutping.js", "tones.js", "drills.js", "state.js", "lexicon.js", "course.js", "lesson.js", "audio.js", "speak.js", "speech.js", "wordlesson.js", "today.js", "sounds.js", "type.js", "read.js", "search.js", "map.js", "app.js",
  "data/stage0.json", "data/audio.json", "data/readings.json", "data/tonecheck.json",
  "data/lexicon.json", "data/course.json", "data/sentences.json", "data/hkcancor.json", "data/wordshk.json", "data/keyboards.json",
  "manifest.webmanifest", "icons/favicon-32.png", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
  "licences/", "licences/Jiesuo-LICENSE.txt", "licences/Cantone-LICENSE.txt", "licences/rime-cantonese-LICENSE-CC-BY.txt",
  "licences/HKCanCor-LICENSE.txt", "licences/NotoSerifHK-OFL.txt",
  "licences/tatoeba-NOTICE.txt", "licences/wordshk-NOTICE.txt"];
const isAudio = (url) => /\/audio\/.+\.mp3$/.test(new URL(url).pathname);
const SHELL_CACHE = /^jiesuo-yue-v\d+$/; // shell caches only: "jiesuo-yue-audio-v1" does not match

self.addEventListener("install", (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));

// Move any clips an old shell cache still holds into AUDIO, then delete only this app's old shell caches
// (never the audio cache, never the Mandarin app's).
async function keepAudio(name) {
  const old = await caches.open(name), audio = await caches.open(AUDIO);
  for (const req of await old.keys()) {
    if (!isAudio(req.url) || (await audio.match(req))) continue;
    const res = await old.match(req);
    if (res) await audio.put(req, res).catch(() => {});
  }
}
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys
  .filter((k) => SHELL_CACHE.test(k) && k !== VERSION)
  .map((k) => keepAudio(k).catch(() => {}).then(() => caches.delete(k))))).then(() => self.clients.claim())));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (isAudio(req.url)) { // cache-first
    e.respondWith(caches.open(AUDIO).then((cache) => cache.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.status === 200) cache.put(req, res.clone()).catch(() => {});
      return res;
    }))));
    return;
  }
  // network-first for everything else, with a NET_MS head start before a cached copy is served
  const nav = req.mode === "navigate";
  const net = (nav ? fetch(req.url, { cache: "no-cache", credentials: "same-origin" }) : fetch(req, { cache: "no-cache" })).then((res) => {
    if (res.status === 200) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {}); }
    return res;
  });
  e.waitUntil(net.then(() => {}, () => {})); // the cache update finishes even when the cached copy was served
  const cached = () => caches.open(VERSION).then((cache) => cache.match(req).then((hit) => hit || (nav ? cache.match("./").then((r) => r || cache.match("index.html")) : undefined)));
  e.respondWith((async () => {
    let timer;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve("late"), NET_MS); });
    const first = await Promise.race([net.catch(() => "offline"), late]);
    clearTimeout(timer);
    if (first !== "late" && first !== "offline") return first;
    const hit = await cached();
    if (hit) return hit;
    if (first === "offline") return Response.error();
    try { return await net; } catch (err) { return Response.error(); } // slow, nothing cached: wait for the network
  })());
});
