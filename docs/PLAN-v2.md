# Plan v2: vom Item-Analysator zum Soll-Ist-Cockpit

Stand: 25.09.2026 · Grundlage: dein Claude-Chat (90 Nachrichten, 20.–25.09.), die App bis v8 und die drei Build-Dateien.

---

## 1. Was dein Chat über dich verrät

Ich habe deine Nachrichten aus dem Chat nach Art der Frage sortiert (ohne die Nachrichten zum Tool-Bau):

| Art der Frage | ca. Anzahl | Beispiele |
|---|---|---|
| **Was mache ich als Nächstes?** | 16 | „Was als nächstes? Oder erstmal hoch mit der Torment-Stufe?“, „Szenario A: Elige gedroppt, B nicht“ |
| **Woher bekomme ich X?** | 10 | Escalation Sigils, Distilled Fear, Splinter of Hellfire, Sadistic |
| **Überleben, Skills, Kampf** | 10 | „Ich bin 1 Shot von jeder Ability“, „Welcher Skill ist Metamorphosis?“ |
| **Wie funktioniert dieses Menü?** | 9 | Eingabemaske beim Umrollen, Stealth craften, Würfel |
| **Loot-Filter** | 7 | Filter-Code prüfen, nur 900er anzeigen |
| **Ist dieses Item gut?** | 6 | Hose mit 2 Sockeln, Amulett, „Welches Item?“ |
| **Was mache ich mit Überschuss?** | 6 | Talismane, Runen, Rare Charms, Sockel/Edelsteine |
| **Koop** | 2 | Pit zu zweit, War Plan |

**Muster, die mir auffallen:**

1. **„Was jetzt?“ und „Woher?“ machen zusammen rund 40 % aus.** Ob ein einzelnes Item gut ist, fragst du viel seltener. Die App hat bisher aber genau diesen seltenen Fall (Screenshot → Urteil) am aufwendigsten gebaut.
2. **Du spielst abends in Etappen und fragst mitten im Spiel.** Dabei willst du kurze, kleine Schritte: „Du antwortest mir etwas zu ausführlich, sodass ich kaum hinterher komme. Kleinere Schritte.“
3. **Vertrauen ist dein Knackpunkt.** „Ich hab das Gefühl du bist nicht ganz up to date“ und „dann sind die Infos … auch nicht ganz 100 % korrekt“: Falsche Aussagen kosten dich mehr als fehlende. Die Guides (Mobalytics, Cliptis) sind für dich die Wahrheit.
4. **Du verlierst den Überblick über deinen eigenen Stand.** „Mich nervt, dass ich mir das nicht im Kopf behalten kann.“ Gut funktioniert haben die **Sammelliste für morgen** und die klaren Ziele (Elegie holen, Sadistic craften).
5. **Du bist gut darin, Screenshots zu schicken.** Claude liest sie zuverlässig. Tesseract, die Texterkennung im Browser, liest sie nur mäßig.
6. **Du spielst auf Englisch** und willst Namen zweisprachig.

---

## 2. Warum das Tool gerade eher verwirrt

Dein Screenshot vom Amulett zeigt das Grundproblem:

- Die Texterkennung liest „Melech's Beating Flaie“ statt „Moloch's Beating Flame“.
- Die App sucht diesen Namen in einer Liste mit 2.782 Namen und findet ihn nicht sicher.
- Daraufhin empfiehlt sie: „Ersetzen durch Pulsierende Flamme des Molochs“. **Das ist das Item, das du schon trägst.**
- Dazu kommen zwei Builds gleichzeitig mit zum Teil widersprüchlichen Tipps: Splitter des Schmerzes für Starter, Splitter der Sünde für Midgame. Die Karte zeigt sechs Aktionen, von denen dir keine sicher weiterhilft.

**Die Ursachen:**

1. **Offene Erkennung:** Die App versucht zu erraten, *welches* Item das ist, aus allen möglichen. Das geht nur mit einer vollständigen Item-Datenbank und guter Texterkennung. Beides haben wir nicht.
2. **Die App urteilt, obwohl sie unsicher ist.** Statt nachzufragen, gibt sie eine Handlung aus.
3. **Zu viel auf einmal:** zwei Builds, jede Aktion mit Priorität, Material, Reihenfolge und Warnungen.
4. **Sprachmischung:** deutsche Build-Dateien, englische Tooltips, dazwischen eine Übersetzungsschicht.

