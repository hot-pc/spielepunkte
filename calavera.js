// Calavera (moses.) — jeder Spieler führt sein eigenes Blatt auf seinem Gerät.
//
// Regelgrundlage: Vier Farbreihen mit je 13 Feldern. Eine Reihe zählt so viele
// Punkte, wie das am weitesten rechts gesetzte Kreuz angibt. Kreuze werden
// lückenlos von links gesetzt, deshalb genügt je Farbe die erreichte Position.
// Wer in die Todeszone kreuzt, friert die Reihe sofort ein. Für jede der drei
// roten Linien gibt es Bonuspunkte, wenn alle vier Farben sie erreicht haben —
// mehr für den ersten Spieler, weniger für alle danach.

import { zustand, schreibe, zeichne, merke, nameVon, abgleichStill, zeichneSanft } from './kern.js';
import { h, kachel, kopf, taste, meldung, dialog, frage } from './ui.js';

// --- Zustand eines Blattes ----------------------------------------------

/** Leeres Blatt nach dem Aufbau der Definition. */
function leeresBlatt(def) {
  const farben = {};
  for (const f of def.blatt.farben) farben[f.id] = { felder: 0, eingefroren: false };
  return { farben, bonus: {}, fertig: false };
}

/**
 * Blätter aller Teilnehmer aus den Ereignissen der Partie.
 * @returns {Map<string, object>} spieler_id -> Blatt
 */
export function blaetter(def, partie) {
  const alle = new Map(partie.teilnehmer.map((id) => [id, leeresBlatt(def)]));
  for (const e of partie.blatt || []) {
    if (!alle.has(e.spieler_id)) alle.set(e.spieler_id, leeresBlatt(def));
    const blatt = alle.get(e.spieler_id);
    if (e.art === 'stand') {
      blatt.farben[e.farbe] = { felder: e.felder, eingefroren: !!e.eingefroren };
    } else if (e.art === 'bonus') {
      blatt.bonus[e.linie] = e.status;
    } else if (e.art === 'fertig') {
      blatt.fertig = !!e.fertig;
    }
  }
  return alle;
}

/** Ist eine Bonuslinie erreicht? Alle vier Farben müssen sie erreicht haben. */
export function linieErreicht(def, blatt, linie) {
  return def.blatt.farben.every((f) => (blatt.farben[f.id]?.felder || 0) >= linie.ab_feld);
}

/**
 * Wann hat wer welche Linie erreicht?
 *
 * Die Stand-Ereignisse der Partie werden chronologisch nachgespielt. Sobald
 * bei einem Spieler alle vier Farben den Stand der Linie erreicht haben, wird
 * der Zeitpunkt dieses Ereignisses festgehalten. Nimmt jemand ein Kreuz später
 * zurück, verfällt der Zeitpunkt wieder — sonst zählte ein Erfassungsfehler
 * als Erstplatzierung.
 *
 * @returns {Map<string, Map<number, string>>} spieler_id -> linie -> Zeitpunkt
 */
export function erreichtZeitpunkte(def, partie) {
  const staende = new Map(partie.teilnehmer.map((id) => [id, {}]));
  const zeitpunkte = new Map(partie.teilnehmer.map((id) => [id, new Map()]));

  const sortiert = [...(partie.blatt || [])]
    .filter((e) => e.art === 'stand')
    .sort((a, b) => (a.zeit < b.zeit ? -1 : a.zeit > b.zeit ? 1 : 0));

  for (const e of sortiert) {
    if (!staende.has(e.spieler_id)) {
      staende.set(e.spieler_id, {});
      zeitpunkte.set(e.spieler_id, new Map());
    }
    staende.get(e.spieler_id)[e.farbe] = e.felder;

    const stand = staende.get(e.spieler_id);
    const meine = zeitpunkte.get(e.spieler_id);
    for (const linie of def.blatt.linien) {
      const erfuellt = def.blatt.farben.every((f) => (stand[f.id] || 0) >= linie.ab_feld);
      if (erfuellt && !meine.has(linie.nr)) meine.set(linie.nr, e.zeit);
      if (!erfuellt && meine.has(linie.nr)) meine.delete(linie.nr);
    }
  }
  return zeitpunkte;
}

