// Kern: haelt den Zustand, schreibt ins Journal, steuert die Navigation
// und fuehrt Export und Import aus.

import * as db from './db.js';
import * as gh from './github.js';
import { projiziere } from './projektion.js';
import { baueExport, lesePaket } from './journal.js';
import { abstand, namensform } from './regeln.js';

// Muss mit VERSION in sw.js übereinstimmen. Weicht die Anzeige im
// Datenbereich davon ab, läuft auf dem Gerät noch eine ältere Fassung.
export const APP_VERSION = 'v24';

export const zustand = {
  ereignisse: [],
  ids: new Set(),
  spieler: new Map(),
  partien: new Map(),
  notizen: new Map(),
  spiele: [],
  meta: {},
  geraet: { id: null, name: null },
  ansicht: { name: 'start', p: {} },
};

const ansichten = new Map();
export function registriereAnsicht(name, aufbau) { ansichten.set(name, aufbau); }

// --- Start ---------------------------------------------------------------

export async function starte() {
  zustand.meta = await db.metaAlles();

  if (!zustand.meta.geraet_id) {
    zustand.meta.geraet_id = neueId();
    await db.metaSchreiben('geraet_id', zustand.meta.geraet_id);
  }
  zustand.geraet = { id: zustand.meta.geraet_id, name: zustand.meta.geraet_name || null };

  zustand.spiele = await ladeSpiele();
  zustand.ereignisse = await db.alleEreignisse();
  zustand.ids = new Set(zustand.ereignisse.map((e) => e.id));
  projiziereNeu();
  await db.speicherSichern();
}

async function ladeSpiele() {
  const antwort = await fetch('spiele.json', { cache: 'no-cache' });
  if (!antwort.ok) throw new Error('spiele.json konnte nicht geladen werden.');
  const inhalt = await antwort.json();
  if (!Array.isArray(inhalt.spiele)) throw new Error('spiele.json enthält keine Spieleliste.');
  return inhalt.spiele;
}

function projiziereNeu() {
  const z = projiziere(zustand.ereignisse);
  zustand.spieler = z.spieler;
  zustand.partien = z.partien;
  zustand.notizen = z.notizen;
}

export function neueId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// --- Spieldefinitionen ---------------------------------------------------

/** Je Spiel nur die hoechste Version, alphabetisch fuer die Auswahl. */
export function spieleZurAuswahl() {
  const hoechste = new Map();
  for (const s of zustand.spiele) {
    const vorhanden = hoechste.get(s.id);
    if (!vorhanden || (s.version || 1) > (vorhanden.version || 1)) hoechste.set(s.id, s);
  }
  return [...hoechste.values()].sort((a, b) => a.name.localeCompare(b.name, 'de-DE'));
}

/** Definition zu einer Partie: exakt die Version, mit der gespielt wurde. */
export function definitionFuer(spielId, version) {
  const genau = zustand.spiele.find((s) => s.id === spielId && (s.version || 1) === (version || 1));
  if (genau) return genau;
  const irgendeine = zustand.spiele
    .filter((s) => s.id === spielId)
    .sort((a, b) => (b.version || 1) - (a.version || 1))[0];
  return irgendeine || null;
}

/** Anzeigename eines Spielers. */
export function nameVon(id) {
  const s = zustand.spieler.get(id);
  return s ? s.name : '(unbekannt)';
}

/** Hausregeln und Notizen zu einem Spiel, geräteübergreifend im Journal. */
export function notizFuer(spielId) {
  return zustand.notizen.get(spielId) || null;
}

// --- Journal schreiben ---------------------------------------------------

export async function schreibe(typ, daten) {
  return schreibeMehrere([{ typ, daten }]);
}

export async function schreibeMehrere(liste) {
  const jetzt = new Date();
  const ereignisse = liste.map((eintrag, index) => ({
    id: neueId(),
    geraet: zustand.geraet.id,
    geraet_name: zustand.geraet.name || 'ohne-namen',
    zeit: new Date(jetzt.getTime() + index).toISOString(),
    typ: eintrag.typ,
    daten: eintrag.daten,
  }));
  await db.ereignisseAnhaengen(ereignisse);
  for (const e of ereignisse) {
    zustand.ereignisse.push(e);
    zustand.ids.add(e.id);
  }
  projiziereNeu();
  return ereignisse;
}

