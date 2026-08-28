// Kurznamen fuer Spaltenkoepfe der Rundenmatrix (Konzept 6.6)
//
// Regel: mindestens die ersten drei Buchstaben bleiben erhalten.
// Ist die Abkuerzung innerhalb der Teilnehmer einer Partie nicht eindeutig,
// wird sie zeichenweise verlaengert, bis alle eindeutig sind.
// Geprueft wird immer nur je Partie, nie ueber die gesamte Spielerliste.

const MINDESTLAENGE = 3;

function vergleichsform(text) {
  return text.trim().toLocaleLowerCase('de-DE');
}

/**
 * @param {string[]} namen Anzeigenamen der Teilnehmer dieser Partie
 * @returns {string[]} Kurznamen in derselben Reihenfolge
 */
export function kurznamen(namen) {
  const bereinigt = namen.map((n) => (n || '').trim());
  const maxLaenge = bereinigt.reduce((m, n) => Math.max(m, n.length), 0);

  for (let laenge = MINDESTLAENGE; laenge <= Math.max(maxLaenge, MINDESTLAENGE); laenge++) {
    const kandidaten = bereinigt.map((n) => n.slice(0, laenge));
    const formen = kandidaten.map(vergleichsform);
    if (new Set(formen).size === formen.length) return kandidaten;
  }

  // Sicherheitsnetz: identische Namen koennen wegen der namensabgeleiteten
  // Spieler-ID (Konzept 4) nicht als zwei Teilnehmer auftreten. Falls doch,
  // wird durchnummeriert, statt eine nicht eindeutige Spalte zu zeigen.
  const gesehen = new Map();
  return bereinigt.map((n) => {
    const form = vergleichsform(n);
    const anzahl = (gesehen.get(form) || 0) + 1;
    gesehen.set(form, anzahl);
    return anzahl === 1 ? n : `${n} ${anzahl}`;
  });
}
