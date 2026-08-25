// Emelys Spielewelt — Programmstart, Startbildschirm, Spieler, Daten.

import {
  zustand, starte, starteNavigation, registriereAnsicht, navigiere, zeichne,
  schreibe, merke, importiere, exportiere, ereignisseNichtExportiert,
  definitionFuer, aehnlicheNamen, pruefeAufNeueVersion, zeigeNeueVersion,
  teilenMoeglich, speicherndialogMoeglich,
} from './kern.js';
import {
  h, kachel, kopf, taste, meldung, dialog, frage, textFrage, datumZeit,
} from './ui.js';
import { laufendePartien, beendetePartien } from './projektion.js';
import { berechneStand } from './regeln.js';
import { ergebnis, endbedingungText } from './auswertung.js';
import { nameVon, spielerAnlegen, nochmal, jetztExportieren } from './partie.js';
import './statistik.js';

// --- Startbildschirm -----------------------------------------------------

registriereAnsicht('start', () => {
  const laufend = laufendePartien(zustand.partien);
  const letzte = beendetePartien(zustand.partien).slice(0, 3);
  const offen = ereignisseNichtExportiert();

  return [
    kopf('Emelys Spielewelt', zustand.geraet.name ? `Gerät: ${zustand.geraet.name}` : null),

    kachel(taste('Neue Partie', () => navigiere('spielwahl'), 'haupt')),

    laufend.length
      ? kachel(
          h('h2', { text: laufend.length === 1 ? 'Laufende Partie' : 'Laufende Partien' }),
          h('ul', { klasse: 'liste', style: 'margin:0 -16px -16px' },
            ...laufend.map((p) => {
              const def = definitionFuer(p.spiel_id, p.spiel_version);
              const stand = def && def.erfassungsmodus !== 'nur_sieger'
                ? berechneStand(def, p.teilnehmer, p.eintraege) : null;
              const fortschritt = stand
                ? (def.erfassungsmodus === 'punkte_rundenblock'
                    ? `${stand.vollstaendigeRunden} Runden erfasst`
                    : `${stand.sequenzen.length} Züge erfasst`)
                : 'ohne Punkteerfassung';
              return h('li', {}, h('button', {
                klasse: 'eintrag', onclick: () => navigiere('erfassung', { partieId: p.id }),
              },
                h('span', { klasse: 'haupt' },
                  h('span', { klasse: 'titel', text: p.spiel_name }),
                  h('span', { klasse: 'klein', style: 'display:block',
                    text: `${p.teilnehmer.map(nameVon).join(', ')} · ${fortschritt}` })),
                h('span', { klasse: 'pfeil', text: '›' })));
            }))
        )
      : null,

    kachel(
      h('h2', { text: 'Übersicht' }),
      h('ul', { klasse: 'liste', style: 'margin:0 -16px -16px' },
        eintragZeile('Auswertung', 'Siege, Quoten und Punkte', () => navigiere('auswertung')),
        eintragZeile('Spieler', `${[...zustand.spieler.values()].filter((s) => s.aktiv).length} in der Auswahl`, () => navigiere('spieler')),
        eintragZeile('Daten', offen ? `${offen} Ereignisse noch nicht exportiert` : 'Export und Import', () => navigiere('daten')))
    ),

    letzte.length
      ? kachel(
          h('h2', { text: 'Zuletzt gespielt' }),
          h('ul', { klasse: 'liste', style: 'margin:0 -16px -16px' },
            ...letzte.map((p) => {
              const def = definitionFuer(p.spiel_id, p.spiel_version);
              const erg = ergebnis(def, p);
              return h('li', {}, h('button', {
                klasse: 'eintrag', onclick: () => navigiere('ergebnis', { partieId: p.id }),
              },
                h('span', { klasse: 'haupt' },
                  h('span', { klasse: 'titel', text: p.spiel_name }),
                  h('span', { klasse: 'klein', style: 'display:block',
                    text: `${datumZeit(p.start_zeitpunkt)} · ` +
                      (erg.sieger.length === 1 ? `${nameVon(erg.sieger[0])} gewinnt`
                        : erg.sieger.length ? 'Gleichstand' : 'ohne Sieger') })),
                def && def.schnellstart_wiederholung
                  ? h('span', { klasse: 'marke', onclick: (e) => { e.stopPropagation(); nochmal(p); }, text: 'nochmal' })
                  : null,
                h('span', { klasse: 'pfeil', text: '›' })));
            }))
        )
      : null,

    offen
      ? kachel(h('div', { klasse: 'hinweis' },
          h('div', { text: `${offen} Ereignisse sind noch in keiner Exportdatei enthalten. ` +
            'Solange sie nicht exportiert sind, liegen sie nur auf diesem Gerät.' }),
          h('div', { style: 'margin-top:10px' }, taste('Jetzt exportieren', jetztExportieren, 'haupt schmal'))))
      : null,

    h('p', { klasse: 'klein', style: 'padding:0 4px', text:
      `Letzter Export: ${datumZeit(zustand.meta.letzter_export)} · Letzter Import: ${datumZeit(zustand.meta.letzter_import)}` }),
  ];
});

