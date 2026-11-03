# Strava Dashboard

Ein Programm für Windows, das deine Strava-Aktivitäten übersichtlich auswertet und schöne Bilder und Videos zum Teilen macht.

- **Übersicht**: wie fit du gerade bist, deine Woche, dein nächster Wettkampf, die letzten Einheiten
- **Aktivitäten**: Woche, Monat oder Jahr mit Zahlen, Kalender und allen Einheiten
- **Körperdaten** (optional, mit Garmin): Schlaf, HRV, Ruhepuls, Body Battery, VO2max
- **Zeiten**: Bestzeiten, Rekorde und wie du dich entwickelst
- **Karte**: alle deine Strecken auf einer Karte
- **Share Studio**: Bild einer Einheit, Sammelbild einer ganzen Woche oder ein Video, in dem die Strecken nacheinander erscheinen (mit Sound)

Alles läuft auf deinem eigenen PC. Deine Daten gehen an niemanden außer Strava (und Garmin, wenn du das verbindest).

---

## Was du brauchst

- Einen PC mit **Windows 10 oder 11**
- Ein **Strava-Konto**
- Optional: ein **Garmin-Konto** (für die Körperdaten)
- Etwa **15 Minuten** für die Einrichtung

Python (die Programmiersprache, in der das Programm geschrieben ist) brauchst du nicht selbst zu installieren: Das erledigt die Startdatei für dich.

---

## Installation

### Schritt 1: Herunterladen

1. Öffne <https://github.com/tp-codings/strava_dashboard>
2. Klicke oben rechts auf den grünen Knopf **„Code“** und dann auf **„Download ZIP“**
3. Öffne deinen Ordner **Downloads**, klicke mit der rechten Maustaste auf `strava_dashboard-main.zip` und wähle **„Alle extrahieren …“**
4. Verschiebe den entpackten Ordner an einen festen Ort, zum Beispiel nach **Dokumente**
   (nicht nach „C:\Programme“, und nicht im Download-Ordner lassen, falls du den öfter aufräumst)

### Schritt 2: Starten

1. Öffne den Ordner und doppelklicke auf **`Strava Dashboard starten.cmd`**
2. Falls Windows warnt („Der Computer wurde durch Windows geschützt“): auf **„Weitere Informationen“** klicken, dann auf **„Trotzdem ausführen“**
3. Ein schwarzes Fenster richtet alles ein:
   - Ist noch kein Python da, fragt es: *„Soll Python jetzt automatisch installiert werden [J,N]?“* → **J** drücken.
     Danach das schwarze Fenster schließen und die Datei **noch einmal doppelklicken**.
   - Beim ersten Mal dauert das 1–2 Minuten. Danach liegt auf dem Desktop eine Verknüpfung **„Strava Dashboard“**.
4. Das Dashboard öffnet sich in einem eigenen Fenster mit der **Einrichtung**

Ab jetzt startest du das Programm einfach über die Verknüpfung auf dem Desktop.

### Schritt 3: Mit Strava verbinden

Strava erlaubt Programmen nur Zugriff, wenn du dafür eine eigene, kostenlose „API-App“ anlegst. Das klingt technischer, als es ist:

1. Melde dich im Browser bei Strava an und öffne <https://www.strava.com/settings/api>
2. Fülle das Formular so aus:

   | Feld | Was du einträgst |
   |---|---|
   | Application Name | `Mein Dashboard` (beliebig) |
   | Category | `Data Importer` (oder etwas anderes) |
   | Club | leer lassen |
   | Website | `http://localhost` |
   | Application Description | leer lassen oder irgendwas |
   | **Authorization Callback Domain** | **`localhost`** (genau so, ohne http und ohne Schrägstrich) |

3. Bestätige die Bedingungen und klicke auf **„Create“**.
   Falls Strava nach einem Bild für die App fragt: irgendein Bild hochladen (zum Beispiel ein Foto vom Handy).