/**
 * Bonus je Spieler und Linie automatisch verteilen: Wer eine Linie als Erster
 * erreicht hat, bekommt den höheren Wert, alle danach den niedrigeren.
 * Grundlage ist die Reihenfolge der Eingaben, die bei laufendem Abgleich der
 * Reihenfolge am Tisch entspricht.
 *
 * @returns {Map<string, Map<number, {status: string, zeit: string}>>}
 */
export function bonusVerteilung(def, partie) {
  const zeitpunkte = erreichtZeitpunkte(def, partie);
  const ergebnis = new Map([...zeitpunkte.keys()].map((id) => [id, new Map()]));

  for (const linie of def.blatt.linien) {
    const erreicht = [...zeitpunkte.entries()]
      .filter(([, meine]) => meine.has(linie.nr))
      .map(([id, meine]) => ({ id, zeit: meine.get(linie.nr) }))
      .sort((a, b) => (a.zeit < b.zeit ? -1 : a.zeit > b.zeit ? 1 : a.id < b.id ? -1 : 1));

    erreicht.forEach((eintrag, index) => {
      ergebnis.get(eintrag.id).set(linie.nr, {
        status: index === 0 ? 'erster' : 'nachfolger',
        zeit: eintrag.zeit,
      });
    });
  }
  return ergebnis;
}

/** Punkte eines Blattes: vier Reihen plus Bonus.
 *  `automatik` ist die von der App ermittelte Verteilung für diesen Spieler;
 *  ein von Hand gesetzter Status hat immer Vorrang. */
export function punkte(def, blatt, automatik = null) {
  const werte = def.blatt.punkte_je_feld;
  const reihen = {};
  let summeReihen = 0;
  for (const f of def.blatt.farben) {
    const stand = blatt.farben[f.id]?.felder || 0;
    const wert = stand > 0 ? werte[stand - 1] : 0;
    reihen[f.id] = wert;
    summeReihen += wert;
  }

  let bonus = 0;
  const bonusZeilen = [];
  for (const linie of def.blatt.linien) {
    const vonHand = blatt.bonus[linie.nr];
    const ermittelt = automatik && automatik.get(linie.nr) ? automatik.get(linie.nr).status : 'keiner';
    const status = vonHand || ermittelt;
    const wert = status === 'erster' ? linie.erster : status === 'nachfolger' ? linie.nachfolger : 0;
    bonus += wert;
    bonusZeilen.push({
      linie, status, wert,
      erreicht: linieErreicht(def, blatt, linie),
      vonHand: !!vonHand,
      ermittelt,
    });
  }

  return { reihen, summeReihen, bonus, bonusZeilen, gesamt: summeReihen + bonus };
}

/** Wer beansprucht dieselbe Linie mehrfach als Erster? */
export function bonusKonflikte(def, alleBlaetter) {
  const konflikte = [];
  for (const linie of def.blatt.linien) {
    // Nur von Hand gesetzte Einträge können sich widersprechen; die
    // automatische Verteilung vergibt den ersten Platz genau einmal.
    const erste = [...alleBlaetter.entries()]
      .filter(([, blatt]) => blatt.bonus[linie.nr] === 'erster')
      .map(([id]) => id);
    if (erste.length > 1) konflikte.push({ linie: linie.nr, spieler: erste });
  }
  return konflikte;
}

// --- Welcher Spieler bin ich? -------------------------------------------

export function meinSpieler() {
  return zustand.meta.mein_spieler || null;
}

async function waehleMeinenSpieler(partie) {
  let gewaehlt = meinSpieler();
  const liste = h('ul', { klasse: 'liste', style: 'margin:0 -16px' });
  const zeichneListe = () => {
    liste.replaceChildren(
      ...partie.teilnehmer.map((id) =>
        h('li', {}, h('button', {
          klasse: 'wahl', 'aria-pressed': gewaehlt === id ? 'true' : 'false',
          onclick: () => { gewaehlt = id; zeichneListe(); },
        },
          h('span', { klasse: 'haken', text: '✓' }),
          h('span', { klasse: 'haupt', text: nameVon(id) }))))
    );
  };
  zeichneListe();

  const ok = await dialog({
    titel: 'Welches Blatt führst du?',
    inhalt: [
      h('p', { klasse: 'sekundaer', text:
        'Auf diesem Gerät wird nur dein eigenes Blatt erfasst. Die Blätter der anderen ' +
        'kommen beim Abgleich dazu.' }),
      liste,
    ],
    tasten: [
      { text: 'Abbrechen', wert: false },
      { text: 'Das bin ich', art: 'haupt', wert: true, pruefe: () => gewaehlt !== null },
    ],
  });
  if (!ok || !gewaehlt) return null;
  await merke('mein_spieler', gewaehlt);
  return gewaehlt;
}

