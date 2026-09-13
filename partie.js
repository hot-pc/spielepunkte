// Partiestart, Erfassung (drei Modi) und Ergebnis (Konzept 6).

import {
  zustand, registriereAnsicht, navigiere, zeichne, schreibe, merke,
  neueId, definitionFuer, spieleZurAuswahl, abgleichStill, zeichneSanft, notizFuer, nameVon,
} from './kern.js';
import {
  h, kachel, kopf, taste, meldung, dialog, frage, textFrage, notizFrage,
  zifferntastatur, datumZeit,
} from './ui.js';
import {
  berechneStand, platzierung, pruefeEnde, eingabeGueltig, endbedingungVorschlag, zugnummern,
  spielerIdAusName, abstand, namensform,
} from './regeln.js';
import { kurznamen } from './kurznamen.js';
import { aktiveSpieler } from './projektion.js';
import { ergebnis, endbedingungText } from './auswertung.js';
import { erfassungBlatt, blaetter, punkte as blattPunkte, bonusKonflikte, bonusVerteilung,
  setzeAbschlussHandler } from './calavera.js';

// --- Hilfen --------------------------------------------------------------

export { nameVon };

/** Reihenfolge der Spalten in der Matrix (Konzept 6.5). */
export function spaltenVon(partie) {
  return partie.spalten && partie.spalten.length ? partie.spalten : reihenfolgeVon(partie);
}

/** Aktuelle Erfassungsreihenfolge — wer als Naechstes an der Reihe ist. */
export function reihenfolgeVon(partie) {
  return partie.reihenfolge && partie.reihenfolge.length ? partie.reihenfolge : partie.teilnehmer;
}

function kurznamenFuer(teilnehmer) {
  const kurz = kurznamen(teilnehmer.map(nameVon));
  return new Map(teilnehmer.map((id, i) => [id, kurz[i]]));
}

/** Neuen Spieler anlegen, mit Warnung bei aehnlichem Namen (Konzept 4). */
export async function spielerAnlegen() {
  const name = await textFrage({
    titel: 'Neuer Spieler',
    bezeichnung: 'Name',
    hinweis: 'Zwei Personen mit gleichem Namen bitte unterscheiden, zum Beispiel "Anna K".',
    tasteText: 'Anlegen',
  });
  if (!name) return null;

  const id = spielerIdAusName(name);
  const vorhanden = zustand.spieler.get(id);
  if (vorhanden) {
    if (!vorhanden.aktiv) {
      await schreibe('spieler_deaktiviert', { id, aktiv: true });
      meldung(`${vorhanden.name} ist wieder in der Auswahl.`);
      return id;
    }
    meldung(`${vorhanden.name} gibt es schon.`);
    return id;
  }

  const aehnlich = [...zustand.spieler.values()].filter(
    (s) => namensform(s.name) !== namensform(name) && abstand(s.name, name) <= 1
  );
  if (aehnlich.length) {
    const weiter = await frage(
      'Ähnlicher Name vorhanden',
      `Es gibt schon ${aehnlich.map((s) => s.name).join(', ')}. ` +
        `"${name}" wird als eigener Spieler mit eigener Statistik geführt.`,
      'Trotzdem anlegen'
    );
    if (!weiter) return null;
  }

  await schreibe('spieler_angelegt', { id, name });
  return id;
}


// --- Infos und Hausregeln je Spiel ---------------------------------------

/**
 * Zeigt die Hinweise aus der Spieldefinition und die selbst erfassten
 * Hausregeln. Die Notiz liegt im Journal und steht damit auf allen Geräten.
 */
export async function zeigeInfos(def) {
  if (!def) return;
  const notiz = notizFuer(def.id);

  const kopfteil = h('div', {},
    h('p', { klasse: 'sekundaer', text: beschreibungSpiel(def) }),
    def.hinweis_erfassung
      ? h('p', { klasse: 'notiz', style: 'margin-bottom:12px' }, def.hinweis_erfassung)
      : null,
    notiz && notiz.zeit
      ? h('p', { klasse: 'klein', text: `Zuletzt geändert am ${datumZeit(notiz.zeit)}` +
          (notiz.geraet ? ` auf ${notiz.geraet}` : '') })
      : null
  );

  const text = await notizFrage({
    titel: `${def.name} — Infos`,
    bezeichnung: 'Eigene Hausregeln und Notizen',
    vorbelegung: notiz ? notiz.text : '',
    kopf: kopfteil,
  });
  if (text === null) return;
  if (notiz && text === notiz.text) return;

  await schreibe('spielnotiz_gesetzt', { spiel_id: def.id, text });
  meldung(text ? 'Notiz gespeichert.' : 'Notiz geleert.');
  zeichne();
  // Damit die Regel auch am nächsten Spieltisch steht.
  abgleichStill().then((ergebnis) => { if (ergebnis && ergebnis.ok) zeichneSanft(); });
}

/** Knopfbeschriftung mit Hinweis, ob schon etwas hinterlegt ist. */
export function infoTaste(def, art = 'schmal') {
  return taste(notizFuer(def.id) ? 'Infos ●' : 'Infos', () => zeigeInfos(def), art);
}

// --- Spielwahl -----------------------------------------------------------

