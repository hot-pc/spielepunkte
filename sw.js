// Service Worker (Konzept 9 und 11.2)
//
// Die App muss ohne Netz starten, nicht nur weiterlaufen. Deshalb werden
// alle Dateien bei der Installation abgelegt.
//
// WICHTIG bei Aenderungen: VERSION erhoehen, sonst nehmen die Geraete die
// neuen Dateien nicht an. Neue Dateien zusaetzlich in DATEIEN eintragen.

const VERSION = 'v28';
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
  ereignis.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' umgeht den HTTP-Zwischenspeicher des Browsers. Ohne das
    // holt die Installation womoeglich Dateien, die GitHub Pages noch aus
    // seinem eigenen Zwischenspeicher liefert — die neue Fassung enthielte
    // dann alte Dateien.
    await Promise.all(DATEIEN.map(async (datei) => {
      const antwort = await fetch(new Request(datei, { cache: 'reload' }));
      if (antwort && antwort.ok) await cache.put(datei, antwort);
    }));
  })());
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
  if (!ereignis.data) return;
  if (ereignis.data.befehl === 'sofort-uebernehmen') self.skipWaiting();
  // Die App fragt hier nach, welche Fassung tatsächlich ausgeliefert wird.
  if (ereignis.data.befehl === 'version' && ereignis.ports && ereignis.ports[0]) {
    ereignis.ports[0].postMessage({ version: VERSION });
  }
});

self.addEventListener('fetch', (ereignis) => {
  const anfrage = ereignis.request;
  const url = new URL(anfrage.url);

  if (anfrage.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Der Zwischenspeicher gehoert genau zu dieser VERSION und wird waehrend
  // ihrer Laufzeit nicht mehr veraendert. Frueher wurde er im Hintergrund
  // aufgefrischt — dadurch lieferte die App beim naechsten Start die Dateien
  // des vorigen Besuchs aus und hinkte dauerhaft eine Aenderung hinterher.
  ereignis.respondWith(
    caches.match(anfrage, { ignoreSearch: true }).then((treffer) => {
      if (treffer) return treffer;
      return fetch(anfrage).catch(() => caches.match('index.html'));
    })
  );
});
