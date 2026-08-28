// Journal: Aufbau der Exportdatei und Zusammenfuehrung beim Import
// (Konzept 3.2 bis 3.5). Reine Funktionen ohne Browserzugriff, damit der
// Datenweg unabhaengig von der Oberflaeche geprueft werden kann.

export const FORMAT_KENNUNG = 'spielepunkte-journal';
export const FORMAT_VERSION = 1;


/**
 * Exportpaket bauen. Enthaelt den vollstaendigen dem Geraet bekannten
 * Bestand, also eigene und zuvor importierte Ereignisse (Konzept 3.2).
 */
export function baueExport(ereignisse, geraet) {
  return {
    format: FORMAT_KENNUNG,
    format_version: FORMAT_VERSION,
    erzeugt_am: new Date().toISOString(),
    geraet: { id: geraet.id, name: geraet.name },
    anzahl: ereignisse.length,
    ereignisse,
  };
}




/** Ein einzelnes Ereignis auf Plausibilitaet pruefen. */
function ereignisGueltig(e) {
  return (
    e &&
    typeof e.id === 'string' &&
    e.id.length > 0 &&
    typeof e.typ === 'string' &&
    typeof e.zeit === 'string'
  );
}

/**
 * Inhalt einer Importdatei auswerten.
 * @param {object} inhalt geparste JSON-Datei
 * @param {Set<string>} bekannteIds bereits vorhandene Ereignis-IDs
 * @returns {{ok:boolean, meldung?:string, neue:Array, quellen:Object, uebersprungen:number}}
 */
export function lesePaket(inhalt, bekannteIds) {
  if (!inhalt || inhalt.format !== FORMAT_KENNUNG) {
    return {
      ok: false,
      meldung: 'Das ist keine Journaldatei dieser App.',
      neue: [],
      quellen: {},
      uebersprungen: 0,
    };
  }
  if (!Array.isArray(inhalt.ereignisse)) {
    return {
      ok: false,
      meldung: 'Die Datei enthaelt keine Ereignisliste.',
      neue: [],
      quellen: {},
      uebersprungen: 0,
    };
  }

  const neue = [];
  const quellen = {};
  const gesehen = new Set();
  let uebersprungen = 0;
  let ungueltig = 0;

  for (const e of inhalt.ereignisse) {
    if (!ereignisGueltig(e)) {
      ungueltig++;
      continue;
    }
    if (bekannteIds.has(e.id) || gesehen.has(e.id)) {
      uebersprungen++;
      continue;
    }
    gesehen.add(e.id);
    neue.push(e);
    const quelle = e.geraet_name || e.geraet || 'unbekannt';
    quellen[quelle] = (quellen[quelle] || 0) + 1;
  }

  return {
    ok: true,
    neue,
    quellen,
    uebersprungen,
    ungueltig,
    geraet: inhalt.geraet || null,
    erzeugt_am: inhalt.erzeugt_am || null,
  };
}
