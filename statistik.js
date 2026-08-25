// Auswertungsbildschirm (Konzept 7).

import { zustand, registriereAnsicht, navigiere, zeichne, definitionFuer, spieleZurAuswahl } from './kern.js';
import { h, kachel, kopf, taste, datumKurz, zahlKurz } from './ui.js';
import { sammle, jeSpiel, jeSpieler, kopfAnKopf, jeMonat, monatText, endbedingungText } from './auswertung.js';
import { nameVon } from './partie.js';

const filter = { reiter: 'spiel', spielId: null, spielerId: null, gegnerId: null, von: '', bis: '', kreis: [] };

registriereAnsicht('auswertung', () => {
  const spiele = spieleZurAuswahl();
  if (!filter.spielId && spiele.length) filter.spielId = spiele[0].id;
  const spielerListe = [...zustand.spieler.values()].sort((a, b) => a.name.localeCompare(b.name, 'de-DE'));
  if (!filter.spielerId && spielerListe.length) filter.spielerId = spielerListe[0].id;

  return [
    kopf('Auswertung', null, () => navigiere('start')),
    filterKachel(spielerListe),
    kachel(
      h('div', { klasse: 'tastenreihe' },
        taste('Je Spiel', () => { filter.reiter = 'spiel'; zeichne(); }, filter.reiter === 'spiel' ? 'haupt schmal' : 'schmal'),
        taste('Je Spieler', () => { filter.reiter = 'spieler'; zeichne(); }, filter.reiter === 'spieler' ? 'haupt schmal' : 'schmal'))
    ),
    ...(filter.reiter === 'spiel' ? ansichtJeSpiel(spiele) : ansichtJeSpieler(spielerListe)),
  ];
});

function filterKachel(spielerListe) {
  const vonFeld = h('input', { type: 'date', value: filter.von, onchange: (e) => { filter.von = e.target.value; zeichne(); } });
  const bisFeld = h('input', { type: 'date', value: filter.bis, onchange: (e) => { filter.bis = e.target.value; zeichne(); } });

  return kachel(
    h('h3', { text: 'Zeitraum' }),
    h('div', { klasse: 'tastenreihe' },
      h('label', { klasse: 'feld', style: 'flex:1;margin:0' }, h('span', { klasse: 'bezeichnung', text: 'von' }), vonFeld),
      h('label', { klasse: 'feld', style: 'flex:1;margin:0' }, h('span', { klasse: 'bezeichnung', text: 'bis' }), bisFeld)),

    h('h3', { text: 'Spielerkreis' }),
    h('p', { klasse: 'klein', style: 'margin-bottom:8px',
      text: 'Zeigt nur Partien, an denen alle gewählten Spieler beteiligt waren.' }),
    h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' },
      ...spielerListe.map((s) =>
        h('button', {
          klasse: filter.kreis.includes(s.id) ? 'taste schmal haupt' : 'taste schmal',
          style: 'width:auto;flex:0 0 auto',
          onclick: () => {
            const i = filter.kreis.indexOf(s.id);
            if (i >= 0) filter.kreis.splice(i, 1); else filter.kreis.push(s.id);
            zeichne();
          },
        }, s.name))),
    (filter.von || filter.bis || filter.kreis.length)
      ? h('div', { style: 'margin-top:12px' },
          taste('Filter zurücksetzen', () => { filter.von = ''; filter.bis = ''; filter.kreis = []; zeichne(); }, 'schmal'))
      : null
  );
}

function basisFilter(extra = {}) {
  return { von: filter.von || null, bis: filter.bis || null, spielerIds: filter.kreis, ...extra };
}

function leer(text) {
  return [kachel(h('p', { klasse: 'sekundaer', text }))];
}

// --- Je Spiel ------------------------------------------------------------