registriereAnsicht('spielwahl', () => [
  kopf('Neue Partie', 'Spiel wählen', () => history.back()),
  kachel(
    h('h2', { text: 'Spiele' }),
    h(
      'ul',
      { klasse: 'liste', style: 'margin:0 -16px -16px' },
      ...spieleZurAuswahl().map((s) =>
        h(
          'li',
          { klasse: 'zeile-mit-aktion' },
          h(
            'button',
            { klasse: 'eintrag', onclick: () => navigiere('partiestart', { spielId: s.id }) },
            h(
              'span',
              { klasse: 'haupt' },
              h('span', { klasse: 'titel', text: s.name }),
              h('span', { klasse: 'klein', style: 'display:block',
                text: beschreibungSpiel(s) })
            ),
            h('span', { klasse: 'pfeil', text: '›' })
          ),
          h('button', {
            klasse: 'nebenaktion', type: 'button',
            'aria-label': `Infos zu ${s.name}`,
            onclick: (e) => { e.stopPropagation(); zeigeInfos(s); },
          }, notizFuer(s.id) ? 'Infos ●' : 'Infos')
        )
      )
    )
  ),
  h('p', { klasse: 'klein', style: 'padding:0 4px',
    text: 'Weitere Spiele werden in der Datei spiele.json im Repository ergänzt.' }),
]);

function beschreibungSpiel(s) {
  if (s.erfassungsmodus === 'nur_sieger') return 'nur Sieger, keine Punkte';
  const richtung = s.wertungsrichtung === 'hoechste' ? 'höchste Summe gewinnt' : 'niedrigste Summe gewinnt';
  const modus = s.erfassungsmodus === 'punkte_fortlaufend' ? 'Punkte je Zug' : 'Punkte je Runde';
  return `${modus}, ${richtung}`;
}

// --- Partiestart ---------------------------------------------------------

const entwurf = { spielId: null, teilnehmer: [], endbedingung: null };

registriereAnsicht('partiestart', ({ spielId }) => {
  const def = spieleZurAuswahl().find((s) => s.id === spielId);
  if (!def) return [kopf('Spiel nicht gefunden', null, () => navigiere('start'))];

  if (entwurf.spielId !== spielId) {
    entwurf.spielId = spielId;
    entwurf.teilnehmer = (zustand.meta[`letzte_teilnehmer_${spielId}`] || []).filter((id) => {
      const s = zustand.spieler.get(id);
      return s && s.aktiv;
    });
    entwurf.endbedingung = endbedingungVorschlag(def, zustand.meta[`letzte_endbedingung_${spielId}`]);
  }

  const uebrige = aktiveSpieler(zustand.spieler).filter((s) => !entwurf.teilnehmer.includes(s.id));

  const verschieben = (index, richtung) => {
    const ziel = index + richtung;
    if (ziel < 0 || ziel >= entwurf.teilnehmer.length) return;
    const liste = entwurf.teilnehmer;
    [liste[index], liste[ziel]] = [liste[ziel], liste[index]];
    zeichne();
  };

  const anzahl = entwurf.teilnehmer.length;
  const zuWenig = def.spieler_min && anzahl < def.spieler_min;
  const zuViele = def.spieler_max && anzahl > def.spieler_max;

  return [
    kopf(def.name, 'Mitspieler und Ende festlegen', () => history.back()),

    kachel(
      h('h2', { text: `Mitspieler in Erfassungsreihenfolge (${anzahl})` }),
      anzahl === 0
        ? h('p', { klasse: 'sekundaer', text: 'Noch niemand gewählt. Unten antippen, um Spieler hinzuzufügen.' })
        : h(
            'ul',
            { klasse: 'liste', style: 'margin:0 -16px' },
            ...entwurf.teilnehmer.map((id, index) =>
              h(
                'li',
                {},
                h(
                  'div',
                  { klasse: 'wahl statisch' },
                  h('span', { klasse: 'reihenfolge zahl', text: String(index + 1) }),
                  h('span', { klasse: 'haupt', text: nameVon(id) }),
                  h(
                    'span',
                    { klasse: 'schieber' },
                    h('button', { onclick: () => verschieben(index, -1), disabled: index === 0, 'aria-label': 'Nach oben' }, '▲'),
                    h('button', { onclick: () => verschieben(index, 1), disabled: index === anzahl - 1, 'aria-label': 'Nach unten' }, '▼'),
                    h('button', {
                      onclick: () => { entwurf.teilnehmer.splice(index, 1); zeichne(); },
                      'aria-label': 'Entfernen',
                    }, '✕')
                  )
                )
              )
            )
          ),
      zuWenig ? h('p', { klasse: 'hinweis', style: 'margin-top:12px',
        text: `${def.name} ist für mindestens ${def.spieler_min} Spieler gedacht. Starten ist trotzdem möglich.` }) : null,
      zuViele ? h('p', { klasse: 'hinweis', style: 'margin-top:12px',
        text: `${def.name} ist für höchstens ${def.spieler_max} Spieler gedacht. Starten ist trotzdem möglich.` }) : null
    ),

    kachel(
      h('h2', { text: 'Hinzufügen' }),
      uebrige.length
        ? h(
            'ul',
            { klasse: 'liste', style: 'margin:0 -16px' },
            ...uebrige.map((s) =>
              h('li', {}, h(
                'button',
                { klasse: 'wahl', onclick: () => { entwurf.teilnehmer.push(s.id); zeichne(); } },
                h('span', { klasse: 'haken', text: '+' }),
                h('span', { klasse: 'haupt', text: s.name })
              ))
            )
          )
        : h('p', { klasse: 'sekundaer', text: 'Alle vorhandenen Spieler sind schon dabei.' }),
      h('div', { style: 'margin-top:12px' },
        taste('Neuer Spieler', async () => {
          const id = await spielerAnlegen();
          if (id && !entwurf.teilnehmer.includes(id)) entwurf.teilnehmer.push(id);
          zeichne();
        }, 'rand-akzent'))
    ),

    endbedingungKachel(def),

    kachel(
      taste('Partie starten', () => partieStarten(def), 'haupt'),
      h('div', { style: 'margin-top:10px' }, infoTaste(def)),
      h('p', { klasse: 'klein', style: 'margin-top:10px',
        text: def.hinweis_erfassung || 'Der Startzeitpunkt wird automatisch festgehalten.' })
    ),
  ];
});

