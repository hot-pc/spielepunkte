// Emelys Spielewelt — Programmstart, Startbildschirm, Spieler, Daten.

import {
  zustand, starte, starteNavigation, registriereAnsicht, navigiere, zeichne,
  schreibe, merke, ereignisseNichtExportiert, definitionFuer, aehnlicheNamen,
  pruefeAufNeueVersion, zeigeNeueVersion,
  zugang, zugangEingerichtet, abgleichen, abgleichStill, zeichneSanft,
} from './kern.js';
import { pruefeZugang, eigenerDateiname } from './github.js';
import {
  h, kachel, kopf, taste, meldung, dialog, frage, textFrage, datumZeit,
} from './ui.js';
import { laufendePartien, beendetePartien } from './projektion.js';
import { berechneStand } from './regeln.js';
import { ergebnis, endbedingungText } from './auswertung.js';
import { nameVon, spielerAnlegen, nochmal } from './partie.js';
import './statistik.js';

// --- Startbildschirm -----------------------------------------------------

registriereAnsicht('start', () => {
  const laufend = laufendePartien(zustand.partien);
  const letzte = beendetePartien(zustand.partien).slice(0, 3);
  const offen = ereignisseNichtExportiert();
  const eingerichtet = zugangEingerichtet();

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
        eintragZeile('Daten', eingerichtet
          ? (offen ? `${offen} Ereignisse noch nicht abgeglichen` : 'Alles abgeglichen')
          : 'Zugang noch nicht eingerichtet', () => navigiere('daten')))
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

    offen && eingerichtet
      ? kachel(h('div', { klasse: 'hinweis' },
          h('div', { text: `${offen} Ereignisse sind noch nicht abgeglichen und liegen nur auf diesem Gerät.` }),
          h('div', { style: 'margin-top:10px' }, taste('Jetzt abgleichen', jetztAbgleichen, 'haupt schmal'))))
      : null,

    !eingerichtet
      ? kachel(h('div', { klasse: 'hinweis' },
          h('div', { text: 'Der Zugang zum Daten-Repository ist noch nicht eingerichtet. ' +
            'Bis dahin bleiben alle Spielstände nur auf diesem Gerät.' }),
          h('div', { style: 'margin-top:10px' }, taste('Zugang einrichten', () => navigiere('daten'), 'haupt schmal'))))
      : null,

    h('p', { klasse: 'klein', style: 'padding:0 4px', text:
      `Letzter Abgleich: ${datumZeit(zustand.meta.letzter_abgleich)}` }),
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
  const z = zugang();
  const eingerichtet = zugangEingerichtet();

  return [
    kopf('Daten', 'Abgleich über das Daten-Repository', () => navigiere('start')),

    kachel(
      h('h2', { text: 'Abgleich' }),
      eingerichtet
        ? h('p', { klasse: 'sekundaer', text: offen
            ? `${offen} Ereignisse sind noch nicht abgeglichen.`
            : 'Alles abgeglichen.' })
        : h('p', { klasse: 'hinweis', text:
            'Der Zugang ist noch nicht eingerichtet. Bis dahin liegen alle Daten nur auf diesem Gerät.' }),
      h('div', { style: 'margin-top:12px' },
        taste('Jetzt abgleichen', jetztAbgleichen, 'haupt')),
      h('p', { klasse: 'klein', style: 'margin-top:10px', text:
        'Der Abgleich läuft auch beim Start der App und nach jeder beendeten Partie von selbst. ' +
        'Er holt die Stände der anderen Geräte und schreibt den eigenen zurück.' })
    ),

    kachel(
      h('h2', { text: 'Dieses Gerät' }),
      h('table', { klasse: 'daten' }, h('tbody', {},
        zeileWert('Name', zustand.geraet.name || 'nicht gesetzt'),
        zeileWert('Datei im Repository', zustand.geraet.name ? eigenerDateiname(zustand.geraet.name) : '—'),
        zeileWert('Ereignisse', String(zustand.ereignisse.length)),
        zeileWert('Partien', String(zustand.partien.size)),
        zeileWert('Spieler', String(zustand.spieler.size)),
        zeileWert('Letzter Abgleich', datumZeit(zustand.meta.letzter_abgleich)))),
      h('div', { style: 'margin-top:12px' }, taste('Gerätenamen ändern', geraetenameSetzen, 'schmal'))
    ),

    kachel(
      h('h2', { text: 'Zugang' }),
      h('table', { klasse: 'daten' }, h('tbody', {},
        zeileWert('Repository', z.repo || 'nicht gesetzt'),
        zeileWert('Ordner', z.ordner),
        zeileWert('Token', z.token ? `gesetzt (${z.token.slice(0, 7)}…)` : 'nicht gesetzt'))),
      h('div', { style: 'margin-top:12px' }, taste('Repository und Ordner ändern', repoSetzen, 'schmal')),
      h('div', { style: 'margin-top:10px' }, taste('Token eintragen', tokenSetzen, 'schmal')),
      h('div', { style: 'margin-top:10px' }, taste('Verbindung prüfen', verbindungPruefen, 'schmal')),
      h('p', { klasse: 'klein', style: 'margin-top:10px', text:
        'Das Token wird nur auf diesem Gerät gespeichert und nie in ein Repository geschrieben. ' +
        'Es braucht die Berechtigung „Contents: Read and write“ für genau dieses Repository.' })
    ),

    kachel(
      h('h2', { text: 'Sicherung' }),
      h('p', { klasse: 'klein', text:
        'Das Daten-Repository ist die Sicherung: Jeder Abgleich erzeugt einen Commit, alle früheren ' +
        'Stände bleiben in der Versionsgeschichte erhalten und lassen sich dort jederzeit ansehen. ' +
        'Ereignisse, die noch nicht abgeglichen sind, liegen dagegen nur im Speicher dieses Browsers.' })
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
    hinweis: 'Bestimmt den Dateinamen im Repository, zum Beispiel handy-thomas.',
  });
  if (!name) return;
  zustand.geraet.name = name;
  await merke('geraet_name', name);
  meldung('Gerätename gespeichert.');
  zeichne();
}

