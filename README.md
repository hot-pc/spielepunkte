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
| `calavera.js` | Calavera: Blattlogik, Wertung und Querformat-Ansicht |
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

## Infos und Hausregeln je Spiel

Über den Knopf **Infos** — in der Spielauswahl, beim Partiestart und während
der Erfassung — lässt sich zu jedem Spiel ein freier Text hinterlegen, etwa
die Antwort auf wiederkehrende Streitfragen („Bekommt der Rundensieger 0
Punkte?"). Bis 4000 Zeichen.

Das Fenster zeigt zuerst den festen Hinweis aus `spiele.json`
(`hinweis_erfassung`), darunter die selbst erfasste Notiz. Ist etwas
hinterlegt, steht am Knopf ein Punkt: **Infos ●**.

Die Notiz ist ein Journal-Ereignis (`spielnotiz_gesetzt`) und steht damit nach
dem Abgleich auf allen Geräten. Jede Änderung ist ein neues Ereignis, die
jüngste Fassung gilt; frühere bleiben im Journal erhalten. Ändern zwei Geräte
unabhängig dieselbe Notiz, gewinnt der spätere Zeitstempel — es geht also eine
der beiden Formulierungen verloren, während beide im Journal nachvollziehbar
bleiben.

Dauerhafte Regeln, die für alle gelten sollen, gehören besser in
`hinweis_erfassung` in `spiele.json`; die Notiz ist für das gedacht, was am
Tisch entschieden wird.

## Calavera — ein Blatt je Gerät

Calavera ist das erste Spiel mit dem Erfassungsmodus `blatt_calavera`: **Jeder
Spieler führt sein eigenes Blatt auf seinem eigenen Gerät**, die Blätter werden
über das Daten-Repository zusammengeführt.

Ablauf am Tisch:

1. Ein Gerät startet die Partie und wählt alle Mitspieler aus.
2. Die anderen Geräte gleichen ab; die Partie erscheint dort unter „Laufende
   Partien". Beim Öffnen wird einmal gefragt, welches Blatt dieses Gerät führt
   (gespeichert in `mein_spieler`, gerätelokal, nicht im Journal).
3. Jeder kreuzt auf seinem Blatt. Antippen eines Feldes setzt den Stand bis
   dorthin, nochmaliges Antippen desselben Feldes nimmt ein Kreuz zurück.
   Jede Rücknahme — auch das Zurückspringen um mehrere Felder — wird mit OK
   bestätigt, damit ein versehentliches Antippen keine Kreuze löscht.
   Über die Knopfreihe unter dem Kopf — oder durch Antippen eines Namens in
   der Übersicht — lässt sich das Blatt jedes Mitspielers ansehen. Fremde
   Blätter sind schreibgeschützt und zeigen den Stand des letzten Abgleichs.
4. „Stände holen" holt die Blätter der anderen; „Blatt fertig" meldet den
   eigenen Stand. **„Partie beenden"** steht in derselben Kachel und kann von
   jedem Gerät ausgelöst werden — die Partie gilt für alle. Ist noch ein Blatt
   offen oder beansprucht mehr als einer eine Bonuslinie von Hand als Erster,
   wird vorher gewarnt. Daneben liegt „Partie abbrechen".

**Aufbau des Blocks** steht vollständig in `spiele.json` unter `blatt`: vier
Farben, 13 Felder mit den Punktwerten `0 0 0 0 0 4 5 6 8 10 4 0 -3`,
Punktezone ab Feld 6, Todeszone ab Feld 11, drei Bonuslinien nach den
Feldern 3, 6 und 9 mit 4/2, 5/3 und 6/4 Punkten sowie die `abschnitte` mit der
Zahl der Rosen, die zum Einfrieren nötig sind: zwei bei den Feldern 6 bis 8
(4/5/6), drei bei den Feldern 9 und 10 (8/10).

Die Rosen erscheinen wie auf dem Papier **einmal je Abschnitt** — hochkant in
einer schmalen Spalte links, die über die Zeilen des Abschnitts zusammengefasst
ist, quer als Kopfzeile über den zugehörigen Spalten. Das kostet rund 26 px
Breite; hochkant bleiben damit etwa 60 bis 68 px je Feld.

**Wertung:** Eine Reihe zählt den Punktwert des am weitesten rechts gesetzten
Kreuzes — **aber erst, wenn sie eingefroren ist**. Solange eine Reihe offen
ist, kann dort weiter gekreuzt werden, ihr Wert steht also noch nicht fest; er
wird in der Fußzeile in Klammern und im Stand getrennt als „offene Reihen"
ausgewiesen. Zum Spielende zählen dann auch die offenen Reihen mit (im Code:
`alleWerten`), sobald die Partie beendet oder das Blatt als fertig gemeldet
ist.

Eingefroren wird über den **Farbpunkt** am Kopf der Reihe, mit Rückfrage und
Angabe des Werts. In einer eingefrorenen Reihe lässt sich nicht mehr kreuzen;
öffnen geht über denselben Farbpunkt, gedacht nur für Erfassungsfehler. Wer in
die Todeszone kreuzt, friert die Reihe automatisch ein.

Kreuze werden lückenlos von links gesetzt, deshalb genügt je Farbe die
erreichte Position — gespeichert wird eine Zahl plus die Angabe, ob
eingefroren. Höchste Gesamtpunktzahl gewinnt.

**Bonuslinien — automatisch verteilt:** Eine Linie gilt als erreicht, sobald
**alle vier** Farben den Stand `ab_feld` erreicht haben. Wer sie zuerst
erreicht hat, ermittelt die App selbst: Die Stand-Ereignisse aller Spieler
werden chronologisch nachgespielt, und für jeden wird der Zeitpunkt
festgehalten, an dem seine vierte Farbe die Linie erreichte. Der früheste
bekommt den höheren Wert, alle danach den niedrigeren. Wird ein Kreuz wieder
zurückgenommen, verfällt der Zeitpunkt — ein Erfassungsfehler sichert also
keine Erstplatzierung.

Damit das trägt, halten die Geräte während einer laufenden Partie den Abgleich
aufrecht: alle 20 Sekunden, solange ein Blatt geöffnet ist, und gebündelt vier
Sekunden nach der letzten eigenen Eingabe.

**Meldung am Tisch:** Sobald jemand als Erster alle vier Farben über eine
Linie gebracht hat, erscheint auf **jedem** Gerät ein Hinweis mit der Nummer
der Linie, dem Namen und beiden Bonuswerten; er wird mit OK bestätigt. Was
bereits gemeldet wurde, steht gerätelokal in den Merkfeldern
(`linien_gemeldet_<partie>`), damit jeder die Meldung genau einmal sieht — auch
wenn sein Abgleich sie erst später erreicht.

Antippen des Bonusfeldes setzt den Wert **von Hand** (als Erster → nach
jemandem → wieder automatisch); Handeinträge haben Vorrang und sind in der
Liste gekennzeichnet. Nur sie können sich widersprechen — beim Beenden weist
die App darauf hin, wenn zwei Spieler dieselbe Linie von Hand als Erster
beanspruchen.

**Anordnung:** Das Blatt steht ganz oben, direkt unter dem Kopf. Umschalter,
Bonuslinien, Stand und Knöpfe folgen darunter, damit nach einer Eingabe nichts
verrutscht. Zusätzlich hält die App beim Auffrischen derselben Ansicht die
Blickposition — nach oben gesprungen wird nur bei einem echten
Ansichtswechsel.

**Bildschirm bleibt an:** Solange eine Partie erfasst wird, fordert die App
eine Bildschirmsperre über die Wake-Lock-Schnittstelle an — der Bildschirm
verhält sich, als würde laufend getippt. Die Geräteeinstellung bleibt
unverändert; die Sperre gilt nur für diese Seite, endet beim Verlassen der
Erfassung und wird nach einem Wechsel in eine andere App beim Zurückkommen
neu angefordert. Unterstützt der Browser das nicht, läuft alles wie bisher.

**Zwei Ausrichtungen:** Hochkant zeigt die App vier Farbspalten und dreizehn
Zeilen — wie der Originalblock; die Felder sind dort rund 70 px breit und gut
zu treffen. Quer werden Zeilen und Spalten getauscht, damit die volle Breite
genutzt wird. Beim Drehen baut sich die Ansicht selbst um.

Der Knopf **Querformat** fordert Vollbild an und sperrt die Ausrichtung; das
Sperren ist laut Spezifikation nur im Vollbild erlaubt. Klappt es nicht, sagt
die App das und nennt die beiden Ursachen: die Bildschirmdrehung ist im Gerät
gesperrt, oder die App wurde noch mit dem alten Manifest
(`"orientation": "portrait"`) installiert. **Eine Manifest-Änderung greift bei
einer installierten PWA erst, wenn sie neu zum Startbildschirm hinzugefügt
wird.**

**Neue Ereignistypen:** `blatt_stand_gesetzt` (Partie, Spieler, Farbe, Felder,
eingefroren), `blatt_bonus_gesetzt` (Linie, Status) und
`blatt_fertig_gesetzt`. Alle append-only wie das übrige Journal; das jeweils
jüngste Ereignis je Farbe bzw. Linie gilt.

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

Automatisch abgeglichen wird beim Start der App, während einer laufenden
Calavera-Partie und nach jeder beendeten Partie. **Der Abgleich im Hintergrund
meldet sich nie von selbst** — weder bei Erfolg noch bei einem Fehler; am
Spieltisch wäre eine Einblendung nach jedem übernommenen Stand nur störend.
Sichtbar wird das Ergebnis dort, wo es hingehört: in den Blättern, im Stand und
auf dem Startbildschirm. Wer es genau wissen will, nutzt unter Daten den Knopf
„Jetzt abgleichen“ — der zeigt weiterhin einen vollständigen Bericht.

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