function endbedingungKachel(def) {
  if (def.endbedingung === 'manuell') {
    return kachel(
      h('h2', { text: 'Ende' }),
      h('p', { klasse: 'sekundaer', text: 'Diese Partie endet, wenn du sie beendest.' })
    );
  }

  const eb = entwurf.endbedingung;
  const waehlbar = def.endbedingung === 'waehlbar';

  const zahlFeld = h('input', {
    type: 'number', inputmode: 'numeric', min: '1',
    value: String(eb.typ === 'rundenzahl' ? eb.wert : (def.rundenzahl_vorbelegung ?? 5)),
    onchange: (e) => { entwurf.endbedingung = { typ: 'rundenzahl', wert: Math.max(1, Number(e.target.value) || 1) }; },
  });

  const umschalter = waehlbar
    ? h(
        'div',
        { klasse: 'tastenreihe', style: 'margin-bottom:12px' },
        taste('Feste Rundenzahl', () => {
          entwurf.endbedingung = { typ: 'rundenzahl', wert: def.rundenzahl_vorbelegung ?? 5 };
          zeichne();
        }, eb.typ === 'rundenzahl' ? 'haupt' : ''),
        taste(`Schwelle ${def.schwellwert}`, () => {
          entwurf.endbedingung = { typ: 'schwelle', wert: def.schwellwert };
          zeichne();
        }, eb.typ === 'schwelle' ? 'haupt' : '')
      )
    : null;

  return kachel(
    h('h2', { text: 'Ende' }),
    umschalter,
    eb.typ === 'rundenzahl'
      ? h('label', { klasse: 'feld' }, h('span', { klasse: 'bezeichnung', text: 'Anzahl Runden' }), zahlFeld)
      : h('p', { klasse: 'sekundaer',
          text: `Die Partie endet, sobald jemand ${def.schwellwert} erreicht. Gewonnen hat dann die ` +
            `${def.wertungsrichtung === 'hoechste' ? 'höchste' : 'niedrigste'} Gesamtsumme.` })
  );
}

async function partieStarten(def) {
  if (!entwurf.teilnehmer.length) { meldung('Bitte mindestens einen Mitspieler wählen.'); return; }

  const partieId = neueId();
  const endbedingung = def.endbedingung === 'manuell'
    ? { typ: 'manuell', wert: null }
    : entwurf.endbedingung;

  await schreibe('partie_gestartet', {
    id: partieId,
    spiel_id: def.id,
    spiel_version: def.version || 1,
    spiel_name: def.name,
    teilnehmer: [...entwurf.teilnehmer],
    endbedingung,
    start_zeitpunkt: new Date().toISOString(),
  });
  await merke(`letzte_teilnehmer_${def.id}`, [...entwurf.teilnehmer]);
  if (def.endbedingung !== 'manuell') await merke(`letzte_endbedingung_${def.id}`, endbedingung);

  navigiere('erfassung', { partieId });
}

/** Schnellstart: gleiche Spieler, gleiche Endbedingung (Konzept 6.5). */
export async function nochmal(altePartie) {
  const def = definitionFuer(altePartie.spiel_id, altePartie.spiel_version);
  const partieId = neueId();
  await schreibe('partie_gestartet', {
    id: partieId,
    spiel_id: altePartie.spiel_id,
    spiel_version: def ? def.version || 1 : altePartie.spiel_version,
    spiel_name: altePartie.spiel_name,
    teilnehmer: [...altePartie.teilnehmer],
    endbedingung: { ...altePartie.endbedingung },
    start_zeitpunkt: new Date().toISOString(),
  });
  navigiere('erfassung', { partieId });
}

// --- Erfassung -----------------------------------------------------------

const erfassung = { partieId: null, korrekturZelle: null, endeIgnoriert: null };

registriereAnsicht('erfassung', ({ partieId }) => {
  const partie = zustand.partien.get(partieId);
  if (!partie) return [kopf('Partie nicht gefunden', null, () => navigiere('start'))];
  const def = definitionFuer(partie.spiel_id, partie.spiel_version);
  if (!def) {
    return [
      kopf(partie.spiel_name || 'Partie', null, () => navigiere('start')),
      kachel(h('p', { klasse: 'hinweis',
        text: 'Zu dieser Partie fehlt die Spieldefinition in spiele.json. Die Partie kann nicht weitergeführt werden.' })),
    ];
  }

  if (erfassung.partieId !== partieId) {
    erfassung.partieId = partieId;
    erfassung.korrekturZelle = null;
    erfassung.endeIgnoriert = null;
  }

  document.body.classList.toggle('viele-spieler', partie.teilnehmer.length >= 4);

  if (def.erfassungsmodus === 'blatt_calavera') return erfassungBlatt(partie, def);
  if (def.erfassungsmodus === 'nur_sieger') return erfassungNurSieger(partie, def);
  if (def.erfassungsmodus === 'punkte_fortlaufend') return erfassungFortlaufend(partie, def);
  return erfassungRundenblock(partie, def);
});

function erfassungKopf(partie, def) {
  return kopf(
    partie.spiel_name || def.name,
    `${partie.teilnehmer.length} Spieler · ${endbedingungText(partie.endbedingung)}` +
      (partie.status === 'beendet' ? ' · beendet' : ''),
    () => navigiere('start')
  );
}

