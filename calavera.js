// Calavera (moses.) — jeder Spieler führt sein eigenes Blatt auf seinem Gerät.
//
// Regelgrundlage: Vier Farbreihen mit je 13 Feldern. Eine Reihe zählt so viele
// Punkte, wie das am weitesten rechts gesetzte Kreuz angibt. Kreuze werden
// lückenlos von links gesetzt, deshalb genügt je Farbe die erreichte Position.
// Wer in die Todeszone kreuzt, friert die Reihe sofort ein. Für jede der drei
// roten Linien gibt es Bonuspunkte, wenn alle vier Farben sie erreicht haben —
// mehr für den ersten Spieler, weniger für alle danach.

import { zustand, schreibe, zeichne, merke, nameVon, abgleichStill, zeichneSanft,
  bildschirmBleibtAn } from './kern.js';
import { h, kachel, kopf, taste, meldung, dialog, frage } from './ui.js';

// Die Beenden- und Abbrechen-Logik liegt in partie.js. Sie wird beim Laden
// dort angemeldet, damit calavera.js partie.js nicht importieren muss.
let beendeHandler = null;
let abbrechenHandler = null;

export function setzeAbschlussHandler({ beenden, abbrechen }) {
  beendeHandler = beenden;
  abbrechenHandler = abbrechen;
}

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

/**
 * Punkte eines Blattes: vier Reihen plus Bonus.
 *
 * Eine Reihe zählt erst, wenn sie eingefroren ist — vorher kann der Spieler
 * dort weiter kreuzen und der Wert steht noch nicht fest. Erst zum Spielende
 * werden auch die offenen Reihen gewertet; dafür wird `alleWerten` gesetzt.
 *
 * `automatik` ist die von der App ermittelte Bonusverteilung für diesen
 * Spieler; ein von Hand gesetzter Status hat immer Vorrang.
 */
