# Emelys Spielewelt

Punkteerfassung für Gesellschaftsspiele. PWA ohne Bauvorgang, ohne Konto.
Daten liegen lokal in IndexedDB; der Abgleich zwischen den Geräten läuft über
ein privates Daten-Repository auf GitHub.

Adresse: https://hot-pc.github.io/spielepunkte/

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Grundgerüst |
| `styles.css` | Gestaltung (Variante „Karte“ mit Terrakotta-Akzent) |
| `spiele.json` | **alle Spielregeln als Daten** — hier werden neue Spiele ergänzt |
| `app.js` | Programmstart, Startbildschirm, Spieler, Datenbereich |
| `kern.js` | Zustand, Journal-Schreibweg, Navigation, Export/Import |
| `partie.js` | Partiestart, die drei Erfassungsbildschirme, Ergebnis |
| `statistik.js` | Auswertungsbildschirm |
| `auswertung.js` | Rechenlogik der Auswertung |
| `regeln.js` | Summen, Sonderregel-Bausteine, Endbedingung, Platzierung |
| `projektion.js` | Journal → aktueller Zustand |
| `journal.js` | Export-Paket, Import-Zusammenführung, Invariante |
| `kurznamen.js` | Kurznamen für die Spaltenköpfe |
| `db.js` | IndexedDB |
| `ui.js` | DOM-Helfer, Dialoge, Zifferntastatur |
| `github.js` | Zugriff auf das Daten-Repository (Contents-API) |
| `sw.js` | Service Worker (Offlinebetrieb) |
| `manifest.webmanifest`, `icon-*.png` | Installation auf dem Startbildschirm |

## Änderungen veröffentlichen — Pflichtschritt

Nach **jeder** Änderung an einer Datei muss in `sw.js` die Zeile

```js
const VERSION = 'v1';
```

hochgezählt werden (`v2`, `v3`, …). Ohne das behalten die Geräte die alten
Dateien aus dem Zwischenspeicher, und die Änderung kommt nicht an.

Neu hinzugefügte Dateien müssen zusätzlich in der Liste `DATEIEN` in `sw.js`
eingetragen werden.

Beim nächsten App-Start erscheint dann der Hinweis „Eine neue Version ist
bereit“ mit der Schaltfläche „Neu laden“. Während einer laufenden Partie wird
nicht auf Neuerungen geprüft.

## Neues Spiel ergänzen

Nur `spiele.json` bearbeiten, im GitHub-Web-Editor. Die Feldbeschreibung steht
am Anfang der Datei. Anschließend `VERSION` in `sw.js` hochzählen.

Ein bestehender Eintrag darf **nie** geändert werden, ohne `version` zu
erhöhen — alte Partien verweisen auf die Version, mit der sie gespielt wurden.
Praktisch heißt das: den alten Eintrag stehen lassen und einen neuen mit
gleicher `id` und höherer `version` anhängen. Die Spielauswahl zeigt immer nur
die höchste Version je Spiel.

Umgesetzter Sonderregel-Baustein: `schwellen_reset` mit `ausloeser_summe` und
`neue_summe`. Weitere Bausteine (Rundenende-Bonus, Punkte-Transfer, fester
Bonus) sind bewusst nicht umgesetzt, solange kein Spiel sie braucht.

## Datenweg — Abgleich über ein privates Repository

Alle Geräte tauschen ihre Spielstände über ein **zweites, privates**
Repository aus: `hot-pc/spielepunkte-daten`, Ordner `journale`. Der App-Code
bleibt im öffentlichen Repo, weil GitHub Pages das braucht; die Spielstände
liegen davon getrennt.

- Jedes Gerät hat dort **genau eine** Datei, `journal_<geraetename>.json`, die
  beim Abgleich überschrieben wird. Keine Zeitstempel, keine Dateiauswahl,
  kein Aufräumen.
- Eine Datei enthält den vollständigen dem Gerät bekannten Bestand, also
  eigene und von anderen übernommene Ereignisse.
- Der Abgleich läuft in einem Vorgang: Ordner auflisten, alle Journaldateien
  lesen und fehlende Ereignisse übernehmen, dann die eigene Datei
  zurückschreiben. Geschrieben wird nur, wenn sich etwas geändert hat — das
  hält die Zahl der Commits klein.
- **Auch die eigene Datei wird gelesen.** Dadurch kommt der Bestand nach einem
  Verlust des Browserspeichers vollständig zurück.
- Journale sind append-only und werden über die Ereignis-IDs zusammengeführt.
  Ein Abgleich kann nie etwas löschen.
- Ändert ein anderes Gerät dieselbe Datei zwischendurch, antwortet GitHub mit
  einem Konflikt. Die App holt dann den aktuellen Stand und schreibt erneut.
- Ohne Netz passiert nichts: der lokale Bestand bleibt unberührt, der Abgleich
  wird beim nächsten Versuch nachgeholt.

Automatisch abgeglichen wird beim Start der App und nach jeder beendeten
Partie. Zusätzlich gibt es unter Daten den Knopf „Jetzt abgleichen“.

### Zugang einrichten (einmal je Gerät)

1. Auf GitHub das private Repository `hot-pc/spielepunkte-daten` anlegen.
2. Ein Fine-grained Token erzeugen: Settings → Developer settings → Personal
   access tokens → Fine-grained tokens. Zugriff **nur** auf dieses
   Repository, Berechtigung **Contents: Read and write**.
3. In der App unter Daten → Zugang: Repository und Ordner eintragen, dann das
   Token, dann „Verbindung prüfen“.

Das Token wird ausschließlich lokal im Browser des Geräts gespeichert und nie
in ein Repository geschrieben. Ein gemeinsames Token für alle Familiengeräte
ist vorgesehen. Läuft es ab, muss es einmal neu eingetragen werden; geht ein
Gerät verloren, das Token auf GitHub widerrufen und ein neues verteilen.

Technische Grundlagen: Die GitHub-REST-API erlaubt Anfragen direkt aus dem
Browser (CORS, `Access-Control-Allow-Origin: *`). Dateien werden über die
Contents-API gelesen und geschrieben; das Limit liegt bei 100 MB, wobei
Dateien über 1 MB beim Lesen den `.raw`-Medientyp brauchen — deshalb liest die
App immer mit `Accept: application/vnd.github.raw`.

### Sicherung

Das Daten-Repository ist die Sicherung: Jeder Abgleich erzeugt einen Commit,
frühere Stände bleiben in der Versionsgeschichte einsehbar. Dadurch wächst das
Repository über die Jahre; falls es zu groß wird, legt man es einfach neu an —
der aktuelle Stand liegt ja auf jedem Gerät vollständig vor.

## Vor der ersten echten Partie prüfen

1. Seite auf dem Handy öffnen, „Zum Startbildschirm hinzufügen“
2. Gerätenamen setzen, Zugang eintragen, „Verbindung prüfen“
3. Einen Spieler anlegen, „Jetzt abgleichen“ — im Repository muss
   `journale/journal_<geraet>.json` erscheinen
4. Flugmodus einschalten, App vom Startbildschirm starten — sie muss starten,
   nicht nur weiterlaufen, und der Abgleich darf nur eine Meldung erzeugen
5. Auf dem zweiten Gerät abgleichen: der Spieler muss dort erscheinen
6. Erneut abgleichen: Meldung muss „Alles auf demselben Stand“ lauten