export async function partieAbbrechen(partie) {
  const sicher = await frage(
    'Partie abbrechen?',
    'Die Partie wird ohne Sieger festgehalten und zählt in keiner Auswertung mit. Die erfassten Werte bleiben erhalten.',
    'Abbrechen bestätigen'
  );
  if (!sicher) return;
  await schreibe('partie_abgebrochen', { partie_id: partie.id, end_zeitpunkt: new Date().toISOString() });
  meldung('Partie abgebrochen.');
  navigiere('start');
}

function abbrechenTaste(partie) {
  return taste('Partie abbrechen', () => partieAbbrechen(partie), 'schmal');
}

// Modus nur_sieger ---------------------------------------------------------

function erfassungNurSieger(partie, def) {
  return [
    erfassungKopf(partie, def),
    kachel(
      h('h2', { text: 'Mitspieler' }),
      h('ul', { klasse: 'liste', style: 'margin:0 -16px -16px' },
        ...partie.teilnehmer.map((id) =>
          h('li', {}, h('div', { klasse: 'eintrag statisch' },
            h('span', { klasse: 'haupt', text: nameVon(id) })))))
    ),
    kachel(
      h('p', { klasse: 'sekundaer', text: 'Während des Spiels wird nichts erfasst. Am Ende den Sieger antippen.' }),
      h('div', { klasse: 'tastenreihe', style: 'margin-top:12px' },
        infoTaste(def, 'schmal'),
        taste('Spiel beenden', () => siegerWaehlen(partie), 'haupt schmal'))
    ),
    kachel(abbrechenTaste(partie)),
  ];
}

async function siegerWaehlen(partie) {
  let gewaehlt = null;
  const liste = h('ul', { klasse: 'liste', style: 'margin:0 -16px' });
  const zeichneListe = () => {
    liste.replaceChildren(
      ...partie.teilnehmer.map((id) =>
        h('li', {}, h(
          'button',
          { klasse: 'wahl', 'aria-pressed': gewaehlt === id ? 'true' : 'false',
            onclick: () => { gewaehlt = id; zeichneListe(); } },
          h('span', { klasse: 'haken', text: '✓' }),
          h('span', { klasse: 'haupt', text: nameVon(id) })
        ))
      )
    );
  };
  zeichneListe();

  const ok = await dialog({
    titel: 'Wer hat gewonnen?',
    inhalt: liste,
    tasten: [
      { text: 'Abbrechen', wert: false },
      { text: 'Speichern', art: 'haupt', wert: true, pruefe: () => gewaehlt !== null },
    ],
  });
  if (!ok || !gewaehlt) return;

  await schreibe('partie_beendet', {
    partie_id: partie.id,
    end_zeitpunkt: new Date().toISOString(),
    sieger: [gewaehlt],
  });
  navigiere('ergebnis', { partieId: partie.id });
  abgleichStill().then((ergebnis) => { if (ergebnis && ergebnis.ok) zeichneSanft(); });
}

// Modus punkte_rundenblock ------------------------------------------------

function naechsteZelle(partie, stand) {
  const reihenfolge = reihenfolgeVon(partie);
  const runden = Math.max(stand.letzteSequenz, 0);
  for (let seq = 1; seq <= runden; seq++) {
    const zeile = stand.matrix.get(seq);
    for (const id of reihenfolge) {
      if (!zeile || !zeile.has(id)) return { sequenz: seq, spieler_id: id };
    }
  }
  return { sequenz: runden + 1, spieler_id: reihenfolge[0] };
}

function erfassungRundenblock(partie, def) {
  const spalten = spaltenVon(partie);
  const stand = berechneStand(def, spalten, partie.eintraege);
  const kurz = kurznamenFuer(spalten);
  const beendet = partie.status !== 'laufend';
  const zelle = erfassung.korrekturZelle || (beendet ? null : naechsteZelle(partie, stand));

  const ende = pruefeEnde(def, partie.endbedingung, stand);
  const signatur = `${stand.vollstaendigeRunden}|${[...stand.summen.values()].join(',')}`;
  const zeigeEnde = !beendet && ende.erreicht && erfassung.endeIgnoriert !== signatur;

  const bestandszelle = (stand.matrix.get(zelle ? zelle.sequenz : 0) || new Map())
    .get(zelle ? zelle.spieler_id : '');
  const tastatur = zelle
    ? zifferntastatur({
        negativErlaubt: def.vorzeichen === 'auch_negativ',
        anzeigeWer: () => `Runde ${zelle.sequenz} · ${nameVon(zelle.spieler_id)}`,
        startwert: bestandszelle ? bestandszelle.wert : '',
        markierungen: def.markierungen || [],
        startmarkierungen: bestandszelle ? bestandszelle.markierungen : {},
        uebernehmen: (wert, marken) => werteEintragen(partie, def, zelle, wert, marken),
      })
    : null;

  return [
    erfassungKopf(partie, def),

    partie.nachtraeglich_geaendert
      ? kachel(h('span', { klasse: 'marke', text: 'nachträglich geändert' }))
      : null,

    kachel(
      h('div', { klasse: 'matrix-huelle' }, matrixTabelle(partie, def, stand, kurz, zelle)),
      h('p', { klasse: 'klein', style: 'margin-top:10px',
        text: 'Eine Zelle antippen, um den Wert zu ändern.' })
    ),

    zeigeEnde
      ? kachel(h('div', { klasse: 'hinweis' },
          h('div', { text: `${ende.grund}. Partie beenden?` }),
          h('div', { klasse: 'tastenreihe', style: 'margin-top:10px' },
            taste('Weiterspielen', () => { erfassung.endeIgnoriert = signatur; zeichne(); }, 'schmal'),
            taste('Partie beenden', () => partieBeenden(partie, def), 'haupt schmal'))))
      : null,

    tastatur ? kachel(tastatur.element) : null,

    kachel(
      h('div', { klasse: 'tastenreihe' },
        infoTaste(def, 'schmal'),
        !beendet ? reihenfolgeTaste(partie) : null,
        beendet
          ? taste('Zum Ergebnis', () => navigiere('ergebnis', { partieId: partie.id }), 'haupt schmal')
          : taste('Partie beenden', () => partieBeenden(partie, def), 'haupt schmal')),
      !beendet ? h('div', { style: 'margin-top:10px' }, abbrechenTaste(partie)) : null
    ),
  ];
}

