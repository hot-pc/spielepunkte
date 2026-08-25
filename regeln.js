// Regelwerk (Konzept 5 und 6)
//
// Dieses Modul kennt keine einzelnen Spiele. Es kennt nur Erfassungsmodi,
// Wertungsrichtungen und Sonderregel-Bausteine. Alles Spielspezifische
// kommt als Definition aus spiele.json herein.

/** Spieler-ID aus dem Anzeigenamen ableiten (Konzept 4). */
export function spielerIdAusName(name) {
  const norm = (name || '')
    .trim()
    .toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `spieler_${norm}`;
}

/** Vergleichsform fuer die Aehnlichkeitswarnung beim Anlegen/Import. */
export function namensform(name) {
  return (name || '').trim().toLocaleLowerCase('de-DE');
}

/** Levenshtein-Abstand, nur fuer die Warnung bei aehnlichen Namen. */
export function abstand(a, b) {
  const s = namensform(a);
  const t = namensform(b);
  if (s === t) return 0;
  const zeile = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    let vorher = zeile[0];
    zeile[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const alt = zeile[j];
      zeile[j] = Math.min(
        zeile[j] + 1,
        zeile[j - 1] + 1,
        vorher + (s[i - 1] === t[j - 1] ? 0 : 1)
      );
      vorher = alt;
    }
  }
  return zeile[t.length];
}

/**
 * Aus den Eintraegen einer Partie die Wertematrix bilden.
 * Spaetere Eintraege zur gleichen Zelle ueberschreiben frueheren Wert,
 * `entfernt` loescht die Zelle.
 * @returns {Map<number, Map<string, number>>} sequenz -> spielerId -> wert
 */
export function wertematrix(eintraege) {
  const matrix = new Map();
  for (const e of eintraege) {
    if (!matrix.has(e.sequenz)) matrix.set(e.sequenz, new Map());
    const zeile = matrix.get(e.sequenz);
    if (e.entfernt) zeile.delete(e.spieler_id);
    else zeile.set(e.spieler_id, e.wert);
  }
  for (const [seq, zeile] of [...matrix.entries()]) {
    if (zeile.size === 0) matrix.delete(seq);
  }
  return matrix;
}

/**
 * Laufenden Stand einer Partie berechnen, inklusive Sonderregeln.
 *
 * @param {object} def Spieldefinition aus spiele.json
 * @param {string[]} teilnehmer Spieler-IDs in Erfassungsreihenfolge
 * @param {Array} eintraege Eintraege der Partie (chronologisch)
 */
export function berechneStand(def, teilnehmer, eintraege) {
  const matrix = wertematrix(eintraege);
  const sequenzen = [...matrix.keys()].sort((a, b) => a - b);
  const summen = new Map(teilnehmer.map((id) => [id, 0]));
  const resets = [];
  const rundenblock = def.erfassungsmodus === 'punkte_rundenblock';
  let vollstaendigeRunden = 0;

  for (const seq of sequenzen) {
    const zeile = matrix.get(seq);
    for (const [spielerId, wert] of zeile) {
      if (!summen.has(spielerId)) summen.set(spielerId, 0);
      summen.set(spielerId, summen.get(spielerId) + wert);
    }

    const zeileVollstaendig = teilnehmer.every((id) => zeile.has(id));
    if (rundenblock && zeileVollstaendig) vollstaendigeRunden++;

    // Sonderregeln greifen im Rundenblock erst nach vollstaendiger Runde,
    // bei fortlaufender Erfassung nach jedem Zug.
    if (!rundenblock || zeileVollstaendig) {
      for (const regel of def.sonderregeln || []) {
        if (regel.baustein !== 'schwellen_reset') continue;
        for (const id of summen.keys()) {
          if (summen.get(id) === regel.ausloeser_summe) {
            resets.push({
              sequenz: seq,
              spieler_id: id,
              von: regel.ausloeser_summe,
              nach: regel.neue_summe,
            });
            summen.set(id, regel.neue_summe);
          }
        }
      }
    }
  }

  return {
    matrix,
    sequenzen,
    summen,
    resets,
    vollstaendigeRunden,
    letzteSequenz: sequenzen.length ? sequenzen[sequenzen.length - 1] : 0,
  };
}

/**
 * Prueft, ob die gewaehlte Endbedingung erreicht ist.
 * @param {object} endbedingung {typ: 'manuell'|'rundenzahl'|'schwelle', wert}
 */
export function pruefeEnde(def, endbedingung, stand) {
  if (!endbedingung || endbedingung.typ === 'manuell') {
    return { erreicht: false, grund: null };
  }
  if (endbedingung.typ === 'rundenzahl') {
    const erreicht = stand.vollstaendigeRunden >= endbedingung.wert;
    return {
      erreicht,
      grund: erreicht ? `${endbedingung.wert} Runden gespielt` : null,
    };
  }
  if (endbedingung.typ === 'schwelle') {
    for (const [id, summe] of stand.summen) {
      if (summe >= endbedingung.wert) {
        return { erreicht: true, grund: `Schwelle ${endbedingung.wert} erreicht`, spieler_id: id };
      }
    }
  }
  return { erreicht: false, grund: null };
}

/**
 * Platzierung mit geteilten Plaetzen (1, 1, 3).
 * @returns {{liste: Array, sieger: string[], gleichstand: boolean}}
 */
export function platzierung(def, teilnehmer, stand) {
  const richtung = def.wertungsrichtung;
  const liste = teilnehmer.map((id) => ({
    spieler_id: id,
    summe: stand.summen.get(id) ?? 0,
  }));

  liste.sort((a, b) => (richtung === 'hoechste' ? b.summe - a.summe : a.summe - b.summe));

  let platz = 0;
  let vorigeSumme = null;
  liste.forEach((zeile, index) => {
    if (vorigeSumme === null || zeile.summe !== vorigeSumme) platz = index + 1;
    zeile.platz = platz;
    vorigeSumme = zeile.summe;
  });

  const sieger = liste.filter((z) => z.platz === 1).map((z) => z.spieler_id);
  return { liste, sieger, gleichstand: sieger.length > 1 };
}

/** Prueft eine Eingabe gegen die Vorzeichenregel der Definition. */
export function eingabeGueltig(def, wert) {
  if (!Number.isFinite(wert)) return { ok: false, meldung: 'Bitte eine Zahl eingeben.' };
  if (def.vorzeichen === 'nur_positiv' && wert < 0) {
    return { ok: false, meldung: 'Negative Werte sind bei diesem Spiel nicht vorgesehen.' };
  }
  return { ok: true };
}

/** Endbedingung fuer den Partiestart aus Definition und letzter Wahl ableiten. */
export function endbedingungVorschlag(def, letzteWahl) {
  if (def.endbedingung === 'manuell') return { typ: 'manuell', wert: null };
  if (letzteWahl && letzteWahl.typ) return { ...letzteWahl };
  if (def.endbedingung === 'rundenzahl') {
    return { typ: 'rundenzahl', wert: def.rundenzahl_vorbelegung ?? 5 };
  }
  return { typ: 'rundenzahl', wert: def.rundenzahl_vorbelegung ?? 5 };
}
