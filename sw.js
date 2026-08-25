// Service Worker (Konzept 9 und 11.2)
//
// Die App muss ohne Netz starten, nicht nur weiterlaufen. Deshalb werden
// alle Dateien bei der Installation abgelegt.
//
// WICHTIG bei Aenderungen: VERSION erhoehen, sonst nehmen die Geraete die
// neuen Dateien nicht an. Neue Dateien zusaetzlich in DATEIEN eintragen.

const VERSION = 'v6';
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

  // Aus einer anderen App (zum Beispiel OneDrive) an diese App geteilte
  // Dateien. Sie werden im Cache abgelegt; die App holt sie beim Start ab.
  if (anfrage.method === 'POST' && url.pathname.endsWith('/share-ziel')) {
    ereignis.respondWith((async () => {
      try {
        const formular = await anfrage.formData();
        const dateien = formular.getAll('journale').filter((d) => d && d.name);
        const cache = await caches.open('geteilte-dateien');
        let nummer = 0;
        for (const datei of dateien) {
          await cache.put(
            new Request(`geteilt-${Date.now()}-${nummer++}`),
            new Response(await datei.text(), { headers: { 'x-dateiname': datei.name } })
          );
        }
        return Response.redirect(`./?geteilt=${dateien.length}`, 303);
      } catch {
        return Response.redirect('./?geteilt=fehler', 303);
      }
    })());
    return;
  }

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