4. Du siehst jetzt deine App mit **Client ID** (eine Zahl) und **Client Secret** (auf **„Show“** klicken, eine lange Buchstaben-Zahlen-Folge)
5. Kopiere beide in die Einrichtung des Dashboards und klicke auf **„Mit Strava verbinden …“**
6. Im Browser öffnet sich Strava. Lass den Haken bei **„Aktivitätsdaten ansehen“** (bzw. „View data about your activities“) gesetzt und klicke auf **„Autorisieren“**
7. Es erscheint „Mit Strava verbunden ✔“. Diesen Browser-Tab kannst du schließen.

Das Dashboard lädt jetzt deine Aktivitäten. Die neuesten siehst du nach wenigen Sekunden, ältere kommen im Hintergrund dazu.
Bestzeiten, Runden und Wetter füllen sich über die nächsten Stunden bis Tage nach (Strava erlaubt nur eine begrenzte Zahl
an Abrufen pro Viertelstunde und Tag).

> **Wichtig:** Client Secret und Zugangsdaten bleiben verschlüsselt auf deinem PC (siehe „Sicherheit“). Gib sie niemandem weiter.

### Schritt 4: Garmin (optional)

Wenn du eine Garmin-Uhr hast, kannst du Schlaf, HRV, Ruhepuls und mehr anzeigen lassen:

1. In der Einrichtung (oder später unter **Körperdaten**) **E-Mail und Passwort von Garmin Connect** eingeben
2. Wenn Garmin einen **Bestätigungscode** schickt (per E-Mail oder App), diesen eintragen

Das Passwort wird nicht gespeichert, nur ein Zugangs-Schlüssel von Garmin, und der verschlüsselt (siehe „Sicherheit“).
Ohne Garmin fehlt nur der Bereich Körperdaten, alles andere funktioniert.

