// Cache do "esqueleto" do app (HTML/CSS/JS) pra abrir mesmo sem internet.
// Não mexe nas chamadas ao Supabase — essas passam direto, e o data.js
// cuida do que fazer quando elas falham (cache local + fila pendente).
var CACHE = "pa-shell-v1";
var ASSETS = [
  "./index.html",
  "./mobile.html",
  "./config.js",
  "./data.js",
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js",
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap"
];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (url) {
        return c.add(url).catch(function () {});
      }));
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  if (req.url.indexOf("supabase.co") !== -1) return; // chamadas ao banco passam direto, sem cache do SW

  e.respondWith(
    caches.match(req).then(function (cached) {
      var atualizado = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copia = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copia); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || atualizado;
    })
  );
});