function matrixTabelle(partie, def, stand, kurz, aktiv) {
  const spalten = spaltenVon(partie);
  const runden = Math.max(stand.letzteSequenz, 1);
  const kopfmarken = (def.markierungen || []).filter((m) => m.in_kopfzeile);
  const zeilen = [];

  for (let seq = 1; seq <= runden; seq++) {
    const zeile = stand.matrix.get(seq) || new Map();
    zeilen.push(
      h('tr', {},
        h('th', { klasse: 'runde zahl', text: String(seq) }),
        ...spalten.map((id) => {
          const zellwert = zeile.get(id);
          const reset = stand.resets.find((r) => r.sequenz === seq && r.spieler_id === id);
          const istAktiv = aktiv && aktiv.sequenz === seq && aktiv.spieler_id === id;
          return h('td', {
            klasse: `zelle${zellwert ? '' : ' leer'}${istAktiv ? ' aktiv' : ''}`,
            onclick: () => { erfassung.korrekturZelle = { sequenz: seq, spieler_id: id }; zeichne(); },
          },
            h('span', { klasse: 'zahl', text: zellwert ? String(zellwert.wert) : '·' }),
            zellwert ? zellmarken(def, zellwert.markierungen) : null,
            reset ? h('span', { klasse: 'reset-marke', text: `${reset.von} → ${reset.nach}` }) : null);
        }))
    );
  }

  return h('table', { klasse: 'matrix' },
    h('thead', {}, h('tr', {},
      h('th', { klasse: 'runde', text: '' }),
      ...spalten.map((id) => h('th', { title: nameVon(id), text: kurz.get(id) })))),
    h('tbody', {}, ...zeilen),
    h('tfoot', {}, h('tr', { klasse: 'summe' },
      h('th', { klasse: 'runde', text: 'Σ' }),
      ...spalten.map((id) =>
        h('td', { klasse: 'zahl' },
          String(stand.summen.get(id) ?? 0),
          ...kopfmarken.map((m) => {
            const anzahl = (stand.markierungen.get(id) || {})[m.id] || 0;
            return anzahl
              ? h('span', { klasse: 'zellmarke', text: `${m.symbol}${anzahl > 1 ? anzahl : ''}` })
              : null;
          }))))));
}

/** Markierungen einer einzelnen Zelle, z. B. ★2 */
function zellmarken(def, markierungen) {
  const eintraege = Object.entries(markierungen || {}).filter(([, anzahl]) => anzahl > 0);
  if (!eintraege.length) return null;
  return h('span', { klasse: 'zellmarke' }, ...eintraege.map(([schluessel, anzahl]) => {
    const m = (def.markierungen || []).find((x) => x.id === schluessel);
    const symbol = m ? m.symbol : '•';
    return `${symbol}${anzahl > 1 ? anzahl : ''}`;
  }).join(' '));
}

let schreibtGerade = false;

async function werteEintragen(partie, def, zelle, wert, markierungen) {
  // Sperre gegen Doppeltippen: solange der vorige Wert noch geschrieben und
  // die Ansicht neu aufgebaut wird, werden weitere Eingaben verworfen.
  if (schreibtGerade) return;
  schreibtGerade = true;
  try {
    const pruefung = eingabeGueltig(def, wert);
    if (!pruefung.ok) { meldung(pruefung.meldung); return; }

    const stand = berechneStand(def, spaltenVon(partie), partie.eintraege);
    const bestand = (stand.matrix.get(zelle.sequenz) || new Map()).has(zelle.spieler_id);

    await schreibe(bestand ? 'eintrag_korrigiert' : 'eintrag_erfasst', {
      partie_id: partie.id,
      sequenz: zelle.sequenz,
      spieler_id: zelle.spieler_id,
      wert,
      markierungen: markierungen && Object.keys(markierungen).length ? markierungen : undefined,
    });

    erfassung.korrekturZelle = null;
    erfassung.endeIgnoriert = null;
    zeichne();
  } finally {
    schreibtGerade = false;
  }
}

// Modus punkte_fortlaufend ------------------------------------------------