export async function merke(schluessel, wert) {
  zustand.meta[schluessel] = wert;
  await db.metaSchreiben(schluessel, wert);
}

// --- Navigation ----------------------------------------------------------

export function navigiere(name, p = {}, ersetzen = false) {
  zustand.ansicht = { name, p };
  const eintrag = { name, p };
  if (ersetzen) history.replaceState(eintrag, '');
  else history.pushState(eintrag, '');
  zeichne();
}

let zuletztGezeichnet = null;

export function zeichne() {
  const aufbau = ansichten.get(zustand.ansicht.name) || ansichten.get('start');
  const wurzel = document.getElementById('app');
  const kennung = `${zustand.ansicht.name}|${JSON.stringify(zustand.ansicht.p || {})}`;
  // Wird dieselbe Ansicht nur aufgefrischt — etwa nach einer Eingabe —,
  // bleibt die Blickposition erhalten. Nur bei einem echten Wechsel wird
  // nach oben gesprungen.
  const gleicheAnsicht = kennung === zuletztGezeichnet;
  const hoehe = window.scrollY;

  wurzel.replaceChildren();
  const inhalt = aufbau(zustand.ansicht.p || {});
  // Ansichten geben bedingte Teile als null zurück. Ohne Filter würde
  // append daraus einen Textknoten mit dem Wort "null" machen.
  const teile = (Array.isArray(inhalt) ? inhalt : [inhalt]).flat(3).filter(Boolean);
  wurzel.append(...teile);
  zuletztGezeichnet = kennung;

  window.scrollTo(0, gleicheAnsicht ? hoehe : 0);
  wachHalten(zustand.ansicht.name === 'erfassung');
}

// --- Bildschirm wach halten ----------------------------------------------

let wachSchloss = null;
let wachBeobachtet = false;

/**
 * Hält den Bildschirm an, solange eine Partie erfasst wird — als würde
 * laufend getippt. Die Einstellung des Geräts wird dabei nicht verändert;
 * die Sperre gilt nur für diese Seite und endet mit ihr.
 */
export async function wachHalten(aktiv) {
  try {
    if (!('wakeLock' in navigator)) return false;

    if (!aktiv) {
      if (wachSchloss) await wachSchloss.release();
      wachSchloss = null;
      return false;
    }
    if (wachSchloss) return true;

    wachSchloss = await navigator.wakeLock.request('screen');
    wachSchloss.addEventListener('release', () => { wachSchloss = null; });

    // Nach einem Wechsel in eine andere App gibt das System die Sperre frei;
    // beim Zurückkommen wird sie neu angefordert.
    if (!wachBeobachtet) {
      wachBeobachtet = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && zustand.ansicht.name === 'erfassung') {
          wachHalten(true);
        }
      });
    }
    return true;
  } catch {
    wachSchloss = null;
    return false;
  }
}

export function bildschirmBleibtAn() {
  return !!wachSchloss;
}

/**
 * Neu zeichnen, aber nie mitten in der Erfassung: dort würde eine halb
 * getippte Zahl verloren gehen. Für Aktualisierungen aus dem Hintergrund.
 */
export function zeichneSanft() {
  // Blockiert wird nur, wenn gerade eine Zahl eingetippt wird — sonst ginge
  // der Puffer der Zifferntastatur verloren. Blattansichten ohne Tastatur
  // dürfen aktualisiert werden, damit die Stände der anderen ankommen.
  if (zustand.ansicht.name === 'erfassung' && document.querySelector('.tastatur')) return;
  zeichne();
}

export function starteNavigation() {
  window.addEventListener('popstate', (e) => {
    zustand.ansicht = e.state && e.state.name ? e.state : { name: 'start', p: {} };
    zeichne();
  });
}

// --- Abgleich mit dem Daten-Repository -----------------------------------

export function zugang() {
  return {
    repo: zustand.meta.gh_repo || '',
    ordner: zustand.meta.gh_ordner || 'journale',
    token: zustand.meta.gh_token || '',
  };
}

export function zugangEingerichtet() {
  const z = zugang();
  return !!(z.repo && z.token);
}

export function ereignisseNichtExportiert() {
  return Math.max(0, zustand.ereignisse.length - (zustand.meta.letzter_export_anzahl || 0));
}