> **Gut zu wissen:** Garmin bietet für so etwas keinen offiziellen Zugang. Das Programm nutzt das freie Paket
> [garminconnect](https://github.com/cyberjunky/python-garminconnect), das sich wie die Garmin-Connect-Webseite anmeldet.
> Garmin kann das jederzeit ändern (dann geht der Abruf eine Weile nicht, bis es ein Update gibt) oder bei zu vielen
> Anmeldungen kurz sperren. Wer das nicht möchte, lässt Garmin einfach weg.

### Schritt 5: Ziel (optional)

Trainierst du auf einen Wettkampf hin? Trag ihn mit Datum ein, dann zeigt die Übersicht den Countdown.
Ein Wochenziel in Stunden ist auch möglich. Beides lässt sich später unter **Einstellungen …** ändern.

---

## Bedienung in Kürze

- Links wählst du den Bereich. Unten links: **Aktualisieren** (neue Einheiten holen), **Einstellungen …**, **Einrichtung …**
- Klick auf eine Einheit öffnet die Details. Dort **„Teilen …“** für ein Bild dieser Einheit, **„Studio …“** für mehr Möglichkeiten
- In **Aktivitäten** oben **„Woche/Monat/Jahr teilen …“**: Sammelbild oder Video aus allen Einheiten des Zeitraums
- Im Studio kannst du Werte und die Route im Bild **mit der Maus verschieben**. Rückgängig mit dem Pfeil oben oder Strg+Z.
  „Als Standard“ merkt sich dein Design für das nächste Mal.
- Videos werden als normale MP4-Datei gespeichert (1080 Pixel breit, 30 Bilder pro Sekunde) und lassen sich direkt in
  Instagram, WhatsApp oder Schnittprogramme wie DaVinci Resolve laden.

**Zum Ausprobieren ohne Strava:** `Demo starten.cmd` öffnet das Dashboard mit erfundenen Trainingsdaten.

---

## Update auf eine neue Version

1. Neue Version wie in Schritt 1 herunterladen und entpacken
2. Den alten Programmordner löschen und den neuen an dieselbe Stelle legen
3. Einmal `Strava Dashboard starten.cmd` doppelklicken (richtet Python neu ein, 1–2 Minuten)

Deine Einstellungen, der Strava-Zugang und die geladenen Daten bleiben dabei erhalten, denn sie liegen nicht im Programmordner (siehe unten).

Mit Git geht es so: `git pull` im Programmordner, danach einmal die Startdatei.

---

## Wo liegen meine Daten?

Einstellungen und geladene Daten liegen in **`%APPDATA%\StravaDashboard`**
(im Explorer oben in die Adresszeile `%APPDATA%\StravaDashboard` eintippen und Enter drücken):

| Ordner | Inhalt |
|---|---|
| `config\strava_dashboard.json` | Einstellungen (Puls, Ziele, Designs, Fenstergröße), nichts Geheimes |
| `cache\` | geladene Aktivitäten, Bestzeiten, Runden, Wetter, Garmin-Daten. Darf gelöscht werden, wird dann neu geladen. |
| `logs\` | Fehlerberichte, falls das Programm abstürzt |
| `ton\` | eigene Sounds für die Videos (optional, siehe unten) |

Die **Zugangsdaten** (Strava und Garmin) liegen getrennt davon verschlüsselt in **`%LOCALAPPDATA%\StravaDashboard\geheim`**.

Bilder und Videos speicherst du, wohin du willst (Vorschlag: `Bilder\Strava Dashboard`).

---

## Sicherheit

- **Passwörter** (Strava, Garmin) gibt das Programm nie ein und speichert sie nie. Bei Strava meldest du dich im Browser auf
  strava.com an, bei Garmin geht das Passwort nur einmal direkt an Garmin.
- **Zugangsdaten** (Strava: Client Secret und Tokens, Garmin: Zugangs-Schlüssel) werden mit der Windows-Verschlüsselung
  **DPAPI** gespeichert, demselben Verfahren, mit dem Edge und Chrome deine Passwörter schützen. Die Dateien lassen sich nur
  unter deinem Windows-Konto auf diesem PC öffnen. Ein Backup, ein kopierter Ordner oder ein anderes Benutzerkonto können
  damit nichts anfangen.
- Zugangsdaten liegen **nirgends im Klartext** auf der Platte. Ältere Versionen haben sie als Datei abgelegt
  (`%APPDATA%\StravaDashboard\config\strava.secrets.json`, `%USERPROFILE%\.garminconnect\garmin_tokens.json`); beim ersten
  Start übernimmt das Programm sie verschlüsselt und löscht die alten Dateien.
- Was DPAPI **nicht** verhindert (das kann kein Programm, auch kein Browser): Schadsoftware, die unter deinem eigenen
  Windows-Konto läuft. Halte Windows und deinen Virenschutz aktuell.
- Der Strava-Zugang darf nur **lesen** (deine Aktivitäten). Der Garmin-Schlüssel ist dagegen eine volle Anmeldung an deinem
  Garmin-Konto, deshalb ist er besonders geschützt. Du kannst ihn jederzeit unter **Körperdaten → Trennen** löschen.
- Das Programm ist nur auf deinem eigenen PC erreichbar (`127.0.0.1` mit Zufalls-Schlüssel), nicht aus dem Netzwerk.
- Zugriff widerrufen: Strava unter <https://www.strava.com/settings/apps>, Garmin durch Ändern des Passworts.

**Was wird ins Internet geschickt?**
- An **Strava**: nur Abrufe deiner eigenen Aktivitäten
- An **Open-Meteo** (kostenloser Wetterdienst): für das Wetter je Einheit nur das Datum und der Startort auf etwa 10 km gerundet
- An **Garmin**: nur wenn du es verbindest, deine Anmeldung und der Abruf deiner Tageswerte
- Kartenbilder kommen von **OpenStreetMap**

---

## Eigene Sounds für Videos (optional)

Ohne Zutun erzeugt das Programm die Sound-Effekte selbst. Wer eigene Sounds möchte, legt MP3-Dateien mit genau diesen Namen in
`%APPDATA%\StravaDashboard\ton`: `woosh.mp3`, `blop.mp3`, `klick.mp3`, `riser.mp3`, `impact.mp3`, `bling.mp3`.
Für Hintergrundmusik: `musik_lofi.mp3` und/oder `musik_daytona.mp3` (dann erscheint im Studio die Auswahl „Musik“).
Achte darauf, dass du die Sounds verwenden darfst.

---

## Wenn etwas nicht klappt

| Problem | Lösung |
|---|---|
| Doppelklick auf die Startdatei macht nichts / Fenster blitzt nur kurz auf | Rechtsklick auf `Strava Dashboard starten.cmd` → „Öffnen“. Bleibt das Fenster mit einer Meldung stehen, steht dort, was fehlt. |
| „Python wurde nicht gefunden“ | Python 3.12 oder neuer von <https://www.python.org/downloads/> installieren, im Installer **„Add python.exe to PATH“** anhaken, danach die Startdatei erneut öffnen. |
| Nach einem Python-Update startet nichts mehr | Im Programmordner den Ordner `.venv` löschen und die Startdatei erneut öffnen. |
| Strava: „Port 8123 ist belegt“ | Läuft das Dashboard zweimal? Alle Fenster schließen und neu starten. |
| Strava: „redirect_uri invalid“ / „Bad Request“ | In der Strava-API-App muss bei **Authorization Callback Domain** genau `localhost` stehen. |
| Strava: „Der Zugriff auf Aktivitäten wurde nicht freigegeben“ | Beim Verbinden den Haken bei „Aktivitätsdaten ansehen“ setzen. |
| Strava antwortet mit „HTTP 429“ | Strava-Limit erreicht (zu viele Abrufe). Das Programm wartet von selbst und macht später weiter. |
| Es fehlen alte Einheiten | Unter **Einstellungen …** auf **„Alles neu laden …“** klicken. |
| Garmin: „Kein Python 3.12 oder neuer gefunden“ / Paket fehlt | Unter **Körperdaten** auf **„Garmin-Paket installieren“** klicken. |
| Garmin-Anmeldung klappt nicht | Daten auf <https://connect.garmin.com> prüfen. Ist Zwei-Faktor aktiv, den Code aus Mail/App eingeben. |
| Video lässt sich nicht erstellen | Das Programm nutzt Microsoft Edge (oder Chrome) als Fenster. Edge aktualisieren. |
| Das Fenster ist weg, das Programm läuft aber noch | Im Task-Manager „pythonw.exe“ beenden und neu starten. |

Hilft das alles nicht: den neuesten Bericht aus `%APPDATA%\StravaDashboard\logs` an Tobi schicken.

---

## Deinstallieren

1. Programmordner löschen
2. `%APPDATA%\StravaDashboard` löschen (deine Einstellungen und Daten)
3. `%LOCALAPPDATA%\StravaDashboard` löschen (verschlüsselte Zugangsdaten und Fensterprofil)
4. Optional: auf <https://www.strava.com/settings/apps> den Zugriff von „Mein Dashboard“ widerrufen und die API-App löschen

---

## Für Entwickler

```
strava_dashboard.py            Einstieg: Server mit RPC-Funktionen, Fenster (lib/webshell.py)
lib/strava_api.py              Strava-Anmeldung (OAuth, Callback localhost:8123) und Abrufe
lib/strava_dashboard_logik.py  Aktivitäten holen und zwischenspeichern, Bestzeiten/Runden/Wetter im Hintergrund, Demo-Daten
lib/garmin_logik.py            Garmin Connect; Abruf in lib/garmin_helfer.py (Paket garminconnect, Python ≥ 3.12),
                               der Zugang geht nur über stdin/stdout an den Helfer, nie als Datei
lib/ablage.py                  Speichern-Dialoge, Ordner öffnen
lib/orte.py                    Datenordner (%APPDATA%\StravaDashboard, abweichend per STRAVA_DASHBOARD_DATEN)
lib/tresor.py                  Zugangsdaten verschlüsselt (DPAPI) in %LOCALAPPDATA%\StravaDashboard\geheim
ui/                            Oberfläche: React + TypeScript + Vite
web/index.html                 fertiger Build der Oberfläche (eine Datei, mit eingecheckt)
```

Oberfläche bauen (Node.js 20 oder neuer):

```
cd ui
npm ci
npm run build
```

Ohne Fenster starten (gibt nur die Adresse aus): `.venv\Scripts\python strava_dashboard.py --kein-fenster --demo --port 8800 --token test`,
dann im Browser `http://127.0.0.1:8800/?t=test` öffnen.

Bilder und Videos zeichnet die Oberfläche selbst (Canvas). Videos entstehen Bild für Bild mit WebCodecs und
[Mediabunny](https://mediabunny.dev) als MP4 mit fester Bildrate. Die Zeichen- und Intervall-Logik ist eine Kopie aus der App
Formkurve (`ui/src/studio`, `ui/src/sammel`).