function ansichtJeSpiel(spiele) {
  const wahl = h('select', { onchange: (e) => { filter.spielId = e.target.value; zeichne(); } },
    ...spiele.map((s) => h('option', { value: s.id, selected: s.id === filter.spielId }, s.name)));

  const treffer = sammle(zustand, definitionFuer, basisFilter({ spielId: filter.spielId }));
  const stat = jeSpiel(treffer);

  const auswahl = kachel(h('label', { klasse: 'feld', style: 'margin:0' },
    h('span', { klasse: 'bezeichnung', text: 'Spiel' }), wahl));

  if (!stat) return [auswahl, ...leer('Für dieses Spiel gibt es im gewählten Zeitraum keine beendeten Partien.')];

  const teile = [
    auswahl,
    kachel(
      h('h2', { text: `${stat.anzahl} ${stat.anzahl === 1 ? 'Partie' : 'Partien'}` }),
      h('p', { klasse: 'sekundaer', text: `${datumKurz(stat.von)} bis ${datumKurz(stat.bis)}` }),
      h('table', { klasse: 'daten', style: 'margin-top:10px' },
        h('thead', {}, h('tr', {},
          h('th', { text: 'Spieler' }), h('th', { text: 'Partien' }), h('th', { text: 'Siege' }), h('th', { text: 'Quote' }))),
        h('tbody', {}, ...stat.gesamt.map((z) =>
          h('tr', {},
            h('td', { text: nameVon(z.spieler_id) }),
            h('td', { klasse: 'zahl', text: String(z.partien) }),
            h('td', { klasse: 'zahl', text: z.geteilte_siege ? `${z.siege} (${z.geteilte_siege} geteilt)` : String(z.siege) }),
            h('td', { klasse: 'zahl', text: `${zahlKurz(z.quote * 100, 0)} %` }))))),
      stat.gesamt.some((z) => z.geteilte_siege)
        ? h('p', { klasse: 'klein', style: 'margin-top:8px',
            text: 'Geteilte Siege zählen für alle Erstplatzierten, solange am Tisch kein Sieger festgelegt wurde.' })
        : null
    ),
  ];

  if (stat.punkte) {
    if (stat.vermischt) {
      teile.push(kachel(h('p', { klasse: 'hinweis',
        text: 'Diese Partien wurden mit unterschiedlichen Endbedingungen oder Regelversionen gespielt. ' +
          'Punktwerte sind nur innerhalb einer Gruppe vergleichbar und werden deshalb getrennt ausgewiesen.' })));
    }
    for (const gruppe of stat.gruppen) {
      teile.push(kachel(
        h('h2', { text: gruppe.name }),
        h('p', { klasse: 'sekundaer', text: `${gruppe.anzahl} ${gruppe.anzahl === 1 ? 'Partie' : 'Partien'}` }),
        h('table', { klasse: 'daten', style: 'margin-top:10px' },
          h('thead', {}, h('tr', {},
            h('th', { text: 'Spieler' }), h('th', { text: 'Ø Endsumme' }),
            h('th', { text: 'niedrigste' }), h('th', { text: 'höchste' }))),
          h('tbody', {}, ...gruppe.zeilen.map((z) =>
            h('tr', {},
              h('td', { text: nameVon(z.spieler_id) }),
              h('td', { klasse: 'zahl', text: zahlKurz(z.schnitt) }),
              h('td', { klasse: 'zahl', text: zahlKurz(z.min, 0) }),
              h('td', { klasse: 'zahl', text: zahlKurz(z.max, 0) })))))
      ));
    }
    teile.push(kachel(
      h('h2', { text: 'Einzelwerte' }),
      h('p', { klasse: 'sekundaer',
        text: `höchster erfasster Wert ${zahlKurz(stat.hoechsterEinzelwert, 0)}, ` +
          `niedrigster ${zahlKurz(stat.niedrigsterEinzelwert, 0)}` })
    ));
  } else {
    teile.push(kachel(h('p', { klasse: 'sekundaer',
      text: 'Bei diesem Spiel werden keine Punkte erfasst. Es stehen nur Siegzahlen zur Verfügung.' })));
  }

  teile.push(partienListe(treffer));
  return teile;
}

// --- Je Spieler ----------------------------------------------------------