function erfassungFortlaufend(partie, def) {
  const spalten = spaltenVon(partie);
  const reihenfolge = reihenfolgeVon(partie);
  const stand = berechneStand(def, spalten, partie.eintraege);
  const beendet = partie.status !== 'laufend';
  const zn = zugnummern(stand.matrix);

  // Wer ist als Naechstes dran? Der erste Spieler der aktuellen Reihenfolge,
  // der in der niedrigsten offenen Runde noch keinen Zug hat.
  const zugAnzahl = (id) => (zn.zug.get(id) ? zn.zug.get(id).size : 0);
  const naechster = reihenfolge.reduce(
    (bester, id) => (zugAnzahl(id) < zugAnzahl(bester) ? id : bester), reihenfolge[0]);

  const zelle = erfassung.korrekturZelle
    || (beendet ? null : { sequenz: stand.letzteSequenz + 1, spieler_id: naechster });

  const pl = platzierung(def, spalten, stand);
  const bestandszelle = zelle
    ? (stand.matrix.get(zelle.sequenz) || new Map()).get(zelle.spieler_id)
    : null;

  const tastatur = zelle
    ? zifferntastatur({
        negativErlaubt: def.vorzeichen === 'auch_negativ',
        anzeigeWer: () => `${nameVon(zelle.spieler_id)} · Zug ${
          bestandszelle ? zn.zug.get(zelle.spieler_id).get(zelle.sequenz) : zugAnzahl(zelle.spieler_id) + 1}`,
        startwert: bestandszelle ? bestandszelle.wert : '',
        markierungen: def.markierungen || [],
        startmarkierungen: bestandszelle ? bestandszelle.markierungen : {},
        uebernehmen: (wert, marken) => werteEintragen(partie, def, zelle, wert, marken),
      })
    : null;

  return [
    erfassungKopf(partie, def),

    partie.nachtraeglich_geaendert ? kachel(h('span', { klasse: 'marke', text: 'nachträglich geändert' })) : null,

    kachel(
      h('div', { klasse: 'matrix-huelle' }, zugRaster(partie, def, stand, zn, zelle)),
      h('p', { klasse: 'klein', style: 'margin-top:10px',
        text: 'Zeile n zeigt den n-ten Zug jedes Spielers. Eine Zelle antippen, um sie zu ändern.' })
    ),

    tastatur ? kachel(tastatur.element) : null,

    kachel(
      h('h2', { text: 'Stand' }),
      h('table', { klasse: 'daten' },
        h('thead', {}, h('tr', {},
          h('th', { text: 'Platz' }), h('th', { text: 'Spieler' }), h('th', { text: 'Punkte' }))),
        h('tbody', {}, ...pl.liste.map((z) =>
          h('tr', {},
            h('td', { klasse: 'zahl', text: String(z.platz) }),
            h('td', { text: nameVon(z.spieler_id) }),
            h('td', { klasse: 'zahl', text: String(z.summe) })))))
    ),

    kachel(
      h('div', { klasse: 'tastenreihe' },
        infoTaste(def, 'schmal'),
        !beendet ? reihenfolgeTaste(partie) : null,
        beendet
          ? taste('Zum Ergebnis', () => navigiere('ergebnis', { partieId: partie.id }), 'haupt schmal')
          : taste('Spiel beenden', () => partieBeenden(partie, def), 'haupt schmal')),
      !beendet ? h('div', { style: 'margin-top:10px' }, abbrechenTaste(partie)) : null
    ),
  ];
}

/**
 * Rundenraster fuer die fortlaufende Erfassung (Konzept 6.4):
 * Zeile n enthaelt den n-ten Zug jedes Spielers. Die letzte Zeile darf
 * unvollstaendig sein — das Spiel endet mitten in einer Runde.
 */
function zugRaster(partie, def, stand, zn, aktiv) {
  const spalten = spaltenVon(partie);
  const kurz = kurznamenFuer(spalten);
  const kopfmarken = (def.markierungen || []).filter((m) => m.in_kopfzeile);
  const runden = Math.max(zn.runden, 1);
  // Die nächste, noch leere Zelle bekommt eine eigene Zeile, wenn die
  // laufende Runde für diesen Spieler schon voll ist.
  const zeilenAnzahl = aktiv && !aktiv.bestand
    ? Math.max(runden, ...spalten.map((id) => (zn.zug.get(id) ? zn.zug.get(id).size : 0) + 1))
    : runden;

  const zeilen = [];
  for (let runde = 1; runde <= zeilenAnzahl; runde++) {
    zeilen.push(h('tr', {},
      h('th', { klasse: 'runde zahl', text: String(runde) }),
      ...spalten.map((id) => {
        const seq = zn.sequenz.get(id) ? zn.sequenz.get(id).get(runde) : undefined;
        const zellwert = seq !== undefined ? stand.matrix.get(seq).get(id) : null;
        const naechsteRunde = (zn.zug.get(id) ? zn.zug.get(id).size : 0) + 1;
        const istAktiv = aktiv && aktiv.spieler_id === id &&
          (seq !== undefined ? aktiv.sequenz === seq : runde === naechsteRunde);

        return h('td', {
          klasse: `zelle${zellwert ? '' : ' leer'}${istAktiv ? ' aktiv' : ''}`,
          onclick: seq === undefined ? null : () => {
            erfassung.korrekturZelle = { sequenz: seq, spieler_id: id };
            zeichne();
          },
        },
          h('span', { klasse: 'zahl', text: zellwert ? String(zellwert.wert) : '·' }),
          zellwert ? zellmarken(def, zellwert.markierungen) : null);
      })));
  }

  return h('table', { klasse: 'matrix' },
    h('thead', {}, h('tr', {},
      h('th', { klasse: 'runde', text: '' }),
      ...spalten.map((id) => h('th', { title: nameVon(id), text: kurz.get(id) })))),
    h('tbody', {}, ...zeilen),
    h('tfoot', {}, h('tr', { klasse: 'summe' },
      h('th', { klasse: 'runde', text: 'Σ' }),
      ...spalten.map((id) =>
        h('td', { klasse: 'zahl' },
          String(stand.summen.get(id) ?? 0),
          ...kopfmarken.map((m) => {
            const anzahl = (stand.markierungen.get(id) || {})[m.id] || 0;
            return anzahl
              ? h('span', { klasse: 'zellmarke', text: `${m.symbol}${anzahl > 1 ? anzahl : ''}` })
              : null;
          }))))));
}