function eintragZeile(titel, unterzeile, onclick) {
  return h('li', {}, h('button', { klasse: 'eintrag', onclick },
    h('span', { klasse: 'haupt' },
      h('span', { klasse: 'titel', text: titel }),
      h('span', { klasse: 'klein', style: 'display:block', text: unterzeile })),
    h('span', { klasse: 'pfeil', text: '›' })));
}

// --- Spielerverwaltung ---------------------------------------------------

registriereAnsicht('spieler', () => {
  const alle = [...zustand.spieler.values()].sort((a, b) => a.name.localeCompare(b.name, 'de-DE'));
  const aktiv = alle.filter((s) => s.aktiv);
  const inaktiv = alle.filter((s) => !s.aktiv);

  const zeile = (s) => h('li', {}, h('div', { klasse: 'eintrag statisch' },
    h('span', { klasse: 'haupt' },
      h('span', { klasse: 'titel', text: s.name }),
      h('span', { klasse: 'klein', style: 'display:block', text: partienText(s.id) })),
    h('span', { klasse: 'schieber' },
      h('button', { 'aria-label': 'Umbenennen', onclick: () => umbenennen(s) }, '✎'),
      h('button', { 'aria-label': s.aktiv ? 'Aus Auswahl nehmen' : 'In Auswahl aufnehmen',
        onclick: () => umschalten(s) }, s.aktiv ? '−' : '+'))));

  return [
    kopf('Spieler', null, () => navigiere('start')),
    kachel(taste('Neuer Spieler', async () => { await spielerAnlegen(); zeichne(); }, 'haupt')),
    kachel(
      h('h2', { text: 'In der Auswahl' }),
      aktiv.length
        ? h('ul', { klasse: 'liste', style: 'margin:0 -16px -16px' }, ...aktiv.map(zeile))
        : h('p', { klasse: 'sekundaer', text: 'Noch niemand angelegt.' })
    ),
    inaktiv.length
      ? kachel(
          h('h2', { text: 'Nicht in der Auswahl' }),
          h('p', { klasse: 'klein', text: 'Bleiben in allen bisherigen Partien und in der Auswertung erhalten.' }),
          h('ul', { klasse: 'liste', style: 'margin:8px -16px -16px' }, ...inaktiv.map(zeile))
        )
      : null,
    warnungKachel(),
  ];
});

function partienText(spielerId) {
  let anzahl = 0;
  for (const p of zustand.partien.values()) {
    if (p.status === 'beendet' && p.teilnehmer.includes(spielerId)) anzahl++;
  }
  return anzahl === 0 ? 'noch keine Partie' : anzahl === 1 ? '1 Partie' : `${anzahl} Partien`;
}

function warnungKachel() {
  const paare = aehnlicheNamen();
  if (!paare.length) return null;
  return kachel(h('div', { klasse: 'hinweis' },
    h('div', { text: 'Diese Namen liegen sehr dicht beieinander und werden als verschiedene Spieler geführt:' }),
    h('ul', { style: 'margin:8px 0 0;padding-left:18px' },
      ...paare.map(([a, b]) => h('li', { text: `${a} und ${b}` })))));
}

