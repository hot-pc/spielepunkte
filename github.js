// Zugriff auf das private Daten-Repository über die GitHub Contents-API.
//
// Die API erlaubt Anfragen direkt aus dem Browser (CORS mit
// Access-Control-Allow-Origin: *). Es wird kein Server dazwischen gebraucht.
//
// Das Token wird ausschließlich lokal auf dem Gerät gespeichert und niemals
// in ein Repository geschrieben.

const BASIS = 'https://api.github.com';
const API_VERSION = '2022-11-28';

/** UTF-8-sichere Base64-Kodierung, auch für große Texte. */
export function nachBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let roh = '';
  const block = 0x8000;
  for (let i = 0; i < bytes.length; i += block) {
    roh += String.fromCharCode(...bytes.subarray(i, i + block));
  }
  return btoa(roh);
}

function kopfzeilen(token, accept = 'application/vnd.github+json') {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    'X-GitHub-Api-Version': API_VERSION,
  };
}

/** Fehlertext aus einer Antwort ableiten, in verständlichem Deutsch. */
async function fehlertext(antwort, was) {
  if (antwort.status === 401) {
    return 'Das Token wurde abgelehnt. Ist es abgelaufen oder falsch eingetragen?';
  }
  if (antwort.status === 403) {
    return 'Zugriff verweigert. Hat das Token für dieses Repository die Berechtigung ' +
      '„Contents: Read and write“?';
  }
  if (antwort.status === 404) {
    return 'Nicht gefunden. Stimmen Repository-Name und Ordner, und hat das Token Zugriff darauf?';
  }
  if (antwort.status === 409 || antwort.status === 422) {
    return 'Die Datei wurde zwischenzeitlich von einem anderen Gerät geändert.';
  }
  let zusatz = '';
  try {
    const inhalt = await antwort.json();
    if (inhalt && inhalt.message) zusatz = ` (${inhalt.message})`;
  } catch { /* ohne Auswirkung */ }
  return `${was} ist gescheitert: ${antwort.status}${zusatz}`;
}

function pfadTeile(repo) {
  const [besitzer, name] = String(repo || '').split('/');
  return { besitzer, name };
}

/**
 * Inhalt eines Ordners auflisten.
 * Ein noch nicht angelegter Ordner gilt als leer, nicht als Fehler.
 */
export async function ordnerListe({ repo, ordner, token }) {
  const { besitzer, name } = pfadTeile(repo);
  const antwort = await fetch(
    `${BASIS}/repos/${besitzer}/${name}/contents/${encodeURI(ordner)}`,
    { headers: kopfzeilen(token), cache: 'no-store' }
  );

  if (antwort.status === 404) return { ok: true, dateien: [], leer: true };
  if (!antwort.ok) return { ok: false, meldung: await fehlertext(antwort, 'Das Auflisten') };

  const inhalt = await antwort.json();
  if (!Array.isArray(inhalt)) {
    return { ok: false, meldung: 'Der angegebene Ordner ist eine Datei, kein Ordner.' };
  }
  return {
    ok: true,
    dateien: inhalt
      .filter((e) => e.type === 'file' && /\.(json|txt)$/i.test(e.name))
      .map((e) => ({ name: e.name, pfad: e.path, sha: e.sha, groesse: e.size })),
  };
}

/**
 * Datei als Rohtext lesen. Der raw-Medientyp wird verwendet, weil er auch
 * für Dateien über 1 MB gilt.
 */
export async function leseDatei({ repo, token }, pfad) {
  const { besitzer, name } = pfadTeile(repo);
  const antwort = await fetch(
    `${BASIS}/repos/${besitzer}/${name}/contents/${encodeURI(pfad)}`,
    { headers: kopfzeilen(token, 'application/vnd.github.raw'), cache: 'no-store' }
  );
  if (!antwort.ok) return { ok: false, meldung: await fehlertext(antwort, 'Das Lesen') };
  return { ok: true, text: await antwort.text() };
}

/**
 * Datei anlegen oder überschreiben. `sha` ist bei einer bestehenden Datei
 * zwingend — er belegt, dass der bekannte Stand überschrieben wird.
 */
export async function schreibeDatei({ repo, token }, pfad, text, sha, meldungstext) {
  const { besitzer, name } = pfadTeile(repo);
  const antwort = await fetch(
    `${BASIS}/repos/${besitzer}/${name}/contents/${encodeURI(pfad)}`,
    {
      method: 'PUT',
      headers: { ...kopfzeilen(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: meldungstext || `Spielstände aktualisiert`,
        content: nachBase64(text),
        ...(sha ? { sha } : {}),
      }),
    }
  );
  if (!antwort.ok) {
    return {
      ok: false,
      konflikt: antwort.status === 409 || antwort.status === 422,
      meldung: await fehlertext(antwort, 'Das Schreiben'),
    };
  }
  const inhalt = await antwort.json();
  return { ok: true, sha: inhalt && inhalt.content ? inhalt.content.sha : null };
}

/** Zugang prüfen: Repository erreichbar und Schreibrecht vorhanden? */
export async function pruefeZugang({ repo, token }) {
  const { besitzer, name } = pfadTeile(repo);
  if (!besitzer || !name) {
    return { ok: false, meldung: 'Das Repository muss die Form besitzer/name haben.' };
  }
  if (!token) return { ok: false, meldung: 'Es ist kein Token eingetragen.' };

  const antwort = await fetch(`${BASIS}/repos/${besitzer}/${name}`, {
    headers: kopfzeilen(token),
    cache: 'no-store',
  });
  if (!antwort.ok) return { ok: false, meldung: await fehlertext(antwort, 'Die Prüfung') };

  const inhalt = await antwort.json();
  const schreiben = inhalt && inhalt.permissions && inhalt.permissions.push;
  return {
    ok: true,
    privat: !!(inhalt && inhalt.private),
    schreibrecht: !!schreiben,
    meldung: schreiben
      ? null
      : 'Das Token darf lesen, aber nicht schreiben. Berechtigung „Contents: Read and write“ setzen.',
  };
}

/** Dateiname dieses Geräts. */
export function eigenerDateiname(geraetName) {
  const name = (geraetName || 'geraet')
    .trim()
    .toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `journal_${name || 'geraet'}.json`;
}