// --- Erfassungsreihenfolge aendern (Konzept 6.5) -------------------------

function reihenfolgeTaste(partie) {
  return taste('Reihenfolge', () => reihenfolgeAendern(partie), 'schmal');
}

async function reihenfolgeAendern(partie) {
  const liste = [...reihenfolgeVon(partie)];
  const behaelter = h('ul', { klasse: 'liste', style: 'margin:0 -16px' });

  const zeichneListe = () => {
    behaelter.replaceChildren(...liste.map((id, index) =>
      h('li', {}, h('div', { klasse: 'wahl statisch' },
        h('span', { klasse: 'reihenfolge zahl', text: String(index + 1) }),
        h('span', { klasse: 'haupt', text: nameVon(id) }),
        h('span', { klasse: 'schieber' },
          h('button', {
            onclick: () => { if (index > 0) { [liste[index - 1], liste[index]] = [liste[index], liste[index - 1]]; zeichneListe(); } },
            disabled: index === 0, 'aria-label': 'Nach oben',
          }, '▲'),
          h('button', {
            onclick: () => { if (index < liste.length - 1) { [liste[index + 1], liste[index]] = [liste[index], liste[index + 1]]; zeichneListe(); } },
            disabled: index === liste.length - 1, 'aria-label': 'Nach unten',
          }, '▼'))))));
  };
  zeichneListe();

  const ok = await dialog({
    titel: 'Reihenfolge ändern',
    inhalt: [
      h('p', { klasse: 'sekundaer', text:
        'Gilt ab dem nächsten Zug. Bereits erfasste Werte bleiben unverändert; ' +
        'die Spalten der Matrix behalten ihre Anordnung.' }),
      behaelter,
    ],
    tasten: [
      { text: 'Abbrechen', wert: false },
      { text: 'Übernehmen', art: 'haupt', wert: true },
    ],
  });
  if (!ok) return;

  const vorher = reihenfolgeVon(partie).join(',');
  if (liste.join(',') === vorher) return;
  await schreibe('reihenfolge_geaendert', { partie_id: partie.id, reihenfolge: liste });
  meldung('Reihenfolge geändert.');
  zeichne();
}

// --- Beenden -------------------------------------------------------------

async function partieBeenden(partie, def) {
  if (def.erfassungsmodus === 'blatt_calavera') return blattPartieBeenden(partie, def);

  const stand = berechneStand(def, spaltenVon(partie), partie.eintraege);
  const pl = platzierung(def, spaltenVon(partie), stand);

  if (stand.sequenzen.length === 0) {
    const sicher = await frage('Ohne Werte beenden?',
      'Es ist noch kein Wert erfasst. Ohne Werte ist das Ergebnis ein Gleichstand aller Spieler.',
      'Trotzdem beenden');
    if (!sicher) return;
  }

  await schreibe('partie_beendet', {
    partie_id: partie.id,
    end_zeitpunkt: new Date().toISOString(),
    sieger: pl.sieger,
  });
  navigiere('ergebnis', { partieId: partie.id });
  // Abgleich im Hintergrund, damit der Stand die anderen Geräte erreicht.
  abgleichStill().then((ergebnis) => { if (ergebnis && ergebnis.ok) zeichneSanft(); });
}

/** Beenden im Blattmodus: erst prüfen, ob alle fertig sind. */
async function blattPartieBeenden(partie, def) {
  const alle = blaetter(def, partie);
  const offen = partie.teilnehmer.filter((id) => !(alle.get(id) || {}).fertig);
  if (offen.length) {
    const trotzdem = await frage(
      'Noch nicht alle fertig',
      `${offen.map(nameVon).join(', ')} ${offen.length === 1 ? 'hat' : 'haben'} das Blatt noch ` +
        'nicht als fertig gemeldet. Fehlende Stände können später noch dazukommen; die ' +
        'Auswertung rechnet dann neu.',
      'Trotzdem beenden'
    );
    if (!trotzdem) return;
  }

  const konflikte = bonusKonflikte(def, alle);
  if (konflikte.length) {
    const weiter = await frage(
      'Bonus mehrfach beansprucht',
      konflikte.map((k) => `Linie ${k.linie}: ${k.spieler.map(nameVon).join(' und ')}`).join('; ') +
        ' — jeweils als Erster eingetragen. Das sollte am Tisch geklärt und im Blatt ' +
        'berichtigt werden.',
      'Trotzdem beenden'
    );
    if (!weiter) return;
  }

  const erg = ergebnis(def, partie);
  await schreibe('partie_beendet', {
    partie_id: partie.id,
    end_zeitpunkt: new Date().toISOString(),
    sieger: erg.sieger,
  });
  navigiere('ergebnis', { partieId: partie.id });
  abgleichStill().then((e) => { if (e && e.ok) zeichneSanft(); });
}

// --- Ergebnis ------------------------------------------------------------