**Die Kernidee für v2:** Die App muss gar nicht wissen, was ein Item ist. Sie muss nur wissen, **was dein Build verlangt**, und du sagst ihr, **was davon du hast**.
Das ist eine geschlossene Frage („Ist Willpower drauf? Ist es Moloch's?“), keine offene („Was ist das?“).
Geschlossene Fragen sind leicht zu beantworten, per Antippen oder mit einem Screenshot als Vorschlag. Selbst „Melech's Beating Flaie“ ist dann eindeutig Moloch's, weil nur *ein* Name zur Auswahl steht.

---

## 3. Was du brauchst

Priorisiert nach deinem Chat und deiner letzten Nachricht („einfach einen guten Überblick … was mein IST-Stand ist und was laut Build Soll-Ist“):

| # | Bedürfnis | Heute | v2 |
|---|---|---|---|
| 1 | **Soll-Ist auf einen Blick:** pro Slot sehen, was fehlt | versteckt in der Slot-Analyse | **Hauptansicht** |
| 2 | **Nächste Schritte:** 3 kleine, konkrete Dinge für heute Abend | „Nächster Schritt“, zu viele Einträge | kurze „Heute“-Liste |
| 3 | **Woher bekomme ich es?** | „Was fehlt“ mit Quellen | bleibt, direkt an der fehlenden Sache |
| 4 | **Sammelliste:** was ich aufheben und mitnehmen muss | vorhanden | bleibt |
| 5 | **Nachschlagen:** Runen, Talismane, Überschuss | Suche plus Wissen, funktioniert | bleibt unverändert |
| 6 | **Fragen stellen**, auch mit Screenshots | separater Claude-Chat ohne Gedächtnis | **Claude-Brücke** (siehe unten) |
| 7 | **Stand exportieren**, um ihn Claude zu geben | Profil-Export (JSON, lang) | kurzer Text-Status zum Kopieren |

**Nicht mehr nötig bzw. zurückstellen:**
- automatische Handlungsempfehlungen pro Item („Zeile X umrollen auf Y“, „Ersetzen durch …“)
- Item prüfen
- die Truhe mit Verdikten
- die OCR-Namenserkennung gegen den ganzen Katalog

---

## 4. Zielbild: Arbeitsteilung App ↔ Claude

```
┌────────────────────────────┐          ┌────────────────────────────┐
│            APP             │  Status  │        CLAUDE-CHAT         │
│    Gedächtnis & Überblick  │ ───────▶ │      Augen & Kopf          │
│                            │ kopieren │                            │
│ • Soll (aus Build-Dateien) │          │ • liest Screenshots        │
│ • Ist (von dir bestätigt)  │  Update  │ • beantwortet Fragen       │
│ • Fehlt / Woher / Heute    │ ◀─────── │ • kennt Guides (Projekt-   │
│ • Bestand, Kodex, Suche    │ einfügen │   wissen: deine JSONs)     │
└────────────────────────────┘          └────────────────────────────┘
```

- **Die App rät nie.** Sie zeigt nur, was in deinen Dateien steht und was du bestätigt hast. Ist sie unsicher, fragt sie.
- **Claude liest und erklärt.** Claude bekommt deinen Stand als kurzen Text. Es kann ein **Ist-Update** in einem festen Format zurückgeben, das du in die App einfügst.
- **Die Guides bleiben die Wahrheit.** Die Build-Dateien kommen von dort, die App fügt nichts hinzu.

---

## 5. Umbau in Etappen

Jede Etappe ist für sich nutzbar. Nach jeder schaust du drauf, bevor die nächste kommt.

### Etappe 1: Soll-Ist-Tafel (Kern, größter Nutzen)

**Neue Startansicht „Übersicht“** für den **Fokus-Build**, also den einen Build, den du gerade spielst. Der andere Build ist nur per Umschalter als Vorschau sichtbar.

Mobil, eine Karte pro Slot:

```
AMULETT                                          5 / 7
Soll                         Ist
Moloch's Beating Flame       [✓]
Willpower                    [✓]
Crit Damage Multiplier       [✗]  → fehlt
Vulnerable Damage Mult.      [✗]  → fehlt
Maximum Life                 [~]  schwach
Härtung: Worldly Stability   [✓]
Sockel: Splinter of Sin      [✗]  → Woher? (tippen)
```

- **Ist-Chips antippen:** leer → ✓ → ~ (vorhanden, aber schwach) → ✗. Die Soll-Begriffe kommen **1:1 aus der Build-Datei**, es gibt also keine Übersetzung und keinen Abgleich mit dem Katalog.
- **Soll ist erfüllt oder fehlt, mehr nicht.** Die App gibt keine Handlungsbefehle wie „umrollen“ oder „ersetzen“. Allenfalls zeigt sie neutrale Hinweise aus deinen Wissens-Notizen, zum Beispiel wie Umrollen am Juwelier bzw. Occultist funktioniert.
- **Kopfzeile:** Gesamtfortschritt des Builds, z. B. „41 / 70 erfüllt“, dazu je ein Balken pro Slot.
- **„Woher?“** neben jedem ✗: Quelle und Farmziel aus `wissen.json`, so wie es heute in „Was fehlt“ steht.
- **Gespeichert wird im Profil**, pro Slot die bestätigten Merkmale:
  `ist.amulett = { item: "Moloch's Beating Flame", merkmale: { "Willpower": "ja", "Maximum Life": "schwach", … }, stand }`.
  Das Ist hängt am **Charakter**, nicht am Build: Beim Wechsel des Fokus-Builds bleibt alles erhalten, und das neue Soll wird gegen dasselbe Ist geprüft.
- **Aus dem heutigen Inventar übernehmen:** Einmalig werden die schon erfassten Items in Vorschläge für die Chips umgewandelt, die du bestätigst.

**Fertig, wenn:**
- du alle 10 Slots in unter 3 Minuten per Antippen erfasst hast,
- die Übersicht nirgends eine Handlung empfiehlt, die nicht aus deinen Dateien stammt,
- sie auf dem Handy ohne Zoomen lesbar ist.

### Etappe 2: Screenshot als *Vorschlag* mit geschlossener Liste

Die Texterkennung bleibt, bekommt aber eine andere, viel einfachere Aufgabe:
- Du tippst auf einen Slot und fügst den Screenshot ein.
- Die App vergleicht den erkannten Text **nur mit den Soll-Begriffen dieses Slots**, beim Amulett also mit 7 Begriffen statt 2.782.
- Das Ergebnis ist ein Vorschlag, z. B. „✓ Moloch's Beating Flame (gelesen als ‚Melech's Beating Flaie‘), ✓ Willpower, ✗ Crit Damage Multiplier“. Du bestätigst mit einem Tipp.
- Unsicheres wird mit „?“ markiert und nicht gesetzt. Gezählt wird nur, was du bestätigt hast.

