// Auswertung (Konzept 7). Reine Rechenlogik ohne Oberflaeche.

import { berechneStand, platzierung } from './regeln.js';
import { blaetter, punkte as blattPunkte, bonusVerteilung } from './calavera.js';

/** Leerer Stand für Modi ohne Rundenmatrix, damit die Auswertung greift. */
const LEERER_STAND = { matrix: new Map(), sequenzen: [], summen: new Map(), resets: [], vollstaendigeRunden: 0, letzteSequenz: 0 };

/** Ergebnis einer Partie. Wird immer neu berechnet, damit nachtraegliche
 *  Korrekturen sofort wirken. Ein manuell gesetzter Sieger hat Vorrang. */
export function ergebnis(def, partie) {
  if (def && def.erfassungsmodus === 'blatt_calavera') {
    const alle = blaetter(def, partie);
    const verteilung = bonusVerteilung(def, partie);
    const summen = new Map();
    for (const id of partie.teilnehmer) {
      const blatt = alle.get(id);
      summen.set(id, blatt ? blattPunkte(def, blatt, verteilung.get(id)).gesamt : 0);
    }
    const stand = { ...LEERER_STAND, summen };
    const pl = platzierung(def, partie.teilnehmer, stand);
    return {
      punkte: true,
      stand,
      blaetter: alle,
      liste: pl.liste,
      sieger: partie.sieger_manuell ? partie.sieger : pl.sieger,
      gleichstand: pl.gleichstand && !partie.sieger_manuell,
    };
  }

  if (!def || def.erfassungsmodus === 'nur_sieger') {
    return {
      punkte: false,
      stand: null,
      liste: partie.teilnehmer.map((id) => ({ spieler_id: id, summe: null, platz: partie.sieger.includes(id) ? 1 : null })),
      sieger: partie.sieger,
      gleichstand: false,
    };
  }
  const stand = berechneStand(def, partie.teilnehmer, partie.eintraege);
  const pl = platzierung(def, partie.teilnehmer, stand);
  return {
    punkte: true,
    stand,
    liste: pl.liste,
    sieger: partie.sieger_manuell ? partie.sieger : pl.sieger,
    gleichstand: pl.gleichstand && !partie.sieger_manuell,
  };
}

export function endbedingungText(endbedingung) {
  if (!endbedingung || endbedingung.typ === 'manuell') return 'ohne festes Ende';
  if (endbedingung.typ === 'rundenzahl') return `${endbedingung.wert} Runden`;
  if (endbedingung.typ === 'schwelle') return `Schwelle ${endbedingung.wert}`;
  return 'unbekannt';
}

/**
 * Beendete Partien sammeln und filtern. Abgebrochene Partien zaehlen nie
 * (Konzept 7.3).
 */
export function sammle(zustand, definitionFuer, filter = {}) {
  const treffer = [];
  for (const partie of zustand.partien.values()) {
    if (partie.status !== 'beendet') continue;
    if (filter.spielId && partie.spiel_id !== filter.spielId) continue;
    const start = partie.start_zeitpunkt;
    if (filter.von && start < filter.von) continue;
    if (filter.bis && start > `${filter.bis}T23:59:59.999Z`) continue;
    if (filter.spielerIds && filter.spielerIds.length) {
      const alleDabei = filter.spielerIds.every((id) => partie.teilnehmer.includes(id));
      if (!alleDabei) continue;
    }
    const def = definitionFuer(partie.spiel_id, partie.spiel_version);
    treffer.push({ partie, def, erg: ergebnis(def, partie) });
  }
  return treffer.sort((a, b) => (a.partie.start_zeitpunkt < b.partie.start_zeitpunkt ? 1 : -1));
}

function leereZeile(id) {
  return { spieler_id: id, partien: 0, siege: 0, geteilte_siege: 0, summen: [] };
}

