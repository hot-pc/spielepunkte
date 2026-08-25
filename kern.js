// Kern: haelt den Zustand, schreibt ins Journal, steuert die Navigation
// und fuehrt Export und Import aus.

import * as db from './db.js';
import { projiziere } from './projektion.js';
import { baueExport, dateiname, lesePaket, pruefeInvariante } from './journal.js';
import { abstand, namensform } from './regeln.js';
import { meldung } from './ui.js';

export const zustand = {
  ereignisse: [],
  ids: new Set(),
  spieler: new Map(),
  partien: new Map(),
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

export function zeichne() {
  const aufbau = ansichten.get(zustand.ansicht.name) || ansichten.get('start');
  const wurzel = document.getElementById('app');
  wurzel.replaceChildren();
  const inhalt = aufbau(zustand.ansicht.p || {});
  wurzel.append(...(Array.isArray(inhalt) ? inhalt : [inhalt]));
  window.scrollTo(0, 0);
}

export function starteNavigation() {
  window.addEventListener('popstate', (e) => {
    zustand.ansicht = e.state && e.state.name ? e.state : { name: 'start', p: {} };
    zeichne();
  });
}

// --- Export --------------------------------------------------------------

export async function exportiere() {
  const pruefung = pruefeInvariante(zustand.ereignisse.length, zustand.meta.letzter_export_anzahl || 0);
  if (!pruefung.ok) return { ok: false, meldung: pruefung.meldung };

  const paket = baueExport(zustand.ereignisse, zustand.geraet);
  const name = dateiname(zustand.geraet.name);
  const text = JSON.stringify(paket);

  try {
    const datei = new File([text], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [datei] })) {
      await navigator.share({ files: [datei], title: name });
    } else {
      lade(text, name);
    }
  } catch (fehler) {
    if (fehler && fehler.name === 'AbortError') return { ok: false, abgebrochen: true };
    // Teilen nicht moeglich: klassischer Download als Rueckfall (Konzept 3.4)
    try { lade(text, name); } catch { return { ok: false, meldung: 'Die Datei konnte nicht bereitgestellt werden.' }; }
  }

  await merke('letzter_export', new Date().toISOString());
  await merke('letzter_export_anzahl', zustand.ereignisse.length);
  return { ok: true, name, anzahl: zustand.ereignisse.length };
}

function lade(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function ereignisseNichtExportiert() {
  return Math.max(0, zustand.ereignisse.length - (zustand.meta.letzter_export_anzahl || 0));
}

// --- Import --------------------------------------------------------------

export async function importiere(dateien) {
  const bericht = [];
  const alleNeuen = [];
  const idsVorher = new Set(zustand.ids);

  for (const datei of dateien) {
    let inhalt = null;
    try {
      inhalt = JSON.parse(await datei.text());
    } catch {
      bericht.push({ datei: datei.name, ok: false, meldung: 'Die Datei ist keine gültige JSON-Datei.' });
      continue;
    }
    const ergebnis = lesePaket(inhalt, idsVorher);
    if (!ergebnis.ok) {
      bericht.push({ datei: datei.name, ok: false, meldung: ergebnis.meldung });
      continue;
    }
    for (const e of ergebnis.neue) idsVorher.add(e.id);
    alleNeuen.push(...ergebnis.neue);
    bericht.push({
      datei: datei.name,
      ok: true,
      neu: ergebnis.neue.length,
      uebersprungen: ergebnis.uebersprungen,
      quellen: ergebnis.quellen,
      erzeugt_am: ergebnis.erzeugt_am,
    });
  }

  if (alleNeuen.length) {
    await db.ereignisseAnhaengen(alleNeuen);
    for (const e of alleNeuen) {
      zustand.ereignisse.push(e);
      zustand.ids.add(e.id);
    }
    projiziereNeu();
    await merke('letzter_import', new Date().toISOString());
  }

  return { bericht, neu: alleNeuen.length, warnungen: aehnlicheNamen() };
}

/**
 * Warnung bei aehnlichen, nicht identischen Spielernamen (Konzept 4).
 * Identische Namen fuehren durch die namensabgeleitete ID ohnehin zusammen.
 */
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