**Warum das robust ist:** Bei 7 Kandidaten reicht eine grobe Ähnlichkeit. „Flaie“ gegen „Flame“ ist dann eindeutig.

**Fertig, wenn** deine echten Screenshots (Helm, Moloch's, Stealth, Edgemaster) ohne Korrektur richtig vorgeschlagen werden. Die Tests laufen gegen die vorhandenen Fixtures.

### Etappe 3: Claude-Brücke (Fragen, Screenshots, Gedächtnis)

Das ersetzt die Notizen-Suche nicht, aber es deckt rund die Hälfte deiner Fragen ab, die keine Datei beantworten kann: „Wie überlebe ich?“, „Wie funktioniert das Menü?“, „Was jetzt?“.

1. **Knopf „Status für Claude kopieren“.** Er erzeugt einen kurzen Text (Markdown, max. ~60 Zeilen):
   - Charakter: Klasse, Stufe, Qual, Paragon
   - Fokus-Build und Ziel-Build
   - Soll-Ist-Tabelle nur mit dem, was fehlt oder schwach ist
   - Bestand an Engpass-Materialien und Schlüsseln
   - Kodex-Aspekte
   - offene Schritte

   Du fügst ihn in den Chat ein und stellst deine Frage.
2. **Claude-Projekt einrichten** (auf claude.ai, kein Code nötig). Die Anleitung kommt als eigener Abschnitt in die README:
   - **Projektwissen:** `wissen.json`, die Build-Dateien, dazu die Guide-Texte, die du ohnehin rauskopierst.
   - **Projektanweisung,** zum Beispiel:
     - „Antworte kurz, in kleinen Schritten, max. 3 Punkte.“
     - „Spielbegriffe englisch mit Deutsch in Klammern.“
     - „Die Guides im Projektwissen sind die Wahrheit. Wenn du dir unsicher bist, sag das.“
     - „Wenn ich Screenshots von Items schicke, gib am Ende einen Block `IST-UPDATE` im folgenden Format aus: …“
   - Damit hat der Chat ein Gedächtnis für deinen Build und wird nicht „out of date“, weil er aus deinen Dateien antwortet.
3. **Knopf „Update von Claude einfügen“.** Du fügst den `IST-UPDATE`-Block aus dem Chat ein. Die App zeigt die Änderungen als Vorher/Nachher und übernimmt sie erst nach deiner Bestätigung.
   - Claudes Bilderkennung ersetzt dabei Tesseract, und die Screenshots bleiben in deinem Chat.
   - Das Format ist ein kleines JSON mit denselben Slot- und Merkmal-Namen wie in Etappe 1. Die App prüft, dass nur bekannte Slots und Soll-Begriffe vorkommen.

**Fertig, wenn** der ganze Weg einmal durchläuft: Status kopieren → Frage plus Screenshot im Projekt → Update einfügen → Übersicht aktualisiert.

**Optional, später:** Die App ruft Claude direkt auf, mit deinem eigenen API-Schlüssel. Dann liefert ein Screenshot sofort das Update ohne Umweg über den Chat. Nachteile:
- Der Schlüssel liegt im Browser.
- Jede Anfrage kostet eine kleine API-Gebühr.
- Es braucht Internet.

Das entscheiden wir erst, wenn Etappe 3 sich bewährt hat.

### Etappe 4: „Heute“-Ansicht (Was jetzt?)

Das deckt deine häufigste Frage ab. Oben in der Übersicht steht ein kleiner Kasten:
- **Die nächsten 3 Schritte:**
  - automatisch aus den fehlenden Soll-Punkten, sortiert nach der Reihenfolge in der Build-Datei (erster Affix = wichtigster), Zielitem vor Aspekt vor Affixen vor Härtung vor Sockel;
  - dazu Schritte, die du selbst anheftest, z. B. aus einer Claude-Antwort: „Qual 5 Bosse farmen“.
- **Sammelliste für die Session:** was du aufheben sollst (aus Regeln und Bestand) und welche Schlüssel du hast.
- **„Erledigt“** abhaken. Das Häkchen wandert in die Soll-Ist-Tafel bzw. verschwindet.

Die App erfindet dabei keine Prioritäten. Die Reihenfolge kommt aus deiner Build-Datei oder von dir. Wo beides fehlt, gilt die Standardfolge oben, und sie ist sichtbar als solche beschriftet.

### Etappe 5: Aufräumen

- **Englisch für Spielbegriffe, Deutsch für die Bedienung.**
  - Die Build-Dateien kommen neu mit englischen Namen, exakt wie im Spielclient.
  - `uebersetzungen.json` bleibt nur als Rückfall für alte Dateien.
  - Die Suche bleibt zweisprachig.
- **Reiter reduzieren**, von 12 auf 6:
  - **Übersicht** (Soll-Ist + Heute)
  - **Suche** (inkl. Wissen/Notizen)
  - **Bestand** (inkl. Kodex, Runen)
  - **Farmziele**
  - **Builds**
  - **⚙ Mehr**: Checkliste, Rezepte, Abweichungen, altes Inventar, Truhe
- **Einfrieren statt löschen:**
  - Slot-Analyse, Item prüfen und Truhe kommen unter „⚙ Mehr → Experimentell“.
  - Der Code bleibt, er ist getestet. Aber er steht nicht mehr im Weg.
  - Wenn du sie nach zwei Wochen nie geöffnet hast, fliegen sie raus.

---

## 6. Reihenfolge und Aufwand

| Etappe | Umfang | Abhängig von |
|---|---|---|
| 1 Soll-Ist-Tafel | groß (neue Hauptansicht, Profilfeld, Übernahme aus Inventar, Tests) | – |
| 5a Englische Build-Dateien | klein bei mir, Arbeit bei dir/Chat | – (parallel) |
| 2 Screenshot-Vorschlag | mittel (Parser gibt es, Abgleich wird einfacher) | 1 |
| 3 Claude-Brücke | mittel (Export, Import mit Vorschau, README-Anleitung) | 1 |
| 4 Heute-Ansicht | klein bis mittel | 1 |
| 5b Reiter aufräumen | klein | 1–4 |

**Vorschlag:** Etappe 1 und 3 in einem Durchgang, danach testest du einen Abend lang. Dann folgen 2 und 4.

---

## 7. Was du entscheiden musst

1. **Fokus-Build:** Welcher Build ist gerade „dein“ Build, Starter oder Midgame? Du bist auf Qual 8 und hast Sadistic, ich tippe auf Midgame.
2. **Ist-Erfassung per Antippen als Grundlage**, mit Screenshot nur als Vorschlag: einverstanden?
3. **Claude-Brücke per Kopieren/Einfügen** jetzt, direkter API-Aufruf vielleicht später: einverstanden?
4. **Einfrieren** von Item prüfen, Truhe und automatischen Aktionen: einverstanden?

## 8. Was ich von dir brauche

- **Die drei Build-Dateien neu mit englischen Spielbegriffen**, exakt wie im Client:
  - Zielitem, Aspekt, Affixe, Härtung, Sockel (Splitter/Rune/Edelstein)
  - Affixe **in Prioritätsreihenfolge**, der wichtigste zuerst
  - Am einfachsten lässt du sie vom selben Chat aus den Mobalytics-Texten neu erzeugen, mit dem Satz „alle Spielbegriffe exakt wie im englischen Spielclient, Affixe nach Priorität sortiert“. Das Format bleibt gleich.
- Optional: die Guide-Texte, die du rauskopiert hast, als Projektwissen für das Claude-Projekt.