// --- Schreiben ------------------------------------------------------------

async function setzeStand(partie, spielerId, farbeId, felder, eingefroren) {
  await schreibe('blatt_stand_gesetzt', {
    partie_id: partie.id, spieler_id: spielerId, farbe: farbeId, felder, eingefroren,
  });
  zeichne();
  abgleichNachEingabe();
}

async function setzeBonus(partie, spielerId, linieNr, status) {
  await schreibe('blatt_bonus_gesetzt', {
    partie_id: partie.id, spieler_id: spielerId, linie: linieNr, status: status || null,
  });
  zeichne();
}

// --- Laufender Abgleich während der Partie -------------------------------

let abgleichUhr = null;
let abgleichBald = null;

/**
 * Solange ein Blatt offen ist, werden die Stände regelmäßig ausgetauscht.
 * Nur so kann die App bestimmen, wer eine Bonuslinie zuerst erreicht hat.
 */
function haltAbgleichAmLaufen(partieId) {
  if (abgleichUhr) return;
  abgleichUhr = setInterval(() => {
    const ansicht = zustand.ansicht;
    if (ansicht.name !== 'erfassung' || ansicht.p.partieId !== partieId) {
      clearInterval(abgleichUhr);
      abgleichUhr = null;
      return;
    }
    abgleichStill().then((ergebnis) => { if (ergebnis && ergebnis.ok && ergebnis.neu) zeichneSanft(); });
  }, 20000);
}

/** Nach einer Eingabe bündeln, statt bei jedem Kreuz sofort zu schreiben. */
function abgleichNachEingabe() {
  clearTimeout(abgleichBald);
  abgleichBald = setTimeout(() => {
    abgleichStill().then((ergebnis) => { if (ergebnis && ergebnis.ok && ergebnis.neu) zeichneSanft(); });
  }, 4000);
}

// --- Ansicht --------------------------------------------------------------

export function erfassungBlatt(partie, def) {
  const ich = meinSpieler();
  const alle = blaetter(def, partie);
  const verteilung = bonusVerteilung(def, partie);
  const beendet = partie.status !== 'laufend';
  if (!beendet) haltAbgleichAmLaufen(partie.id);

  if (!ich || !partie.teilnehmer.includes(ich)) {
    return [
      kopf(partie.spiel_name || def.name, `${partie.teilnehmer.length} Spieler`, () => zurueck()),
      kachel(
        h('p', { klasse: 'sekundaer', text:
          'Auf diesem Gerät ist noch nicht festgelegt, welches Blatt du führst.' }),
        h('div', { style: 'margin-top:12px' },
          taste('Blatt auswählen', async () => {
            const gewaehlt = await waehleMeinenSpieler(partie);
            if (gewaehlt) zeichne();
          }, 'haupt'))
      ),
      uebersichtKachel(def, partie, alle, null, verteilung),
    ];
  }

  const meinBlatt = alle.get(ich) || leeresBlatt(def);
  const meineWertung = punkte(def, meinBlatt, verteilung.get(ich));

  return [
    kopf(partie.spiel_name || def.name, `Dein Blatt · ${nameVon(ich)}`, () => zurueck()),
    hochformatHinweis(),
    kachel(
      h('div', { klasse: 'blatt-huelle' }, blattRaster(def, partie, ich, meinBlatt, beendet)),
      h('p', { klasse: 'klein', style: 'margin-top:8px', text:
        'Auf das Feld tippen, bis zu dem du gekreuzt hast. Nochmal auf dasselbe Feld nimmt ' +
        'ein Kreuz zurück. Ab Feld 11 friert die Reihe von selbst ein.' })
    ),
    bonusKachel(def, partie, ich, meinBlatt, meineWertung, beendet),
    kachel(
      h('h2', { text: `Dein Stand: ${meineWertung.gesamt} Punkte` }),
      h('p', { klasse: 'sekundaer', text:
        `${meineWertung.summeReihen} aus den Reihen, ${meineWertung.bonus} Bonus` })
    ),
    uebersichtKachel(def, partie, alle, ich, verteilung),
    abschlussKachel(def, partie, ich, meinBlatt, alle, beendet),
  ];
}

