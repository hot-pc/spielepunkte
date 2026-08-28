// Kleine Oberflaechen-Bausteine. Kein Framework, kein Bauvorgang.

export function h(tag, attrs = {}, ...kinder) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'klasse') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kind of kinder.flat(3)) {
    if (kind === null || kind === undefined || kind === false) continue;
    el.append(kind instanceof Node ? kind : document.createTextNode(String(kind)));
  }
  return el;
}

export function kachel(...kinder) {
  return h('section', { klasse: 'kachel' }, ...kinder);
}

export function kopf(titel, unterzeile, zurueck) {
  return h(
    'header',
    { klasse: 'kachel kopf' },
    zurueck ? h('button', { klasse: 'zurueck', 'aria-label': 'Zurück', onclick: zurueck }, '‹') : null,
    h('div', {}, h('h1', { text: titel }), unterzeile ? h('div', { klasse: 'unterzeile', text: unterzeile }) : null)
  );
}

export function taste(text, onclick, art = '') {
  return h('button', { klasse: `taste ${art}`.trim(), onclick }, text);
}

export function meldung(text) {
  const behaelter = document.getElementById('meldung');
  behaelter.replaceChildren(h('div', { klasse: 'blase', text }));
  clearTimeout(meldung._uhr);
  meldung._uhr = setTimeout(() => behaelter.replaceChildren(), 3400);
}

/** Overlay-Dialog. Liefert ein Promise mit dem Ergebnis der gewaehlten Taste. */
export function dialog({ titel, inhalt, tasten }) {
  return new Promise((fertig) => {
    const schliessen = (wert) => {
      overlay.remove();
      document.removeEventListener('keydown', beiTaste);
      fertig(wert);
    };
    const beiTaste = (e) => { if (e.key === 'Escape') schliessen(null); };

    const karte = h(
      'div',
      { klasse: 'karte' },
      h('h2', { text: titel }),
      ...(Array.isArray(inhalt) ? inhalt : [inhalt]).filter(Boolean),
      h(
        'div',
        { klasse: 'tastenreihe', style: 'margin-top:14px' },
        ...tasten.map((t) =>
          taste(t.text, () => {
            if (t.pruefe && t.pruefe() === false) return;
            schliessen(t.wert === undefined ? true : (typeof t.wert === 'function' ? t.wert() : t.wert));
          }, t.art || '')
        )
      )
    );
    const overlay = h('div', { klasse: 'overlay', onclick: (e) => { if (e.target === overlay) schliessen(null); } }, karte);
    document.body.append(overlay);
    document.addEventListener('keydown', beiTaste);
    const ersteEingabe = karte.querySelector('input');
    if (ersteEingabe) setTimeout(() => ersteEingabe.focus(), 30);
  });
}

export async function frage(titel, text, jaText = 'Ja', neinText = 'Abbrechen') {
  return dialog({
    titel,
    inhalt: text ? h('p', { klasse: 'sekundaer', text }) : null,
    tasten: [
      { text: neinText, wert: false },
      { text: jaText, wert: true, art: 'haupt' },
    ],
  });
}

export async function textFrage({ titel, bezeichnung, vorbelegung = '', hinweis, tasteText = 'Speichern' }) {
  const feld = h('input', { type: 'text', value: vorbelegung, autocapitalize: 'words' });
  const wert = await dialog({
    titel,
    inhalt: [
      h('label', { klasse: 'feld' }, h('span', { klasse: 'bezeichnung', text: bezeichnung }), feld),
      hinweis ? h('p', { klasse: 'klein', text: hinweis }) : null,
    ],
    tasten: [
      { text: 'Abbrechen', wert: null },
      { text: tasteText, art: 'haupt', wert: () => feld.value.trim(), pruefe: () => feld.value.trim().length > 0 },
    ],
  });
  return wert || null;
}

/**
 * Zifferntastatur. Haelt den Eingabepuffer selbst und meldet den fertigen
 * Wert per uebernehmen(zahl).
 */
export function zifferntastatur({ negativErlaubt, uebernehmen, anzeigeWer, startwert = '' }) {
  let puffer = startwert === null || startwert === undefined ? '' : String(startwert);
  // Ein vorbelegter Wert wird beim ersten Tastendruck ersetzt, nicht
  // verlaengert. Sonst wuerde aus einer Korrektur von 12 auf 9 die Zahl 129.
  let vorbelegt = puffer !== '';

  const wertFeld = h('span', { klasse: 'wert zahl' });
  const werFeld = h('span', { klasse: 'wer' });
  const anzeige = h('div', { klasse: 'anzeige' }, werFeld, wertFeld);
  const zeichne = () => {
    wertFeld.textContent = puffer === '' || puffer === '-' ? '–' : puffer;
    wertFeld.style.opacity = vorbelegt ? '0.55' : '1';
    werFeld.textContent = anzeigeWer();
  };

  const frisch = () => { if (vorbelegt) { puffer = ''; vorbelegt = false; } };

  const ziffer = (z) => {
    frisch();
    if (puffer.replace('-', '').length < 6) { puffer += z; zeichne(); }
  };
  const vorzeichen = () => {
    frisch();
    puffer = puffer.startsWith('-') ? puffer.slice(1) : `-${puffer}`;
    zeichne();
  };
  const loeschen = () => {
    if (vorbelegt) { puffer = ''; vorbelegt = false; } else puffer = puffer.slice(0, -1);
    zeichne();
  };
  const fertig = () => {
    const zahl = Number.parseInt(puffer, 10);
    if (!Number.isFinite(zahl)) { meldung('Bitte einen Wert eingeben.'); return; }
    uebernehmen(zahl);
  };

  const t = (text, fn, klasse = '') => h('button', { klasse, onclick: fn, type: 'button' }, text);
  const felder = h(
    'div',
    { klasse: 'tastatur' },
    ...['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((z) => t(z, () => ziffer(z))),
    negativErlaubt ? t('±', vorzeichen) : t('±', null, 'aus'),
    t('0', () => ziffer('0')),
    t('⌫', loeschen)
  );

  zeichne();
  // Übernehmen steht neben der Anzeige und damit oberhalb der Tastatur:
  // so ist der Knopf ohne Scrollen erreichbar.
  const eingabezeile = h('div', { klasse: 'eingabezeile' }, anzeige, taste('Übernehmen', fertig, 'haupt'));
  return {
    element: h('div', {}, eingabezeile, felder),
    setzeStartwert(v) {
      puffer = v === null || v === undefined ? '' : String(v);
      vorbelegt = puffer !== '';
      zeichne();
    },
    aktualisiere: zeichne,
  };
}

export function datumKurz(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function datumZeit(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
}

export function zahlKurz(n, stellen = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('de-DE', { maximumFractionDigits: stellen });
}