async function umbenennen(s) {
  const name = await textFrage({
    titel: 'Spieler umbenennen', bezeichnung: 'Name', vorbelegung: s.name,
    hinweis: 'Der Anzeigename ändert sich, die bisherigen Partien bleiben zugeordnet.',
  });
  if (!name || name === s.name) return;
  await schreibe('spieler_umbenannt', { id: s.id, name });
  meldung('Name geändert.');
  zeichne();
}

async function umschalten(s) {
  if (s.aktiv) {
    const sicher = await frage('Aus der Auswahl nehmen?',
      `${s.name} erscheint dann nicht mehr bei neuen Partien. Alle bisherigen Ergebnisse bleiben erhalten.`,
      'Aus Auswahl nehmen');
    if (!sicher) return;
  }
  await schreibe('spieler_deaktiviert', { id: s.id, aktiv: !s.aktiv });
  zeichne();
}

// --- Daten ---------------------------------------------------------------

registriereAnsicht('daten', () => {
  const offen = ereignisseNichtExportiert();
  const teilen = teilenMoeglich();
  const speichern = speicherndialogMoeglich();
  const eingabe = h('input', {
    // Kein accept-Filter: im OneDrive-Ordner sollen alle Journaldateien
    // wählbar bleiben. Das Format prüft die App selbst.
    type: 'file', multiple: true,
    style: 'display:none',
    onchange: async (e) => {
      const dateien = [...e.target.files];
      e.target.value = '';
      if (dateien.length) await importDurchfuehren(dateien);
    },
  });

  const exportWeg = teilen
    ? 'Teilen-Dialog — OneDrive ist dort direkt als Ziel wählbar.'
    : speichern
      ? 'Speichern-Dialog — der Zielordner ist frei wählbar.'
      : 'Ordner Downloads — die Datei muss von dort verschoben werden.';

  return [
    kopf('Daten', 'Export und Import über OneDrive', () => navigiere('start')),

    kachel(
      h('h2', { text: 'Dieses Gerät' }),
      h('table', { klasse: 'daten' }, h('tbody', {},
        zeileWert('Name', zustand.geraet.name || 'nicht gesetzt'),
        zeileWert('Ereignisse', String(zustand.ereignisse.length)),
        zeileWert('Partien', String(zustand.partien.size)),
        zeileWert('Spieler', String(zustand.spieler.size)),
        zeileWert('Letzter Export', datumZeit(zustand.meta.letzter_export)),
        zeileWert('Letzter Import', datumZeit(zustand.meta.letzter_import)))),
      h('div', { style: 'margin-top:12px' }, taste('Gerätenamen ändern', geraetenameSetzen, 'schmal'))
    ),

    kachel(
      h('h2', { text: 'Exportieren' }),
      h('p', { klasse: 'sekundaer', text: offen
        ? `${offen} Ereignisse sind noch in keiner Exportdatei enthalten.`
        : 'Alle Ereignisse sind exportiert.' }),
      h('div', { style: 'margin-top:12px' }, taste('Daten exportieren', jetztExportieren, 'haupt')),
      h('p', { klasse: 'klein', style: 'margin-top:10px', text: `Weg auf diesem Gerät: ${exportWeg}` }),
      !teilen && !speichern
        ? h('p', { klasse: 'hinweis', style: 'margin-top:10px', text:
            'In Chrome unter Einstellungen → Downloads die Option „Fragen, wo Dateien gespeichert werden“ ' +
            'einschalten. Dann erscheint beim Export ein Ordnerdialog mit OneDrive als Ziel.' })
        : null
    ),

    kachel(
      h('h2', { text: 'Importieren' }),
      h('p', { klasse: 'sekundaer', text:
        'Journaldateien der anderen Geräte auswählen. Mehrere Dateien auf einmal sind möglich. ' +
        'Bereits bekannte Ereignisse werden übersprungen.' }),
      h('div', { style: 'margin-top:12px' }, taste('Daten importieren', () => eingabe.click(), 'haupt')),
      eingabe
    ),

    kachel(
      h('h2', { text: 'Sicherung' }),
      h('p', { klasse: 'klein', text:
        'Solange nicht exportiert wurde, liegen die Daten nur im Speicher dieses Browsers. ' +
        'Wird der Browserspeicher geleert oder das Gerät neu aufgesetzt, sind sie verloren. ' +
        'Zum Sichern genügt es, den Ordner SpielständeAPP zu kopieren.' })
    ),
  ];
});