export function punkte(def, blatt, automatik = null, alleWerten = false) {
  const werte = def.blatt.punkte_je_feld;
  const reihen = {};
  const offeneReihen = {};
  let summeReihen = 0;
  let nochOffen = 0;

  for (const f of def.blatt.farben) {
    const zeile = blatt.farben[f.id] || { felder: 0, eingefroren: false };
    const wert = zeile.felder > 0 ? werte[zeile.felder - 1] : 0;
    const zaehlt = zeile.eingefroren || alleWerten;
    reihen[f.id] = zaehlt ? wert : 0;
    offeneReihen[f.id] = zaehlt ? null : wert;
    if (zaehlt) summeReihen += wert;
    else nochOffen += wert;
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

  return {
    reihen, offeneReihen, summeReihen, nochOffen, bonus, bonusZeilen,
    gesamt: summeReihen + bonus,
    alleGewertet: alleWerten || def.blatt.farben.every((f) => blatt.farben[f.id]?.eingefroren),
  };
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

// Welches Blatt gerade angezeigt wird. null bedeutet: das eigene.
let gezeigterSpieler = null;
let gezeigtePartie = null;

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
  beobachteDrehung();

  // Beim Wechsel der Partie wieder auf das eigene Blatt stellen.
  if (gezeigtePartie !== partie.id) {
    gezeigtePartie = partie.id;
    gezeigterSpieler = null;
  }

  // Nach dem Aufbau prüfen, ob eine Linie neu überschritten wurde.
  setTimeout(() => meldeUeberschritteneLinien(def, partie, verteilung, ich), 0);

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

  // Angezeigt wird das eigene Blatt oder — nur lesend — das eines anderen.
  const zeigen = gezeigterSpieler && partie.teilnehmer.includes(gezeigterSpieler)
    ? gezeigterSpieler : ich;
  const nurAnsehen = zeigen !== ich;
  const gezeigtesBlatt = alle.get(zeigen) || leeresBlatt(def);
  const wertung = punkte(def, gezeigtesBlatt, verteilung.get(zeigen),
    beendet || gezeigtesBlatt.fertig);
  const gesperrt = beendet || nurAnsehen;

  return [
    kopf(partie.spiel_name || def.name,
      nurAnsehen ? `Blatt von ${nameVon(zeigen)}` : `Dein Blatt · ${nameVon(ich)}`,
      () => zurueck()),
    // Das Blatt steht ganz oben: nach einer Eingabe bleibt es sichtbar,
    // ohne dass gescrollt werden muss. Alles Weitere folgt darunter.
    kachel(
      h('div', { klasse: 'blatt-huelle' }, blattRaster(def, partie, zeigen, gezeigtesBlatt, gesperrt))
    ),
    blattWahl(partie, ich, zeigen),
    kachel(
      h('p', { klasse: 'klein', style: 'margin-bottom:10px', text: nurAnsehen
        ? `Nur zum Ansehen. Stand vom letzten Abgleich${zustand.meta.letzter_abgleich
            ? ` um ${new Date(zustand.meta.letzter_abgleich).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''}.`
        : 'Auf das Feld tippen, bis zu dem du gekreuzt hast. Nochmal auf dasselbe Feld nimmt ' +
          'ein Kreuz zurück. Über den Farbpunkt frierst du eine Reihe ein — erst dann zählt ' +
          'sie. Ab Feld 11 friert sie von selbst ein.' }),
      querformatTaste(),
      bildschirmBleibtAn()
        ? h('p', { klasse: 'klein', style: 'margin-top:10px', text:
            'Der Bildschirm bleibt an, solange das Blatt geöffnet ist.' })
        : null
    ),
    bonusKachel(def, partie, zeigen, gezeigtesBlatt, wertung, gesperrt),
    kachel(
      h('h2', { text: nurAnsehen
        ? `${nameVon(zeigen)}: ${wertung.gesamt} Punkte`
        : `Dein Stand: ${wertung.gesamt} Punkte` }),
      h('p', { klasse: 'sekundaer', text:
        `${wertung.summeReihen} aus eingefrorenen Reihen, ${wertung.bonus} Bonus` }),
      wertung.nochOffen
        ? h('p', { klasse: 'klein', style: 'margin-top:6px', text:
            `Offene Reihen stehen derzeit bei ${wertung.nochOffen} Punkten. Sie zählen erst, ` +
            'wenn du sie einfrierst oder am Spielende.' })
        : null
    ),
    uebersichtKachel(def, partie, alle, ich, verteilung),
    nurAnsehen ? null : abschlussKachel(def, partie, ich, gezeigtesBlatt, alle, beendet),
  ];
}

// --- Meldung, wenn eine Bonuslinie überschritten wurde -------------------

let meldungLaeuft = false;

/**
 * Sobald jemand als Erster alle vier Farben über eine Linie gebracht hat,
 * bekommt jedes Gerät einmal einen Hinweis. Was schon gemeldet wurde, steht
 * gerätelokal in den Merkfeldern — jeder soll die Meldung genau einmal sehen,
 * unabhängig davon, wann sein Abgleich sie erreicht.
 */
async function meldeUeberschritteneLinien(def, partie, verteilung, ich) {
  if (partie.status !== 'laufend' || meldungLaeuft) return;

  const schluessel = `linien_gemeldet_${partie.id}`;
  const gemeldet = new Set(zustand.meta[schluessel] || []);

  const offen = [];
  for (const linie of def.blatt.linien) {
    if (gemeldet.has(linie.nr)) continue;
    const eintrag = [...verteilung.entries()]
      .find(([, meine]) => meine.get(linie.nr) && meine.get(linie.nr).status === 'erster');
    if (eintrag) offen.push({ linie, spieler: eintrag[0] });
  }
  if (!offen.length) return;

  meldungLaeuft = true;
  try {
    for (const { linie, spieler } of offen) {
      const selbst = spieler === ich;
      await dialog({
        titel: `Linie ${linie.nr} überschritten`,
        inhalt: [
          h('p', {}, selbst
            ? `Du hast als Erster alle vier Farben über Linie ${linie.nr} gebracht.`
            : `${nameVon(spieler)} hat als Erste oder Erster alle vier Farben über ` +
              `Linie ${linie.nr} gebracht.`),
          h('p', { klasse: 'klein' }, selbst
            ? `Damit sind dir ${linie.erster} Bonuspunkte sicher. Für alle anderen sind es ` +
              `jetzt noch ${linie.nachfolger}.`
            : `Für ${nameVon(spieler)} sind das ${linie.erster} Bonuspunkte. Wer die Linie ` +
              `noch erreicht, bekommt ${linie.nachfolger}.`),
        ],
        tasten: [{ text: 'OK', art: 'haupt' }],
      });
      gemeldet.add(linie.nr);
      await merke(schluessel, [...gemeldet]);
    }
  } finally {
    meldungLaeuft = false;
  }
}

/** Umschalter zwischen den Blättern aller Mitspieler. */
function blattWahl(partie, ich, zeigen) {
  return kachel(
    h('div', { klasse: 'blattwahl' },
      ...partie.teilnehmer.map((id) =>
        h('button', {
          klasse: `blattknopf${id === zeigen ? ' aktiv' : ''}`,
          type: 'button',
          onclick: () => { gezeigterSpieler = id === ich ? null : id; zeichne(); },
        }, id === ich ? `${nameVon(id)} (du)` : nameVon(id))))
  );
}

function zurueck() {
  history.back();
}

/**
 * Querformat erzwingen. Das Sperren der Ausrichtung ist nur im Vollbild
 * erlaubt, deshalb wird zuerst Vollbild angefordert. Klappt beides nicht,
 * bleibt das Blatt hochkant bedienbar — es ist so gebaut, dass es auch dort
 * vollständig auf den Bildschirm passt.
 */
async function querformatEin() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    await screen.orientation.lock('landscape');
    zeichne();
  } catch {
    await dialog({
      titel: 'Querformat nicht möglich',
      inhalt: [
        h('p', { klasse: 'sekundaer', text:
          'Dieses Gerät lässt das Drehen aus der App heraus nicht zu. Das Blatt bleibt hochkant ' +
          'vollständig bedienbar.' }),
        h('p', { klasse: 'klein', text:
          'Damit sich die App überhaupt drehen kann, muss zweierlei stimmen: die automatische ' +
          'Bildschirmdrehung im Gerät darf nicht gesperrt sein, und die App muss nach der ' +
          'Umstellung einmal neu zum Startbildschirm hinzugefügt worden sein — die alte ' +
          'Festlegung auf Hochformat bleibt sonst erhalten.' }),
      ],
      tasten: [{ text: 'Verstanden', art: 'haupt' }],
    });
  }
}

async function querformatAus() {
  try {
    screen.orientation.unlock();
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch { /* ohne Auswirkung */ }
  zeichne();
}

function querformatTaste() {
  const aktiv = !!document.fullscreenElement;
  return taste(aktiv ? 'Querformat beenden' : 'Querformat', aktiv ? querformatAus : querformatEin, 'schmal');
}

/** Liegt das Gerät quer? Dann passt die breite Darstellung. */
function querAusrichtung() {
  try {
    return window.matchMedia('(orientation: landscape)').matches;
  } catch {
    return false;
  }
}

/**
 * Das Blatt in zwei Ausrichtungen:
 *   hochkant — vier Farbspalten, dreizehn Zeilen, wie der Originalblock
 *   quer     — vier Farbzeilen, dreizehn Spalten, nutzt die volle Breite
 * Beide zeigen dieselben Felder, roten Linien und Zonenfarben.
 */
function blattRaster(def, partie, ich, blatt, beendet) {
  return querAusrichtung()
    ? rasterQuer(def, partie, ich, blatt, beendet)
    : rasterHoch(def, partie, ich, blatt, beendet);
}

/** Farbkopf mit Schalter zum Einfrieren der Reihe. */
function farbKopf(def, partie, ich, blatt, farbe, gesperrt) {
  const stand = blatt.farben[farbe.id] || { felder: 0, eingefroren: false };
  return h('th', {
    klasse: `farbkopf${stand.eingefroren ? ' zu' : ''}`,
    title: stand.eingefroren ? `${farbe.name}: eingefroren` : `${farbe.name}: offen`,
    onclick: gesperrt ? null : () => reiheUmschalten(partie, def, ich, farbe, stand),
  },
    h('span', { klasse: 'farbpunkt', style: `background:${farbe.farbe}` }),
    h('span', { klasse: 'frost', text: stand.eingefroren ? '❄' : '🔓' }));
}

async function reiheUmschalten(partie, def, ich, farbe, stand) {
  if (stand.eingefroren) {
    const auftauen = await frage(
      `${farbe.name} wieder öffnen?`,
      'Nur bei einem Erfassungsfehler. Die Reihe zählt danach erst wieder, wenn du sie ' +
        'erneut einfrierst.',
      'Wieder öffnen'
    );
    if (!auftauen) return;
    await setzeStand(partie, ich, farbe.id, stand.felder, false);
    return;
  }

  const wert = stand.felder > 0 ? def.blatt.punkte_je_feld[stand.felder - 1] : 0;
  const zufrieren = await frage(
    `${farbe.name} einfrieren?`,
    `Die Reihe wird mit ${wert} Punkten gewertet. Danach kannst du dort nicht mehr kreuzen.`,
    'Einfrieren'
  );
  if (!zufrieren) return;
  await setzeStand(partie, ich, farbe.id, stand.felder, true);
}

/** Abschnitt, in dem ein Feld liegt — bestimmt die Zahl der nötigen Rosen. */
function abschnittVon(def, nr) {
  return (def.blatt.abschnitte || []).find((a) => nr >= a.von && nr <= a.bis) || null;
}

/** Rosen als Symbolgruppe, so kompakt wie im Originalblock. */
function rosenZelle(rosen, zusatz = {}) {
  return h('td', {
    klasse: 'rosen', title: `Zum Einfrieren in diesem Abschnitt ${rosen} Rosen nötig`,
    ...zusatz,
  }, h('span', { klasse: 'rosenzahl', text: String(rosen) }), h('span', { klasse: 'rose', text: '✿' }));
}

function zonenKlasse(def, nr) {
  return nr >= def.blatt.todeszone_ab ? 'tod' : nr >= def.blatt.punktezone_ab ? 'punkte' : 'start';
}

function feldZelle(def, partie, ich, farbe, stand, nr, beendet, extra = '') {
  const gesetzt = nr <= stand.felder;
  return h('td', {
    klasse: `blattfeld ${zonenKlasse(def, nr)}${gesetzt ? ' gesetzt' : ''}` +
      (stand.eingefroren ? ' starr' : '') + (extra ? ` ${extra}` : ''),
    onclick: beendet ? null : () => tippeFeld(partie, def, ich, farbe, stand, nr),
  }, gesetzt ? '✕' : '');
}

/** Hochkant: Spalten sind die Farben. */
function rasterHoch(def, partie, ich, blatt, beendet) {
  const werte = def.blatt.punkte_je_feld;
  const linienNach = new Set(def.blatt.linien.map((l) => l.ab_feld));

  const kopfzeile = h('tr', {},
    h('th', { klasse: 'rosenkopf', title: 'Rosen zum Einfrieren', text: '✿' }),
    h('th', { klasse: 'punktkopf', text: 'Pkt' }),
    ...def.blatt.farben.map((f) => farbKopf(def, partie, ich, blatt, f, beendet)));

  const zeilen = werte.map((wert, i) => {
    const nr = i + 1;
    const abschnitt = abschnittVon(def, nr);
    // Die Rosenzelle steht einmal je Abschnitt und reicht über dessen Zeilen.
    const rosen = !abschnitt
      ? h('td', { klasse: 'rosen leer' })
      : abschnitt.von === nr
        ? rosenZelle(abschnitt.rosen, { rowspan: String(abschnitt.bis - abschnitt.von + 1) })
        : null;

    return h('tr', { klasse: linienNach.has(nr) ? 'linie-unten' : '' },
      rosen,
      h('th', { klasse: `punktkopf ${zonenKlasse(def, nr)}`, text: String(wert) }),
      ...def.blatt.farben.map((farbe) => {
        const stand = blatt.farben[farbe.id] || { felder: 0, eingefroren: false };
        return feldZelle(def, partie, ich, farbe, stand, nr, beendet);
      }));
  });

  const fusszeile = h('tr', { klasse: 'summenzeile' },
    h('th', { klasse: 'rosen leer' }),
    h('th', { klasse: 'punktkopf', text: 'Σ' }),
    ...def.blatt.farben.map((f) => {
      const stand = blatt.farben[f.id] || { felder: 0, eingefroren: false };
      const wert = stand.felder > 0 ? werte[stand.felder - 1] : 0;
      return h('td', {
        klasse: `zahl${stand.eingefroren ? '' : ' offen'}`,
        title: stand.eingefroren ? 'gewertet' : 'zählt erst nach dem Einfrieren',
      }, stand.eingefroren ? String(wert) : `(${wert})`);
    }));

  return h('table', { klasse: 'blatt hoch' },
    h('thead', {}, kopfzeile),
    h('tbody', {}, ...zeilen),
    h('tfoot', {}, fusszeile));
}

/** Quer: Zeilen sind die Farben. */
function rasterQuer(def, partie, ich, blatt, beendet) {
  const werte = def.blatt.punkte_je_feld;
  const linienNach = new Set(def.blatt.linien.map((l) => l.ab_feld));

  // Erste Kopfzeile: Rosen je Abschnitt, über die Felder zusammengefasst.
  const rosenzeile = h('tr', {}, h('th', { klasse: 'farbkopf rosenkopf', text: '✿' }));
  let feld = 1;
  while (feld <= werte.length) {
    const abschnitt = abschnittVon(def, feld);
    if (abschnitt) {
      rosenzeile.append(rosenZelle(abschnitt.rosen, {
        colspan: String(abschnitt.bis - abschnitt.von + 1),
        klasse: `rosen${linienNach.has(abschnitt.bis) ? ' linie-rechts' : ''}`,
      }));
      feld = abschnitt.bis + 1;
    } else {
      rosenzeile.append(h('td', {
        klasse: `rosen leer${linienNach.has(feld) ? ' linie-rechts' : ''}`,
      }));
      feld++;
    }
  }
  rosenzeile.append(h('th', { klasse: 'reihenwert', text: '' }));

  const kopfzeile = h('tr', {},
    h('th', { klasse: 'farbkopf', text: '' }),
    ...werte.map((wert, i) => h('th', {
      klasse: `feldkopf ${zonenKlasse(def, i + 1)}${linienNach.has(i + 1) ? ' linie-rechts' : ''}`,
    }, String(wert))),
    h('th', { klasse: 'reihenwert', text: 'Σ' }));

  const zeilen = def.blatt.farben.map((farbe) => {
    const stand = blatt.farben[farbe.id] || { felder: 0, eingefroren: false };
    const wert = stand.felder > 0 ? werte[stand.felder - 1] : 0;
    return h('tr', {},
      farbKopf(def, partie, ich, blatt, farbe, beendet),
      ...werte.map((_, i) =>
        feldZelle(def, partie, ich, farbe, stand, i + 1, beendet,
          linienNach.has(i + 1) ? 'linie-rechts' : '')),
      h('td', {
        klasse: `reihenwert zahl${stand.eingefroren ? '' : ' offen'}`,
        title: stand.eingefroren ? 'gewertet' : 'zählt erst nach dem Einfrieren',
      }, stand.eingefroren ? String(wert) : `(${wert})`));
  });

  return h('table', { klasse: 'blatt quer' },
    h('thead', {}, rosenzeile, kopfzeile),
    h('tbody', {}, ...zeilen));
}

/** Beim Drehen des Geräts die Ansicht neu aufbauen. */
let drehungBeobachtet = false;
function beobachteDrehung() {
  if (drehungBeobachtet) return;
  drehungBeobachtet = true;
  try {
    window.matchMedia('(orientation: landscape)').addEventListener('change', () => zeichneSanft());
  } catch { /* ältere Browser: Ansicht wird beim nächsten Antippen neu gebaut */ }
}

async function tippeFeld(partie, def, ich, farbe, stand, nr) {
  if (stand.eingefroren) {
    meldung(`${farbe.name} ist eingefroren. Zum Öffnen den Farbpunkt antippen.`);
    return;
  }

  // Nochmal auf das zuletzt gesetzte Feld nimmt ein Kreuz zurück.
  const neu = nr === stand.felder ? nr - 1 : nr;

  // Jede Rücknahme wird bestätigt — versehentliches Antippen soll keine
  // bereits gesetzten Kreuze löschen.
  if (neu < stand.felder) {
    const anzahl = stand.felder - neu;
    const bestaetigt = await frage(
      anzahl === 1 ? 'Kreuz zurücknehmen?' : `${anzahl} Kreuze zurücknehmen?`,
      `${farbe.name} geht von ${stand.felder} auf ${neu} ${neu === 1 ? 'Kreuz' : 'Kreuze'} zurück.`,
      'OK'
    );
    if (!bestaetigt) return;
  }

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
    const w = blatt
      ? punkte(def, blatt, verteilung.get(id), partie.status !== 'laufend' || blatt.fertig)
      : null;
    const eigenes = id === ich;
    return h('tr', {},
      h('td', {},
        h('button', {
          klasse: 'alsverweis', type: 'button',
          onclick: () => { gezeigterSpieler = eigenes ? null : id; zeichne(); },
        }, nameVon(id) + (eigenes ? ' (du)' : ''))),
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
      'Einen Namen antippen, um das Blatt dieses Spielers anzusehen. ' +
      'Die Stände kommen beim Abgleich dazu.' }),
    h('div', { style: 'margin-top:10px' },
      // Selbst angestoßen: hier ist eine Rückmeldung erwünscht, aber nur,
      // wenn etwas nicht geklappt hat.
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

  const alleFertig = offeneBlaetter.length === 0;

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
      }, meinBlatt.fertig ? 'schmal' : 'haupt schmal'),
      // Beenden kann jeder — die Partie gilt für alle. Vorher wird gewarnt,
      // wenn noch ein Blatt offen ist.
      taste('Partie beenden', () => beendeHandler && beendeHandler(partie, def),
        alleFertig ? 'haupt schmal' : 'schmal')),
    h('p', { klasse: 'klein', style: 'margin-top:10px', text: !meinBlatt.fertig
      ? 'Mit „Blatt fertig" wird dein Stand für die anderen sichtbar.'
      : alleFertig
        ? 'Alle Blätter sind fertig. Die Partie kann beendet werden.'
        : `Es fehlen noch: ${offeneBlaetter.map(nameVon).join(', ')}` }),
    h('div', { style: 'margin-top:10px' },
      taste('Partie abbrechen', () => abbrechenHandler && abbrechenHandler(partie), 'schmal'))
  );
}