/**
 * Abgleich in einem Vorgang:
 *   1. Ordner im Repository auflisten
 *   2. alle Journaldateien lesen und fehlende Ereignisse übernehmen —
 *      auch die eigene, damit ein Verlust des Browserspeichers
 *      nicht zu Datenverlust führt
 *   3. die eigene Datei zurückschreiben, wenn sie nicht dem lokalen
 *      Bestand entspricht
 *
 * Es wird nie etwas gelöscht: alle Journale sind append-only und werden
 * über die Ereignis-IDs zusammengeführt.
 */
export async function abgleichen() {
  const z = zugang();
  if (!zugangEingerichtet()) {
    return { ok: false, meldung: 'Der Zugang zum Daten-Repository ist noch nicht eingerichtet.' };
  }
  if (!zustand.geraet.name) {
    return { ok: false, meldung: 'Dieses Gerät hat noch keinen Namen.' };
  }

  const eigene = gh.eigenerDateiname(zustand.geraet.name);
  const liste = await gh.ordnerListe(z).catch(() => ({ ok: false, meldung: netzMeldung() }));
  if (!liste.ok) return { ok: false, meldung: liste.meldung };

  // --- Lesen und zusammenführen ---
  const idsVorher = new Set(zustand.ids);
  const alleNeuen = [];
  const quellen = {};
  const fehler = [];
  let eigeneAnzahlEntfernt = null;

  for (const datei of liste.dateien) {
    let gelesen;
    try {
      gelesen = await gh.leseDatei(z, datei.pfad);
    } catch {
      gelesen = { ok: false, meldung: netzMeldung() };
    }
    if (!gelesen.ok) { fehler.push(`${datei.name}: ${gelesen.meldung}`); continue; }

    let inhalt = null;
    try {
      inhalt = JSON.parse(gelesen.text);
    } catch {
      fehler.push(`${datei.name}: kein gültiges JSON`);
      continue;
    }
    const ergebnis = lesePaket(inhalt, idsVorher);
    if (!ergebnis.ok) { fehler.push(`${datei.name}: ${ergebnis.meldung}`); continue; }

    if (datei.name === eigene) {
      eigeneAnzahlEntfernt = Array.isArray(inhalt.ereignisse) ? inhalt.ereignisse.length : 0;
    }
    for (const e of ergebnis.neue) idsVorher.add(e.id);
    alleNeuen.push(...ergebnis.neue);
    for (const [geraet, anzahl] of Object.entries(ergebnis.quellen)) {
      quellen[geraet] = (quellen[geraet] || 0) + anzahl;
    }
  }

  if (alleNeuen.length) {
    try {
      await db.ereignisseAnhaengen(alleNeuen);
    } catch {
      // Der lokale Speicher hat die Ereignisse nicht angenommen. Der
      // Abgleich gilt dann als gescheitert, damit der Stand nicht
      // fälschlich als übernommen angezeigt wird.
      return { ok: false, meldung: 'Die neuen Ereignisse konnten nicht gespeichert werden.', neu: 0, quellen, gelesen: liste.dateien.length };
    }
    for (const e of alleNeuen) {
      zustand.ereignisse.push(e);
      zustand.ids.add(e.id);
    }
    projiziereNeu();
    await merke('letzter_import', new Date().toISOString());
  }

  // --- Eigene Datei zurückschreiben ---
  const eigenerEintrag = liste.dateien.find((d) => d.name === eigene);
  const gleichstand = eigeneAnzahlEntfernt === zustand.ereignisse.length;
  let geschrieben = false;

  if (!gleichstand) {
    const text = JSON.stringify(baueExport(zustand.ereignisse, zustand.geraet));
    const pfad = `${z.ordner}/${eigene}`;
    const nachricht = `${zustand.geraet.name}: ${zustand.ereignisse.length} Ereignisse`;

    let ergebnis;
    try {
      ergebnis = await gh.schreibeDatei(z, pfad, text, eigenerEintrag ? eigenerEintrag.sha : null, nachricht);
    } catch {
      ergebnis = { ok: false, meldung: netzMeldung() };
    }

    // Bei einem Konflikt hat ein anderes Gerät dieselbe Datei geändert.
    // Dann wird der aktuelle Stand geholt und erneut geschrieben.
    if (!ergebnis.ok && ergebnis.konflikt) {
      const neueListe = await gh.ordnerListe(z).catch(() => ({ ok: false }));
      const neuerEintrag = neueListe.ok ? neueListe.dateien.find((d) => d.name === eigene) : null;
      if (neuerEintrag) {
        try {
          ergebnis = await gh.schreibeDatei(z, pfad, text, neuerEintrag.sha, nachricht);
        } catch {
          ergebnis = { ok: false, meldung: netzMeldung() };
        }
      }
    }

    if (!ergebnis.ok) {
      return {
        ok: false,
        meldung: ergebnis.meldung,
        neu: alleNeuen.length,
        quellen,
        gelesen: liste.dateien.length,
      };
    }
    geschrieben = true;
  }

  await merke('letzter_abgleich', new Date().toISOString());
  await merke('letzter_export', new Date().toISOString());
  await merke('letzter_export_anzahl', zustand.ereignisse.length);

  return {
    ok: true,
    neu: alleNeuen.length,
    quellen,
    gelesen: liste.dateien.length,
    geschrieben,
    leer: !!liste.leer,
    fehler,
    warnungen: aehnlicheNamen(),
  };
}

