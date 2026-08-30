// Service Worker (Konzept 9 und 11.2)
//
// Die App muss ohne Netz starten, nicht nur weiterlaufen. Deshalb werden
// alle Dateien bei der Installation abgelegt.
//
// WICHTIG bei Aenderungen: VERSION erhoehen, sonst nehmen die Geraete die
// neuen Dateien nicht an. Neue Dateien zusaetzlich in DATEIEN eintragen.

const VERSION = 'v22';
const CACHE = `spielepunkte-${VERSION}`;

const DATEIEN = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'spiele.json',
  'app.js',
  'kern.js',
  'db.js',
  'ui.js',
  'journal.js',
  'projektion.js',
  'regeln.js',
  'kurznamen.js',
  'auswertung.js',
  'partie.js',
  'statistik.js',
  'calavera.js',
  'github.js',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
];

self.addEventListener('install', (ereignis) => {
  ereignis.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(DATEIEN))
  );
});

self.addEventListener('activate', (ereignis) => {
  ereignis.waitUntil(
    caches.keys().then((namen) =>
      Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Uebernahme erst auf ausdrueckliche Anweisung der App, nie still
// waehrend einer laufenden Partie.
self.addEventListener('message', (ereignis) => {
  if (ereignis.data && ereignis.data.befehl === 'sofort-uebernehmen') self.skipWaiting();
});

self.addEventListener('fetch', (ereignis) => {
  const anfrage = ereignis.request;
  const url = new URL(anfrage.url);

  if (anfrage.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  ereignis.respondWith(
    caches.match(anfrage, { ignoreSearch: true }).then((treffer) => {
      if (treffer) {
        // Im Hintergrund auffrischen, damit die naechste Installation
        // aktuelle Dateien hat. Fehler sind ohne Auswirkung.
        fetch(anfrage)
          .then((antwort) => {
            if (antwort && antwort.ok) caches.open(CACHE).then((c) => c.put(anfrage, antwort.clone()));
          })
          .catch(() => {});
        return treffer;
      }
      return fetch(anfrage).catch(() => caches.match('index.html'));
    })
  );
});
