// IndexedDB. Zwei Speicher:
//   ereignisse -> das append-only Journal dieses Geraets
//   meta       -> Merkfelder (Geraetename, letzter Export/Import, Vorbelegungen)

const DB_NAME = 'spielepunkte';
const DB_VERSION = 1;
let dbPromise = null;

function oeffne() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((fertig, fehler) => {
    const anfrage = indexedDB.open(DB_NAME, DB_VERSION);
    anfrage.onupgradeneeded = () => {
      const db = anfrage.result;
      if (!db.objectStoreNames.contains('ereignisse')) {
        const store = db.createObjectStore('ereignisse', { keyPath: 'id' });
        store.createIndex('zeit', 'zeit');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'schluessel' });
      }
    };
    anfrage.onsuccess = () => fertig(anfrage.result);
    anfrage.onerror = () => fehler(anfrage.error);
  });
  return dbPromise;
}

function alsPromise(anfrage) {
  return new Promise((fertig, fehler) => {
    anfrage.onsuccess = () => fertig(anfrage.result);
    anfrage.onerror = () => fehler(anfrage.error);
  });
}

export async function alleEreignisse() {
  const db = await oeffne();
  const tx = db.transaction('ereignisse', 'readonly');
  return alsPromise(tx.objectStore('ereignisse').getAll());
}

export async function anzahlEreignisse() {
  const db = await oeffne();
  const tx = db.transaction('ereignisse', 'readonly');
  return alsPromise(tx.objectStore('ereignisse').count());
}

/**
 * Ereignisse anhaengen. Bestehende IDs werden nicht ueberschrieben —
 * das Journal ist append-only (Konzept 3.2).
 */
export async function ereignisseAnhaengen(ereignisse) {
  if (!ereignisse.length) return 0;
  const db = await oeffne();
  return new Promise((fertig, fehler) => {
    const tx = db.transaction('ereignisse', 'readwrite');
    const store = tx.objectStore('ereignisse');
    let geschrieben = 0;
    for (const e of ereignisse) {
      const anfrage = store.add(e);
      anfrage.onsuccess = () => { geschrieben++; };
      anfrage.onerror = (ev) => { ev.preventDefault(); }; // ID schon vorhanden
    }
    tx.oncomplete = () => fertig(geschrieben);
    tx.onerror = () => fehler(tx.error);
  });
}

export async function metaLesen(schluessel, ersatz = null) {
  const db = await oeffne();
  const tx = db.transaction('meta', 'readonly');
  const wert = await alsPromise(tx.objectStore('meta').get(schluessel));
  return wert ? wert.wert : ersatz;
}

export async function metaSchreiben(schluessel, wert) {
  const db = await oeffne();
  const tx = db.transaction('meta', 'readwrite');
  await alsPromise(tx.objectStore('meta').put({ schluessel, wert }));
  return wert;
}

export async function metaAlles() {
  const db = await oeffne();
  const tx = db.transaction('meta', 'readonly');
  const alle = await alsPromise(tx.objectStore('meta').getAll());
  return Object.fromEntries(alle.map((z) => [z.schluessel, z.wert]));
}

/** Dauerhafte Speicherung anfragen, damit Android den Bestand nicht raeumt. */
export async function speicherSichern() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch { /* ohne Auswirkung */ }
  return false;
}
