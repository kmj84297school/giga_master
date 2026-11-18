/* sw.js — 오프라인에서도 앱이 열리게 하는 서비스 워커 (tools/build_site.py가 만든다)
   네트워크 우선: 인터넷이 되면 항상 최신 파일을 받고, 안 되면 마지막에 받아 둔 파일로 연다. */
var VERSION = 'giga-bb61b990ed';
var SHELL = ["./", "./index.html", "./web/app.js", "./web/figures.js", "./data/items.json", "./data/questions.json", "./data/units.json", "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-192.png"];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(VERSION)
    .then(function (cache) { return cache.addAll(SHELL); })
    .then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys()
    .then(function (keys) { return Promise.all(keys.map(function (k) { return k === VERSION ? null : caches.delete(k); })); })
    .then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, {ignoreSearch: true}).then(function (hit) { return hit || caches.match('./index.html'); });
  }));
});
