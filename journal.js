// Journal: Aufbau der Exportdatei und Zusammenfuehrung beim Import
// (Konzept 3.2 bis 3.5). Reine Funktionen ohne Browserzugriff, damit der
// Datenweg unabhaengig von der Oberflaeche geprueft werden kann.

export const FORMAT_KENNUNG = 'spielepunkte-journal';
export const FORMAT_VERSION = 1;

/** Dateiname mit Zeitstempel: journal_<geraetename>_JJJJMMTT-HHMM.txt
 *
 *  Die Endung ist .txt, nicht .json: Chromium erlaubt beim Datei-Teilen nur
 *  gaengige Audio-, Bild-, Text- und Video-Endungen. Mit .json gibt
 *  navigator.canShare() false zurueck und der Teilen-Dialog erscheint nie.
 *  Der Inhalt ist unveraendert JSON. */
export function dateiname(geraetName, datum = new Date(), endung = 'txt') {
  const z = (n) => String(n).padStart(2, '0');
  const stempel =
    `${datum.getFullYear()}${z(datum.getMonth() + 1)}${z(datum.getDate())}` +
    `-${z(datum.getHours())}${z(datum.getMinutes())}`;
  const name = (geraetName || 'geraet')
    .trim()
    .toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `journal_${name || 'geraet'}_${stempel}.${endung}`;
}

/**
 * Exportpaket bauen. Enthaelt den vollstaendigen dem Geraet bekannten
 * Bestand, also eigene und zuvor importierte Ereignisse (Konzept 3.2).
 */
export function baueExport(ereignisse, geraet) {
  return {
    format: FORMAT_KENNUNG,
    format_version: FORMAT_VERSION,
    erzeugt_am: new Date().toISOString(),
    geraet: { id: geraet.id, name: geraet.name },
    anzahl: ereignisse.length,
    ereignisse,
  };
}

/**
 * Invariante aus Konzept 3.2: Der Bestand darf nie schrumpfen. Ein Export
 * muss mindestens so viele Ereignisse enthalten wie der letzte Export.
 */
export function pruefeInvariante(anzahlJetzt, anzahlLetzterExport) {
  if (!anzahlLetzterExport) return { ok: true };
  if (anzahlJetzt >= anzahlLetzterExport) return { ok: true };
  return {
    ok: false,
    meldung:
      `Der Bestand ist kleiner als beim letzten Export ` +
      `(${anzahlJetzt} statt mindestens ${anzahlLetzterExport} Ereignisse). ` +
      `Der Export wurde angehalten, damit keine gute Datei durch eine ` +
      `unvollstaendige ersetzt wird.`,
  };
}

/**
 * Dateinamen zerlegen: journal_<geraet>_JJJJMMTT-HHMM.txt
 * @returns {{geraet:string, stempel:string}|null}
 */
export function nameZerlegen(name) {
  const treffer = /^journal_(.+)_(\d{8}-\d{4})\.(txt|json)$/i.exec(name || '');
  if (!treffer) return null;
  return { geraet: treffer[1], stempel: treffer[2] };
}

/**
 * Aus einer Ordnerliste die Dateien bestimmen, die gelesen werden müssen.
 *
 * Grundlage: Jede Exportdatei enthält den vollständigen Bestand des
 * schreibenden Geräts. Je Gerät genügt daher die neueste Datei; ältere sind
 * darin enthalten.
 *
 * Absicherung: Ist die neueste Datei eines Geräts kleiner als eine ältere,
 * ist sie womöglich unvollständig — etwa wenn auf dem Gerät der
 * Browserspeicher geleert wurde. In diesem Fall werden alle Dateien dieses
 * Geräts gelesen. Verglichen wird die Dateigröße, das kostet kein Einlesen.
 *
 * @param {Array<{name:string, size:number}>} dateien
 * @returns {{lesen:Array, uebersprungen:Array, fremd:Array}}
 */
export function waehleZuLesende(dateien) {
  const nachGeraet = new Map();
  const fremd = [];

  for (const datei of dateien) {
    const teile = nameZerlegen(datei.name);
    if (!teile) { fremd.push(datei); continue; }
    if (!nachGeraet.has(teile.geraet)) nachGeraet.set(teile.geraet, []);
    nachGeraet.get(teile.geraet).push({ datei, stempel: teile.stempel });
  }

  const lesen = [];
  const uebersprungen = [];

  for (const gruppe of nachGeraet.values()) {
    gruppe.sort((a, b) => (a.stempel < b.stempel ? 1 : a.stempel > b.stempel ? -1 : 0));
    const neueste = gruppe[0];
    const groesste = gruppe.reduce((a, b) => (b.datei.size > a.datei.size ? b : a), neueste);

    if (groesste.datei.size > neueste.datei.size) {
      // Die neueste Datei ist kleiner als eine ältere: der Bestand dieses
      // Geräts ist offenbar zwischenzeitlich geschrumpft. Dann wird nicht
      // geraten, sondern alles gelesen.
      for (const eintrag of gruppe) lesen.push(eintrag.datei);
      continue;
    }

    lesen.push(neueste.datei);
    for (const eintrag of gruppe.slice(1)) uebersprungen.push(eintrag.datei);
  }

  // Dateien mit unbekanntem Namensmuster werden gelesen, nicht verworfen:
  // sie könnten umbenannte Journale oder Sicherungen sein.
  return { lesen: [...lesen, ...fremd], uebersprungen, fremd };
}

/** Ein einzelnes Ereignis auf Plausibilitaet pruefen. */
function ereignisGueltig(e) {
  return (
    e &&
    typeof e.id === 'string' &&
    e.id.length > 0 &&
    typeof e.typ === 'string' &&
    typeof e.zeit === 'string'
  );
}

/**
 * Inhalt einer Importdatei auswerten.
 * @param {object} inhalt geparste JSON-Datei
 * @param {Set<string>} bekannteIds bereits vorhandene Ereignis-IDs
 * @returns {{ok:boolean, meldung?:string, neue:Array, quellen:Object, uebersprungen:number}}
 */
export function lesePaket(inhalt, bekannteIds) {
  if (!inhalt || inhalt.format !== FORMAT_KENNUNG) {
    return {
      ok: false,
      meldung: 'Das ist keine Journaldatei dieser App.',
      neue: [],
      quellen: {},
      uebersprungen: 0,
    };
  }
  if (!Array.isArray(inhalt.ereignisse)) {
    return {
      ok: false,
      meldung: 'Die Datei enthaelt keine Ereignisliste.',
      neue: [],
      quellen: {},
      uebersprungen: 0,
    };
  }

  const neue = [];
  const quellen = {};
  const gesehen = new Set();
  let uebersprungen = 0;
  let ungueltig = 0;

  for (const e of inhalt.ereignisse) {
    if (!ereignisGueltig(e)) {
      ungueltig++;
      continue;
    }
    if (bekannteIds.has(e.id) || gesehen.has(e.id)) {
      uebersprungen++;
      continue;
    }
    gesehen.add(e.id);
    neue.push(e);
    const quelle = e.geraet_name || e.geraet || 'unbekannt';
    quellen[quelle] = (quellen[quelle] || 0) + 1;
  }

  return {
    ok: true,
    neue,
    quellen,
    uebersprungen,
    ungueltig,
    geraet: inhalt.geraet || null,
    erzeugt_am: inhalt.erzeugt_am || null,
  };
}