registriereAnsicht('ergebnis', ({ partieId }) => {
  const partie = zustand.partien.get(partieId);
  if (!partie) return [kopf('Partie nicht gefunden', null, () => navigiere('start'))];
  const def = definitionFuer(partie.spiel_id, partie.spiel_version);
  const erg = ergebnis(def, partie);
  const kurz = kurznamenFuer(spaltenVon(partie));

  const siegerText = erg.sieger.length === 0
    ? 'Kein Sieger festgehalten'
    : erg.sieger.length === 1
      ? `${nameVon(erg.sieger[0])} gewinnt`
      : `Gleichstand: ${erg.sieger.map(nameVon).join(', ')}`;

  return [
    kopf(partie.spiel_name || (def && def.name) || 'Ergebnis',
      `${datumZeit(partie.start_zeitpunkt)} · ${endbedingungText(partie.endbedingung)}`,
      () => navigiere('start')),

    kachel(
      h('h2', { text: siegerText }),
      partie.sieger_manuell ? h('p', { klasse: 'klein', text: 'Sieger am Tisch festgelegt.' }) : null,
      partie.nachtraeglich_geaendert
        ? h('p', { style: 'margin-top:8px' }, h('span', { klasse: 'marke', text: 'nachträglich geändert' }))
        : null,
      erg.punkte
        ? h('table', { klasse: 'daten', style: 'margin-top:10px' },
            h('thead', {}, h('tr', {},
              h('th', { text: 'Platz' }), h('th', { text: 'Spieler' }), h('th', { text: 'Punkte' }))),
            h('tbody', {}, ...erg.liste.map((z) =>
              h('tr', {},
                h('td', { klasse: 'zahl', text: String(z.platz) }),
                h('td', { text: nameVon(z.spieler_id) }),
                h('td', { klasse: 'zahl', text: String(z.summe) })))))
        : h('ul', { klasse: 'liste', style: 'margin:10px -16px 0' },
            ...partie.teilnehmer.map((id) =>
              h('li', {}, h('div', { klasse: 'eintrag statisch' },
                h('span', { klasse: 'haupt', text: nameVon(id) }),
                erg.sieger.includes(id) ? h('span', { klasse: 'marke', text: 'Sieger' }) : null))))
    ),

    erg.gleichstand
      ? kachel(h('div', { klasse: 'hinweis' },
          h('div', { text: 'Geteilter erster Platz. Wenn am Tisch anders entschieden wurde, kann hier ein Sieger festgelegt werden.' }),
          h('div', { style: 'margin-top:10px' }, taste('Sieger festlegen', () => siegerFestlegen(partie, erg), 'haupt schmal'))))
      : null,

    erg.punkte && def && def.erfassungsmodus === 'blatt_calavera'
      ? kachel(
          h('h2', { text: 'Blätter' }),
          h('table', { klasse: 'daten' },
            h('thead', {}, h('tr', {},
              h('th', { text: 'Spieler' }),
              // Farbpunkte statt abgekürzter Namen — dieselbe Kennzeichnung
              // wie auf dem Blatt selbst.
              ...def.blatt.farben.map((f) =>
                h('th', { title: f.name },
                  h('span', { klasse: 'farbpunkt klein', style: `background:${f.farbe}` }))),
              h('th', { text: 'Bonus' }),
              h('th', { text: 'Σ' }))),
            h('tbody', {}, ...partie.teilnehmer.map((id) => {
              const w = blattPunkte(def, erg.blaetter.get(id), bonusVerteilung(def, partie).get(id), true);
              return h('tr', {},
                h('td', { text: nameVon(id) }),
                ...def.blatt.farben.map((f) => h('td', { klasse: 'zahl', text: String(w.reihen[f.id]) })),
                h('td', { klasse: 'zahl', text: String(w.bonus) }),
                h('td', { klasse: 'zahl', text: String(w.gesamt) }));
            })))
        )
      : null,

    erg.punkte && def && def.erfassungsmodus !== 'blatt_calavera'
      ? kachel(
          h('h2', { text: 'Verlauf' }),
          h('div', { klasse: 'matrix-huelle' },
            matrixTabelle(partie, def, erg.stand, kurz, null)),
          h('p', { klasse: 'klein', style: 'margin-top:10px',
            text: 'Eine Zelle antippen, um sie zu korrigieren. Summen und Sieger werden neu berechnet.' })
        )
      : null,

    kachel(
      def && def.schnellstart_wiederholung
        ? h('div', { style: 'margin-bottom:10px' }, taste('Nochmal, gleiche Spieler', () => nochmal(partie), 'haupt'))
        : null,
      taste('Zum Start', () => navigiere('start'))
    ),
  ];
});


async function siegerFestlegen(partie, erg) {
  let gewaehlt = null;
  const liste = h('ul', { klasse: 'liste', style: 'margin:0 -16px' });
  const zeichneListe = () => {
    liste.replaceChildren(
      ...erg.liste.filter((z) => z.platz === 1).map((z) =>
        h('li', {}, h('button', {
          klasse: 'wahl', 'aria-pressed': gewaehlt === z.spieler_id ? 'true' : 'false',
          onclick: () => { gewaehlt = z.spieler_id; zeichneListe(); },
        },
          h('span', { klasse: 'haken', text: '✓' }),
          h('span', { klasse: 'haupt', text: nameVon(z.spieler_id) })))));
  };
  zeichneListe();

  const ok = await dialog({
    titel: 'Sieger festlegen',
    inhalt: liste,
    tasten: [
      { text: 'Abbrechen', wert: false },
      { text: 'Speichern', art: 'haupt', wert: true, pruefe: () => gewaehlt !== null },
    ],
  });
  if (!ok || !gewaehlt) return;
  await schreibe('sieger_gesetzt', { partie_id: partie.id, sieger: [gewaehlt] });
  meldung(`${nameVon(gewaehlt)} als Sieger festgehalten.`);
  zeichne();
}

// Die Blattansicht braucht Zugriff auf Beenden und Abbrechen.
setzeAbschlussHandler({ beenden: blattPartieBeenden, abbrechen: partieAbbrechen });
