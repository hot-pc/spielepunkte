// Projektion: aus dem append-only Journal den aktuellen Zustand bilden.
// Das Journal ist die Wahrheit, alles hier ist abgeleitet und jederzeit
// neu berechenbar.

/** Ereignisse in stabile zeitliche Reihenfolge bringen. */
export function sortiere(ereignisse) {
  return [...ereignisse].sort((a, b) => {
    if (a.zeit < b.zeit) return -1;
    if (a.zeit > b.zeit) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function projiziere(ereignisse) {
  const spieler = new Map();
  const partien = new Map();
  const notizen = new Map();
  // Entfernte Partien: Das Ereignis bleibt im Journal und wandert beim
  // Abgleich mit. Nur so verschwindet die Partie auch auf den anderen
  // Geraeten und kommt nicht beim naechsten Import zurueck.
  //
  // Abgebrochene Partien werden genauso behandelt wie geloeschte: Sie sollen
  // nirgends mehr auftauchen — weder in einer Liste noch in der Auswertung.
  // Frueher blieben sie als Status erhalten und waren dadurch an einzelnen
  // Stellen noch sichtbar, etwa in der Zaehlung im Datenbereich.
  const geloescht = new Set();

  for (const e of sortiere(ereignisse)) {
    const d = e.daten || {};
    switch (e.typ) {
      case 'spielnotiz_gesetzt':
        // Spätere Ereignisse gewinnen. Weil chronologisch durchlaufen wird,
        // steht am Ende die jüngste Fassung je Spiel.
        notizen.set(d.spiel_id, { text: d.text || '', zeit: e.zeit, geraet: e.geraet_name || null });
        break;

      case 'spieler_angelegt':
        if (!spieler.has(d.id)) {
          spieler.set(d.id, { id: d.id, name: d.name, aktiv: true });
        }
        break;

      case 'spieler_umbenannt': {
        const s = spieler.get(d.id);
        if (s) s.name = d.name;
        break;
      }

      case 'spieler_deaktiviert': {
        const s = spieler.get(d.id);
        // Das Feld aktiv wird mitgefuehrt, damit ein Fehlklick ohne
        // zusaetzlichen Ereignistyp ruecknehmbar bleibt.
        if (s) s.aktiv = d.aktiv === true;
        break;
      }

      case 'partie_gestartet':
        if (!partien.has(d.id)) {
          partien.set(d.id, {
            id: d.id,
            spiel_id: d.spiel_id,
            spiel_version: d.spiel_version,
            spiel_name: d.spiel_name,
            teilnehmer: [...d.teilnehmer],
            endbedingung: d.endbedingung ? { ...d.endbedingung } : { typ: 'manuell', wert: null },
            start_zeitpunkt: d.start_zeitpunkt || e.zeit,
            end_zeitpunkt: null,
            status: 'laufend',
            sieger: [],
            sieger_manuell: false,
            serie_id: d.serie_id || null,
            eintraege: [],
            blatt: [],
            // Aktuelle Erfassungsreihenfolge; kann waehrend der Partie
            // geaendert werden (Konzept 6.5). `teilnehmer` bleibt die
            // Startreihenfolge.
            reihenfolge: [...d.teilnehmer],
            // Spaltenanordnung der Matrix: friert mit dem ersten erfassten
            // Wert ein und wird frei, wenn alle Werte wieder entfernt sind.
            spalten: null,
            zellen: new Set(),
            beendet_am: null,
            nachtraeglich_geaendert: false,
            geraet_name: e.geraet_name || null,
          });
        }
        break;

      case 'reihenfolge_geaendert': {
        const p = partien.get(d.partie_id);
        if (!p) break;
        // Wirkt ab dem naechsten Zug, nie rueckwirkend.
        p.reihenfolge = [...d.reihenfolge];
        break;
      }

      case 'eintrag_erfasst':
      case 'eintrag_korrigiert':
      case 'eintrag_entfernt': {
        const p = partien.get(d.partie_id);
        if (!p) break;
        p.eintraege.push({
          sequenz: d.sequenz,
          spieler_id: d.spieler_id,
          wert: e.typ === 'eintrag_entfernt' ? null : d.wert,
          markierungen: e.typ === 'eintrag_entfernt' ? null : (d.markierungen || {}),
          entfernt: e.typ === 'eintrag_entfernt',
          zeit: e.zeit,
          korrektur: e.typ !== 'eintrag_erfasst',
        });

        // Spalten einfrieren, sobald der erste Wert steht — und wieder
        // freigeben, wenn die Partie keinen Wert mehr enthaelt.
        const zelle = `${d.sequenz}|${d.spieler_id}`;
        if (e.typ === 'eintrag_entfernt') p.zellen.delete(zelle);
        else p.zellen.add(zelle);
        if (p.zellen.size === 0) p.spalten = null;
        else if (!p.spalten) p.spalten = [...p.reihenfolge];

        if (p.beendet_am && e.zeit > p.beendet_am) p.nachtraeglich_geaendert = true;
        break;
      }

      case 'blatt_stand_gesetzt':
      case 'blatt_bonus_gesetzt':
      case 'blatt_fertig_gesetzt': {
        const p = partien.get(d.partie_id);
        if (!p) break;
        p.blatt.push({
          art: e.typ === 'blatt_stand_gesetzt' ? 'stand'
            : e.typ === 'blatt_bonus_gesetzt' ? 'bonus' : 'fertig',
          spieler_id: d.spieler_id,
          farbe: d.farbe,
          felder: d.felder,
          eingefroren: d.eingefroren,
          linie: d.linie,
          status: d.status,
          fertig: d.fertig,
          zeit: e.zeit,
        });
        if (p.beendet_am && e.zeit > p.beendet_am) p.nachtraeglich_geaendert = true;
        break;
      }

      case 'partie_geloescht':
      case 'partie_abgebrochen':
        geloescht.add(d.partie_id);
        break;

      case 'partie_beendet': {
        const p = partien.get(d.partie_id);
        if (!p) break;
        p.status = 'beendet';
        p.end_zeitpunkt = d.end_zeitpunkt || e.zeit;
        p.beendet_am = e.zeit;
        p.sieger = [...(d.sieger || [])];
        break;
      }

      case 'sieger_gesetzt': {
        const p = partien.get(d.partie_id);
        if (!p) break;
        p.sieger = [...(d.sieger || [])];
        p.sieger_manuell = true;
        break;
      }

      default:
        // Unbekannte Ereignistypen werden ignoriert, nicht verworfen.
        // So kann eine aeltere App-Version Journale neuerer Versionen lesen.
        break;
    }
  }

  for (const id of geloescht) partien.delete(id);

  return { spieler, partien, notizen, geloescht };
}

/** Aktive Spieler alphabetisch, fuer Auswahllisten. */
export function aktiveSpieler(spieler) {
  return [...spieler.values()]
    .filter((s) => s.aktiv)
    .sort((a, b) => a.name.localeCompare(b.name, 'de-DE'));
}

export function laufendePartien(partien) {
  return [...partien.values()]
    .filter((p) => p.status === 'laufend')
    .sort((a, b) => (a.start_zeitpunkt < b.start_zeitpunkt ? 1 : -1));
}

export function beendetePartien(partien) {
  return [...partien.values()]
    .filter((p) => p.status === 'beendet')
    .sort((a, b) => (a.start_zeitpunkt < b.start_zeitpunkt ? 1 : -1));
}
