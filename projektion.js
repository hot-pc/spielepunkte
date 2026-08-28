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

  for (const e of sortiere(ereignisse)) {
    const d = e.daten || {};
    switch (e.typ) {
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
            beendet_am: null,
            nachtraeglich_geaendert: false,
            geraet_name: e.geraet_name || null,
          });
        }
        break;

      case 'eintrag_erfasst':
      case 'eintrag_korrigiert':
      case 'eintrag_entfernt': {
        const p = partien.get(d.partie_id);
        if (!p) break;
        p.eintraege.push({
          sequenz: d.sequenz,
          spieler_id: d.spieler_id,
          wert: e.typ === 'eintrag_entfernt' ? null : d.wert,
          entfernt: e.typ === 'eintrag_entfernt',
          zeit: e.zeit,
          korrektur: e.typ !== 'eintrag_erfasst',
        });
        if (p.beendet_am && e.zeit > p.beendet_am) p.nachtraeglich_geaendert = true;
        break;
      }

      case 'partie_beendet': {
        const p = partien.get(d.partie_id);
        if (!p) break;
        p.status = 'beendet';
        p.end_zeitpunkt = d.end_zeitpunkt || e.zeit;
        p.beendet_am = e.zeit;
        p.sieger = [...(d.sieger || [])];
        break;
      }

      case 'partie_abgebrochen': {
        const p = partien.get(d.partie_id);
        if (!p) break;
        p.status = 'abgebrochen';
        p.end_zeitpunkt = d.end_zeitpunkt || e.zeit;
        p.sieger = [];
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

  return { spieler, partien };
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