async function repoSetzen() {
  const repo = await textFrage({
    titel: 'Daten-Repository',
    bezeichnung: 'Repository (besitzer/name)',
    vorbelegung: zugang().repo || 'hot-pc/spielepunkte-daten',
    hinweis: 'Das private Repository, in dem die Journaldateien liegen.',
  });
  if (!repo) return;
  await merke('gh_repo', repo.trim());

  const ordner = await textFrage({
    titel: 'Ordner',
    bezeichnung: 'Ordner im Repository',
    vorbelegung: zugang().ordner || 'journale',
  });
  if (ordner) await merke('gh_ordner', ordner.trim().replace(/^\/+|\/+$/g, ''));
  meldung('Zugang gespeichert.');
  zeichne();
}

async function tokenSetzen() {
  const token = await textFrage({
    titel: 'Token eintragen',
    bezeichnung: 'Fine-grained Token',
    vorbelegung: '',
    hinweis: 'In GitHub unter Einstellungen, Developer settings, Personal access tokens, ' +
      'Fine-grained tokens erzeugen. Zugriff nur auf das Daten-Repository, Berechtigung ' +
      '„Contents: Read and write“.',
    tasteText: 'Speichern',
  });
  if (!token) return;
  await merke('gh_token', token.trim());
  meldung('Token gespeichert.');
  zeichne();
  await verbindungPruefen();
}

async function verbindungPruefen() {
  const z = zugang();
  let ergebnis;
  try {
    ergebnis = await pruefeZugang(z);
  } catch {
    ergebnis = { ok: false, meldung: 'GitHub war nicht erreichbar.' };
  }

  const zeilen = [];
  if (ergebnis.ok) {
    zeilen.push(h('p', { klasse: 'sekundaer', text: `Repository ${z.repo} ist erreichbar.` }));
    zeilen.push(h('p', { klasse: 'klein', text:
      ergebnis.privat ? 'Das Repository ist privat.'
        : 'Achtung: Das Repository ist öffentlich. Die Spielstände wären für jeden lesbar.' }));
    if (ergebnis.meldung) zeilen.push(h('p', { klasse: 'hinweis', text: ergebnis.meldung }));
    else zeilen.push(h('p', { klasse: 'klein', text: 'Schreibrecht ist vorhanden.' }));
  } else {
    zeilen.push(h('p', { klasse: 'hinweis', text: ergebnis.meldung }));
  }

  await dialog({
    titel: ergebnis.ok ? 'Verbindung steht' : 'Verbindung nicht möglich',
    inhalt: zeilen,
    tasten: [{ text: 'Verstanden', art: 'haupt' }],
  });
}

export async function jetztAbgleichen() {
  const ergebnis = await abgleichen().catch(() => ({ ok: false, meldung: 'Der Abgleich ist gescheitert.' }));
  zeichne();

  if (!ergebnis.ok) {
    await dialog({
      titel: 'Abgleich nicht vollständig',
      inhalt: [
        h('p', { klasse: 'hinweis', text: ergebnis.meldung }),
        ergebnis.neu
          ? h('p', { klasse: 'klein', text: `${ergebnis.neu} neue Ereignisse wurden trotzdem übernommen.` })
          : null,
        h('p', { klasse: 'klein', text: 'Die eigenen Daten bleiben auf diesem Gerät erhalten.' }),
      ],
      tasten: [{ text: 'Verstanden', art: 'haupt' }],
    });
    return;
  }

  const quellen = Object.entries(ergebnis.quellen || {})
    .map(([geraet, anzahl]) => `${geraet}: ${anzahl}`)
    .join(', ');

  await dialog({
    titel: ergebnis.neu ? `${ergebnis.neu} neue Ereignisse übernommen` : 'Alles auf demselben Stand',
    inhalt: [
      h('p', { klasse: 'klein', text:
        `${ergebnis.gelesen} ${ergebnis.gelesen === 1 ? 'Journaldatei' : 'Journaldateien'} gelesen, ` +
        (ergebnis.geschrieben ? 'eigener Stand zurückgeschrieben.' : 'eigener Stand war schon aktuell.') }),
      ergebnis.neu ? h('p', { klasse: 'klein', text: `Von ${quellen}.` }) : null,
      ergebnis.leer ? h('p', { klasse: 'klein', text: 'Der Ordner war noch leer und wurde angelegt.' }) : null,
      ergebnis.fehler && ergebnis.fehler.length
        ? h('p', { klasse: 'hinweis', text: `Nicht gelesen: ${ergebnis.fehler.join('; ')}` })
        : null,
      ergebnis.warnungen && ergebnis.warnungen.length
        ? h('p', { klasse: 'hinweis', text:
            'Ähnliche Namen gefunden: ' +
            ergebnis.warnungen.map(([a, b]) => `${a}/${b}`).join(', ') +
            '. Diese werden als verschiedene Spieler geführt.' })
        : null,
    ],
    tasten: [{ text: 'Verstanden', art: 'haupt' }],
  });
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

  // Abgleich beim Start, still im Hintergrund.
  abgleichStill().then((ergebnis) => { if (ergebnis && ergebnis.ok) zeichneSanft(); });

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
