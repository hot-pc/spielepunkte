# Emelys Spielewelt

Punkteerfassung für Gesellschaftsspiele. PWA ohne Bauvorgang, ohne Konto, ohne
Cloud-Anbindung. Daten liegen lokal in IndexedDB, der Austausch zwischen
Geräten läuft über Export- und Importdateien im OneDrive-Ordner `SpielständeAPP`.

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

## Datenweg

- Jedes Gerät schreibt Dateien nach dem Muster
  `journal_<geraetename>_JJJJMMTT-HHMM.txt`.
- **Warum `.txt` und nicht `.json`:** Chromium erlaubt beim Datei-Teilen nur
  gängige Audio-, Bild-, Text- und Video-Endungen, um das Teilen ausführbarer
  Dateien zu blockieren. Mit `.json` liefert `navigator.canShare()` immer
  `false`, der Teilen-Dialog erscheint nie und die Datei landet im Ordner
  Downloads. Der Inhalt der Datei ist unverändert JSON und mit jedem
  Texteditor lesbar.
- Der Export versucht drei Wege in dieser Reihenfolge: Teilen-Dialog
  (Android, OneDrive direkt wählbar), Speichern-Dialog mit Ordnerwahl
  (Windows, Chrome), Download. Welcher Weg auf dem Gerät greift, steht im
  Datenbereich unter „Exportieren“.
- Steht nur der Download zur Verfügung: in Chrome unter Einstellungen →
  Downloads die Option „Fragen, wo Dateien gespeichert werden“ einschalten.
  Dann erscheint ein Ordnerdialog mit OneDrive als Ziel.
- Eine Exportdatei enthält den **vollständigen dem Gerät bekannten Bestand**,
  also eigene und zuvor importierte Ereignisse.
- Der Import überspringt bereits bekannte Ereignis-IDs, ist also beliebig oft
  wiederholbar. Mehrfachauswahl ist möglich. Es gibt keinen Endungsfilter,
  damit im OneDrive-Ordner alle Journaldateien wählbar bleiben.
- Der Export bricht ab, wenn der Bestand kleiner wäre als beim letzten Export.
- Journale sind append-only. Korrekturen und Löschungen sind eigene Ereignisse.

## Vor der ersten echten Partie prüfen

1. Seite auf dem Handy öffnen, „Zum Startbildschirm hinzufügen“
2. Gerätenamen setzen, einen Spieler anlegen
3. Flugmodus einschalten, App vom Startbildschirm starten — sie muss starten,
   nicht nur weiterlaufen
4. Exportieren, Datei in OneDrive `SpielständeAPP` ablegen
5. Auf dem zweiten Gerät importieren: der Spieler muss dort erscheinen
6. Denselben Import wiederholen: Meldung muss „0 neue Ereignisse“ lauten