/** Kennzahlen je Spieler ueber eine Menge von Partien. */
export function jeSpieler(treffer) {
  const zeilen = new Map();
  for (const { partie, erg } of treffer) {
    for (const id of partie.teilnehmer) {
      if (!zeilen.has(id)) zeilen.set(id, leereZeile(id));
      const z = zeilen.get(id);
      z.partien++;
      if (erg.sieger.includes(id)) {
        z.siege++;
        if (erg.sieger.length > 1) z.geteilte_siege++;
      }
      if (erg.punkte) {
        const zeile = erg.liste.find((l) => l.spieler_id === id);
        if (zeile) z.summen.push(zeile.summe);
      }
    }
  }
  for (const z of zeilen.values()) {
    z.quote = z.partien ? z.siege / z.partien : 0;
    z.schnitt = z.summen.length ? z.summen.reduce((a, b) => a + b, 0) / z.summen.length : null;
    z.min = z.summen.length ? Math.min(...z.summen) : null;
    z.max = z.summen.length ? Math.max(...z.summen) : null;
  }
  return [...zeilen.values()].sort((a, b) => b.siege - a.siege || b.quote - a.quote);
}

/** Statistik je Spiel, Punktwerte nach Endbedingung und Version gruppiert. */
export function jeSpiel(treffer) {
  if (!treffer.length) return null;
  const def = treffer[0].def;
  const punkte = treffer.some((t) => t.erg.punkte);

  const gruppen = new Map();
  for (const t of treffer) {
    if (!t.erg.punkte) continue;
    const schluessel = `v${t.partie.spiel_version} · ${endbedingungText(t.partie.endbedingung)}`;
    if (!gruppen.has(schluessel)) gruppen.set(schluessel, []);
    gruppen.get(schluessel).push(t);
  }

  let hoechsterEinzelwert = null;
  let niedrigsterEinzelwert = null;
  for (const t of treffer) {
    if (!t.erg.stand || !t.erg.stand.matrix || !t.erg.stand.matrix.size) continue;
    for (const zeile of t.erg.stand.matrix.values()) {
      for (const wert of zeile.values()) {
        if (hoechsterEinzelwert === null || wert > hoechsterEinzelwert) hoechsterEinzelwert = wert;
        if (niedrigsterEinzelwert === null || wert < niedrigsterEinzelwert) niedrigsterEinzelwert = wert;
      }
    }
  }

  const zeitpunkte = treffer.map((t) => t.partie.start_zeitpunkt).sort();
  return {
    def,
    punkte,
    anzahl: treffer.length,
    von: zeitpunkte[0],
    bis: zeitpunkte[zeitpunkte.length - 1],
    gesamt: jeSpieler(treffer),
    gruppen: [...gruppen.entries()].map(([name, liste]) => ({
      name,
      anzahl: liste.length,
      zeilen: jeSpieler(liste),
    })),
    hoechsterEinzelwert,
    niedrigsterEinzelwert,
    vermischt: gruppen.size > 1,
  };
}

/** Kopf-an-Kopf: nur Partien, in denen beide mitgespielt haben. */
export function kopfAnKopf(treffer, idA, idB) {
  const gemeinsam = treffer.filter(
    (t) => t.partie.teilnehmer.includes(idA) && t.partie.teilnehmer.includes(idB)
  );
  let siegeA = 0;
  let siegeB = 0;
  let andere = 0;
  for (const t of gemeinsam) {
    const a = t.erg.sieger.includes(idA);
    const b = t.erg.sieger.includes(idB);
    if (a && !b) siegeA++;
    else if (b && !a) siegeB++;
    else andere++;
  }
  return { anzahl: gemeinsam.length, siegeA, siegeB, andere, partien: gemeinsam };
}

/** Zeitliche Entwicklung, nach Monat gruppiert. */
export function jeMonat(treffer, spielerId) {
  const monate = new Map();
  for (const { partie, erg } of treffer) {
    if (!partie.teilnehmer.includes(spielerId)) continue;
    const schluessel = partie.start_zeitpunkt.slice(0, 7);
    if (!monate.has(schluessel)) monate.set(schluessel, { monat: schluessel, partien: 0, siege: 0 });
    const m = monate.get(schluessel);
    m.partien++;
    if (erg.sieger.includes(spielerId)) m.siege++;
  }
  return [...monate.values()].sort((a, b) => (a.monat < b.monat ? 1 : -1));
}

export function monatText(schluessel) {
  const [jahr, monat] = schluessel.split('-');
  const namen = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
    'August', 'September', 'Oktober', 'November', 'Dezember'];
  return `${namen[Number(monat) - 1]} ${jahr}`;
}