function zeileWert(bezeichnung, wert) {
  return h('tr', {}, h('td', { text: bezeichnung }), h('td', { klasse: 'zahl', text: wert }));
}

async function geraetenameSetzen(ersterStart = false) {
  const name = await textFrage({
    titel: ersterStart === true ? 'Gerät benennen' : 'Gerätenamen ändern',
    bezeichnung: 'Name dieses Geräts',
    vorbelegung: zustand.geraet.name || '',
    hinweis: 'Steht im Dateinamen der Exportdatei, zum Beispiel handy-thomas.',
  });
  if (!name) return;
  zustand.geraet.name = name;
  await merke('geraet_name', name);
  meldung('Gerätename gespeichert.');
  zeichne();
}

async function importDurchfuehren(dateien) {
  const ergebnisImport = await importiere(dateien);

  const zeilen = ergebnisImport.bericht.map((b) => {
    if (!b.ok) {
      return h('li', {}, h('strong', { text: b.datei }), h('div', { klasse: 'klein', text: b.meldung }));
    }
    const quellen = Object.entries(b.quellen)
      .map(([geraet, anzahl]) => `${geraet}: ${anzahl}`)
      .join(', ');
    return h('li', {},
      h('strong', { text: b.datei }),
      h('div', { klasse: 'klein', text:
        `${b.neu} neue Ereignisse` + (b.neu ? ` (${quellen})` : '') +
        `, ${b.uebersprungen} schon bekannt` }));
  });

  await dialog({
    titel: ergebnisImport.neu ? `${ergebnisImport.neu} neue Ereignisse übernommen` : 'Nichts Neues dabei',
    inhalt: [
      h('ul', { style: 'margin:0 0 10px;padding-left:18px' }, ...zeilen),
      ergebnisImport.neu === 0
        ? h('p', { klasse: 'klein', text: 'Die Quelle war offenbar nicht neuer als der eigene Bestand.' })
        : null,
      ergebnisImport.warnungen.length
        ? h('p', { klasse: 'hinweis', text:
            'Ähnliche Namen gefunden: ' +
            ergebnisImport.warnungen.map(([a, b]) => `${a}/${b}`).join(', ') +
            '. Diese werden als verschiedene Spieler geführt.' })
        : null,
    ],
    tasten: [{ text: 'Verstanden', art: 'haupt' }],
  });
  zeichne();
}

// --- Programmstart -------------------------------------------------------

async function los() {
  try {
    await starte();
  } catch (fehler) {
    document.getElementById('app').replaceChildren(
      kopf('Start nicht möglich'),
      kachel(h('p', { klasse: 'hinweis', text: String(fehler.message || fehler) }))
    );
    return;
  }

  starteNavigation();
  navigiere('start', {}, true);

  if (!zustand.geraet.name) await geraetenameSetzen(true);

  if ('serviceWorker' in navigator) {
    try {
      const registrierung = await navigator.serviceWorker.register('sw.js');
      if (registrierung.waiting) zeigeNeueVersion(registrierung);
      registrierung.addEventListener('updatefound', () => {
        const neu = registrierung.installing;
        if (!neu) return;
        neu.addEventListener('statechange', () => {
          if (neu.state === 'installed' && navigator.serviceWorker.controller) {
            zeigeNeueVersion(registrierung);
          }
        });
      });
      pruefeAufNeueVersion(registrierung);
    } catch { /* App laeuft auch ohne Zwischenspeicher */ }
  }
}

los();