function ansichtJeSpieler(spielerListe) {
  const wahl = h('select', { onchange: (e) => { filter.spielerId = e.target.value; zeichne(); } },
    ...spielerListe.map((s) => h('option', { value: s.id, selected: s.id === filter.spielerId }, s.name)));

  const auswahl = kachel(h('label', { klasse: 'feld', style: 'margin:0' },
    h('span', { klasse: 'bezeichnung', text: 'Spieler' }), wahl));

  if (!filter.spielerId) return [auswahl, ...leer('Noch keine Spieler angelegt.')];

  const alle = sammle(zustand, definitionFuer, basisFilter());
  const eigene = alle.filter((t) => t.partie.teilnehmer.includes(filter.spielerId));
  if (!eigene.length) return [auswahl, ...leer('Für diesen Spieler gibt es im gewählten Zeitraum keine beendeten Partien.')];

  const gesamt = jeSpieler(eigene).find((z) => z.spieler_id === filter.spielerId);

  const jeSpielZeilen = [];
  for (const spiel of spieleZurAuswahl()) {
    const teil = eigene.filter((t) => t.partie.spiel_id === spiel.id);
    if (!teil.length) continue;
    const z = jeSpieler(teil).find((r) => r.spieler_id === filter.spielerId);
    jeSpielZeilen.push({ name: spiel.name, ...z });
  }

  const gegner = spielerListe.filter((s) => s.id !== filter.spielerId);
  if (gegner.length && (!filter.gegnerId || filter.gegnerId === filter.spielerId)) filter.gegnerId = gegner[0].id;
  const duell = filter.gegnerId ? kopfAnKopf(alle, filter.spielerId, filter.gegnerId) : null;
  const monate = jeMonat(eigene, filter.spielerId);

  return [
    auswahl,
    kachel(
      h('h2', { text: `${gesamt.siege} von ${gesamt.partien} Partien gewonnen` }),
      h('p', { klasse: 'sekundaer', text: `Siegquote ${zahlKurz(gesamt.quote * 100, 0)} %` +
        (gesamt.geteilte_siege ? `, davon ${gesamt.geteilte_siege} geteilt` : '') })
    ),

    kachel(
      h('h2', { text: 'Je Spiel' }),
      h('table', { klasse: 'daten' },
        h('thead', {}, h('tr', {},
          h('th', { text: 'Spiel' }), h('th', { text: 'Partien' }), h('th', { text: 'Siege' }), h('th', { text: 'Quote' }))),
        h('tbody', {}, ...jeSpielZeilen.map((z) =>
          h('tr', {},
            h('td', { text: z.name }),
            h('td', { klasse: 'zahl', text: String(z.partien) }),
            h('td', { klasse: 'zahl', text: String(z.siege) }),
            h('td', { klasse: 'zahl', text: `${zahlKurz(z.quote * 100, 0)} %` })))))
    ),

    gegner.length
      ? kachel(
          h('h2', { text: 'Kopf an Kopf' }),
          h('label', { klasse: 'feld' },
            h('span', { klasse: 'bezeichnung', text: 'gegen' }),
            h('select', { onchange: (e) => { filter.gegnerId = e.target.value; zeichne(); } },
              ...gegner.map((s) => h('option', { value: s.id, selected: s.id === filter.gegnerId }, s.name)))),
          duell.anzahl === 0
            ? h('p', { klasse: 'sekundaer', text: 'Noch keine gemeinsame Partie im gewählten Zeitraum.' })
            : h('table', { klasse: 'daten' },
                h('tbody', {},
                  h('tr', {}, h('td', { text: 'Gemeinsame Partien' }), h('td', { klasse: 'zahl', text: String(duell.anzahl) })),
                  h('tr', {}, h('td', { text: `Siege ${nameVon(filter.spielerId)}` }), h('td', { klasse: 'zahl', text: String(duell.siegeA) })),
                  h('tr', {}, h('td', { text: `Siege ${nameVon(filter.gegnerId)}` }), h('td', { klasse: 'zahl', text: String(duell.siegeB) })),
                  h('tr', {}, h('td', { text: 'Andere Ausgänge' }), h('td', { klasse: 'zahl', text: String(duell.andere) }))))
        )
      : null,

    kachel(
      h('h2', { text: 'Zeitliche Entwicklung' }),
      h('table', { klasse: 'daten' },
        h('thead', {}, h('tr', {},
          h('th', { text: 'Monat' }), h('th', { text: 'Partien' }), h('th', { text: 'Siege' }), h('th', { text: 'Quote' }))),
        h('tbody', {}, ...monate.map((m) =>
          h('tr', {},
            h('td', { text: monatText(m.monat) }),
            h('td', { klasse: 'zahl', text: String(m.partien) }),
            h('td', { klasse: 'zahl', text: String(m.siege) }),
            h('td', { klasse: 'zahl', text: `${zahlKurz((m.siege / m.partien) * 100, 0)} %` })))))
    ),

    partienListe(eigene),
  ];
}

// --- Partienliste --------------------------------------------------------

function partienListe(treffer) {
  const zeigen = treffer.slice(0, 30);
  return kachel(
    h('h2', { text: 'Partien' }),
    h('ul', { klasse: 'liste', style: 'margin:0 -16px -16px' },
      ...zeigen.map(({ partie, erg }) =>
        h('li', {}, h('button', { klasse: 'eintrag', onclick: () => navigiere('ergebnis', { partieId: partie.id }) },
          h('span', { klasse: 'haupt' },
            h('span', { klasse: 'titel', text: partie.spiel_name }),
            h('span', { klasse: 'klein', style: 'display:block',
              text: `${datumKurz(partie.start_zeitpunkt)} · ${endbedingungText(partie.endbedingung)} · ` +
                (erg.sieger.length === 1 ? nameVon(erg.sieger[0]) : erg.sieger.length ? 'Gleichstand' : 'ohne Sieger') })),
          partie.nachtraeglich_geaendert ? h('span', { klasse: 'marke still', text: 'geändert' }) : null,
          h('span', { klasse: 'pfeil', text: '›' })))),
      treffer.length > zeigen.length
        ? h('li', {}, h('div', { klasse: 'eintrag statisch' },
            h('span', { klasse: 'klein', text: `${treffer.length - zeigen.length} weitere Partien nicht angezeigt` })))
        : null)
  );
}