function zurueck() {
  history.back();
}

function hochformatHinweis() {
  return h('p', { klasse: 'hinweis quer-hinweis', text:
    'Das Blatt ist für das Querformat gedacht — Gerät drehen für die volle Breite.' });
}

function blattRaster(def, partie, ich, blatt, beendet) {
  const werte = def.blatt.punkte_je_feld;
  const anzahl = werte.length;
  const linienNach = new Set(def.blatt.linien.map((l) => l.ab_feld));

  const kopfzeile = h('tr', {},
    h('th', { klasse: 'farbkopf', text: '' }),
    ...werte.map((wert, i) => h('th', {
      klasse: `feldkopf${linienNach.has(i + 1) ? ' linie-rechts' : ''}` +
        (i + 1 >= def.blatt.todeszone_ab ? ' tod' : i + 1 >= def.blatt.punktezone_ab ? ' punkte' : ''),
    }, String(wert))),
    h('th', { klasse: 'reihenwert', text: 'Σ' }));

  const zeilen = def.blatt.farben.map((farbe) => {
    const stand = blatt.farben[farbe.id] || { felder: 0, eingefroren: false };
    const wert = stand.felder > 0 ? werte[stand.felder - 1] : 0;

    return h('tr', {},
      h('th', { klasse: 'farbkopf' },
        h('span', { klasse: 'farbpunkt', style: `background:${farbe.farbe}`, title: farbe.name }),
        stand.eingefroren ? h('span', { klasse: 'frost', text: '❄' }) : null),
      ...werte.map((_, i) => {
        const nr = i + 1;
        const gesetzt = nr <= stand.felder;
        const zone = nr >= def.blatt.todeszone_ab ? 'tod' : nr >= def.blatt.punktezone_ab ? 'punkte' : 'start';
        return h('td', {
          klasse: `blattfeld ${zone}${gesetzt ? ' gesetzt' : ''}` +
            (linienNach.has(nr) ? ' linie-rechts' : '') +
            (stand.eingefroren ? ' starr' : ''),
          onclick: beendet ? null : () => tippeFeld(partie, def, ich, farbe, stand, nr),
        }, gesetzt ? '✕' : '');
      }),
      h('td', { klasse: 'reihenwert zahl', text: String(wert) }));
  });

  return h('table', { klasse: 'blatt' },
    h('thead', {}, kopfzeile),
    h('tbody', {}, ...zeilen));
}

async function tippeFeld(partie, def, ich, farbe, stand, nr) {
  if (stand.eingefroren) {
    const auftauen = await frage(
      'Reihe ist eingefroren',
      `${farbe.name} wurde eingefroren. Nur bei einem Erfassungsfehler wieder öffnen.`,
      'Wieder öffnen'
    );
    if (!auftauen) return;
    await setzeStand(partie, ich, farbe.id, stand.felder, false);
    return;
  }

  // Nochmal auf das zuletzt gesetzte Feld nimmt ein Kreuz zurück.
  const neu = nr === stand.felder ? nr - 1 : nr;
  const inTodeszone = neu >= def.blatt.todeszone_ab;
  await setzeStand(partie, ich, farbe.id, neu, inTodeszone);
  if (inTodeszone) meldung(`${farbe.name} ist in der Todeszone und damit eingefroren.`);
}