function netzMeldung() {
  return navigator.onLine
    ? 'GitHub war nicht erreichbar.'
    : 'Keine Netzverbindung. Der Abgleich wird beim nächsten Versuch nachgeholt.';
}

/**
 * Abgleich im Hintergrund: beim Start, während einer laufenden Partie und
 * nach deren Ende. Er meldet sich nie von selbst — weder bei Erfolg noch bei
 * einem Fehler. Am Spieltisch wäre eine Einblendung nach jedem übernommenen
 * Stand nur störend; sichtbar wird das Ergebnis dort, wo es hingehört: in den
 * Blättern und im Stand. Wer es genau wissen will, nutzt „Jetzt abgleichen“.
 */
export async function abgleichStill() {
  if (!zugangEingerichtet() || !zustand.geraet.name) return null;
  try {
    return await abgleichen();
  } catch {
    return null;
  }
}

export function aehnlicheNamen() {
  const namen = [...zustand.spieler.values()];
  const paare = [];
  for (let i = 0; i < namen.length; i++) {
    for (let j = i + 1; j < namen.length; j++) {
      const a = namen[i];
      const b = namen[j];
      if (namensform(a.name) === namensform(b.name)) continue;
      if (abstand(a.name, b.name) <= 1) paare.push([a.name, b.name]);
    }
  }
  return paare;
}

// --- Dienst fuer Neuerungen (Konzept 11.2) -------------------------------

/** Version des aktiven Service Workers erfragen. */
export function serviceWorkerVersion() {
  return new Promise((fertig) => {
    const aktiv = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!aktiv) { fertig(null); return; }
    const kanal = new MessageChannel();
    const uhr = setTimeout(() => fertig(null), 1500);
    kanal.port1.onmessage = (e) => {
      clearTimeout(uhr);
      fertig(e.data && e.data.version ? e.data.version : null);
    };
    try {
      aktiv.postMessage({ befehl: 'version' }, [kanal.port2]);
    } catch {
      clearTimeout(uhr);
      fertig(null);
    }
  });
}

/** Von Hand nach einer neuen Fassung suchen und sie übernehmen. */
export async function holeNeueVersion() {
  if (!('serviceWorker' in navigator)) return { ok: false, meldung: 'Dieser Browser verwaltet keine Zwischenspeicher.' };
  const registrierung = await navigator.serviceWorker.getRegistration();
  if (!registrierung) return { ok: false, meldung: 'Es ist kein Zwischenspeicher eingerichtet.' };

  await registrierung.update();
  const wartend = registrierung.waiting;
  if (wartend) {
    wartend.postMessage({ befehl: 'sofort-uebernehmen' });
    setTimeout(() => location.reload(), 300);
    return { ok: true, neu: true };
  }
  return { ok: true, neu: false };
}

export function pruefeAufNeueVersion(registrierung) {
  // Nur beim Start und nur, wenn keine Partie laeuft.
  const laufend = [...zustand.partien.values()].some((p) => p.status === 'laufend');
  if (laufend || !registrierung) return;
  registrierung.update().catch(() => {});
}

export function zeigeNeueVersion(registrierung) {
  const banner = document.getElementById('neuerung');
  if (!banner) return;
  banner.hidden = false;
  banner.querySelector('button').onclick = () => {
    if (registrierung.waiting) registrierung.waiting.postMessage({ befehl: 'sofort-uebernehmen' });
    setTimeout(() => location.reload(), 200);
  };
  meldung('Eine neue Version steht bereit.');
}