function bonusKachel(def, partie, ich, blatt, wertung, beendet) {
  return kachel(
    h('h2', { text: 'Bonuslinien' }),
    h('ul', { klasse: 'liste', style: 'margin:0 -16px 0' },
      ...wertung.bonusZeilen.map(({ linie, status, wert, erreicht, vonHand }) =>
        h('li', {}, h('button', {
          klasse: 'eintrag',
          onclick: beendet ? null : () => bonusWeiter(partie, ich, linie, vonHand ? status : null),
        },
          h('span', { klasse: 'haupt' },
            h('span', { klasse: 'titel', text: `Linie ${linie.nr} — ab Feld ${linie.ab_feld}` }),
            h('span', { klasse: 'klein', style: 'display:block', text:
              status === 'erster' ? `Als Erster: ${linie.erster} Punkte`
                : status === 'nachfolger' ? `Nach jemandem: ${linie.nachfolger} Punkte`
                : erreicht ? 'Erreicht' : 'Noch nicht erreicht' })),
          vonHand ? h('span', { klasse: 'marke', text: 'von Hand' }) : null,
          h('span', { klasse: 'zahl', text: wert ? `+${wert}` : '–' }))))),
    h('p', { klasse: 'klein', style: 'margin-top:10px', text:
      'Wer eine Linie zuerst erreicht, wird aus der Reihenfolge der Eingaben ermittelt — ' +
      'dafür bleiben die Geräte während der Partie im Abgleich. Antippen setzt den Wert von ' +
      'Hand, nochmaliges Antippen gibt ihn wieder frei.' })
  );
}

/** Von Hand: erster → nachfolger → wieder automatisch. */
async function bonusWeiter(partie, ich, linie, status) {
  const naechster = !status ? 'erster' : status === 'erster' ? 'nachfolger' : null;
  await setzeBonus(partie, ich, linie.nr, naechster);
}

function uebersichtKachel(def, partie, alle, ich, verteilung) {
  const zeilen = partie.teilnehmer.map((id) => {
    const blatt = alle.get(id);
    const w = blatt ? punkte(def, blatt, verteilung.get(id)) : null;
    const eigenes = id === ich;
    return h('tr', {},
      h('td', { text: nameVon(id) + (eigenes ? ' (du)' : '') }),
      h('td', { klasse: 'zahl', text: w ? String(w.gesamt) : '—' }),
      h('td', { text: blatt && blatt.fertig ? 'fertig' : '' }));
  });

  return kachel(
    h('h2', { text: 'Alle Blätter' }),
    h('table', { klasse: 'daten' },
      h('thead', {}, h('tr', {},
        h('th', { text: 'Spieler' }), h('th', { text: 'Punkte' }), h('th', { text: '' }))),
      h('tbody', {}, ...zeilen)),
    h('p', { klasse: 'klein', style: 'margin-top:8px', text:
      'Die Blätter der anderen kommen beim Abgleich dazu.' }),
    h('div', { style: 'margin-top:10px' },
      taste('Stände holen', async () => {
        const ergebnis = await abgleichStill();
        if (ergebnis && !ergebnis.ok) meldung(ergebnis.meldung);
        zeichne();
      }, 'schmal'))
  );
}

function abschlussKachel(def, partie, ich, meinBlatt, alle, beendet) {
  if (beendet) {
    return kachel(taste('Zum Ergebnis', () => {
      location.hash = '';
      history.back();
    }, 'haupt'));
  }

  const alleFarbenZu = def.blatt.farben.every((f) => meinBlatt.farben[f.id]?.eingefroren);
  const offeneBlaetter = partie.teilnehmer.filter((id) => !(alle.get(id) || {}).fertig);

  return kachel(
    alleFarbenZu && !meinBlatt.fertig
      ? h('p', { klasse: 'hinweis', style: 'margin-bottom:12px', text:
          'Alle vier Reihen sind eingefroren. Damit endet das Spiel für alle — die anderen ' +
          'werten jetzt ihre offenen Reihen.' })
      : null,
    h('div', { klasse: 'tastenreihe' },
      taste(meinBlatt.fertig ? 'Blatt wieder öffnen' : 'Blatt fertig', async () => {
        await schreibe('blatt_fertig_gesetzt', {
          partie_id: partie.id, spieler_id: ich, fertig: !meinBlatt.fertig,
        });
        zeichne();
        abgleichStill().then((e) => { if (e && e.ok) zeichneSanft(); });
      }, meinBlatt.fertig ? 'schmal' : 'haupt schmal')),
    !meinBlatt.fertig
      ? h('p', { klasse: 'klein', style: 'margin-top:10px', text:
          'Mit „Blatt fertig" wird dein Stand für die anderen sichtbar.' })
      : h('p', { klasse: 'klein', style: 'margin-top:10px', text:
          offeneBlaetter.length
            ? `Es fehlen noch: ${offeneBlaetter.map(nameVon).join(', ')}`
            : 'Alle Blätter sind fertig. Die Partie kann beendet werden.' })
  );
}
