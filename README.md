# D4 Spickzettel

Persönlicher Diablo-4-Spickzettel: Namen oder Kategorie eintippen, zum Beispiel „Nagu“, „gelbe Rune“ oder „rare ring“. Die App zeigt sofort ein Verdikt, etwa **BEHALTEN**, **WÜRFELN**, **ZERLEGEN**, **VERWERTEN**, **VERKAUFEN** oder **ANLEGEN**.

Reines HTML/CSS/JS, kein Build-Schritt, keine Ladung von CDNs zur Laufzeit. Auch die Texterkennung liegt im Repo (`vendor/tesseract/`, 11 MB).

## Starten

| Weg | Wie |
|---|---|
| Online (am einfachsten) | https://8m5mmhzsnh.github.io/diablo-king/ |
| Windows, lokal | **`start.bat`** im App-Ordner doppelklicken. Das startet einen kleinen Webserver (PowerShell, nur `localhost`, kein Python nötig) und öffnet den Browser. Anderer Port: `start.bat 8123`. |
| Mit Python | Im Ordner `python3 -m http.server 8000` ausführen und `http://localhost:8000` öffnen |
| Doppelklick auf `index.html` | **Nicht empfohlen.** Bei `file://` blockiert der Browser das Lesen der JSON-Dateien und die Web-Worker der Texterkennung. Screenshots werden dann **nicht** erkannt; die App sagt das. |

## Für weitere Nutzer

1. Dieselbe URL öffnen: **https://8m5mmhzsnh.github.io/diablo-king/**
2. Die App legt beim ersten Start **dein eigenes Profil** im Browser an, aus `data/profil-leer.json`. Nichts von anderen Nutzern wird übernommen.
3. Unter **Builds → Build-Vorlage importieren** eine der Vorlagen laden (Starter, Midgame, Endgame aus `data/builds/`) und als aktiv bzw. Ziel markieren.
4. Unter **Bestand** deine Materialmengen eintragen und unter **⚙ Dateien** Qualstufe und Paragon.

**`profil.json` liegt nie im Repo.** Sie steht in `.gitignore`, und jeder hat seine eigene.
Die App hält dein Profil im Browser des jeweiligen Geräts. Zum Sichern oder für ein zweites Gerät: **⚙ Dateien → profil.json exportieren** bzw. **importieren**.
Lokal (eigener Webserver) liest die App beim allerersten Start eine vorhandene `data/profil.json`, sonst `profil-leer.json`.

## Die zwei Dateien (Schema 2)

| Datei | Inhalt | Verhalten |
|---|---|---|
| `data/wissen.json` | Spielwissen, für alle gleich: `eintraege`, `regeln`, `rezepte`, `farmziele`, `notizen`, `verdikte`, `seltenheitSynonyme`, `quellen` | Wird bei einem Update **komplett ersetzt**. |
| `data/profil.json` | Persönliches: `charakter`, `einstellungen`, `builds`, `aktiverBuild`, `zielBuild`, `sammelliste`, `offeneAufgaben`, `abweichungen`, `bestand`, `inventar` | Wird **nie** überschrieben. **Nicht im Repo** (`.gitignore`). |
| `data/profil-leer.json` | Leeres Profil als Vorlage | Daraus entsteht beim ersten Start ein Profil, wenn es keine `profil.json` gibt. |
| `data/katalog.json` | Namenskatalog (Uniques, Aspekte, Item-Typen, Affixe …), abgeleitet aus d4lf (MIT) | Vorschlagslisten und Namensprüfung im Item-Editor. |
| `data/builds/*.json` | Build-Vorlagen `{ "build": { … } }`, Liste in `data/builds/index.json` | Import unter **Builds → Build-Vorlage importieren**. |

Beide Dateien haben `schemaVersion` (aktuell `2`). Passen sie nicht zueinander oder nicht zur App, erscheint oben ein Hinweis. Die App läuft trotzdem weiter.
`wissen.json` hat zusätzlich `version` und `stand`. Beides steht klein in der Kopfzeile.

**Speicherung:** Die App hält beide Dateien als Arbeitskopie im Browser (localStorage). Alle Häkchen, Builds, Listen und Abweichungen landen im Profil.
Unter **⚙ Dateien** kannst du beide Dateien **getrennt** exportieren und importieren. So gibst du ein Profil weiter oder tauschst nur die Wissensdatei.

**Wissens-Update:** Liegt im Repo eine geänderte `wissen.json`, übernimmt die App sie beim nächsten Laden automatisch.
Hast du das Wissen in der App geändert (z. B. einen Rohling angelegt), fragt sie vorher nach. Exportiere deine Änderungen also, bevor du übernimmst.

## So entsteht die Antwort

Auflösung bei einer Suche:

1. **Eintrag:** Treffer in `eintraege` über `name_de`, `name_en` oder `aliase`.
   Hat der Eintrag kein Verdikt, greift die passende Regel über `typ`, `itemTyp` und `seltenheit` des Eintrags.
2. **Regel:** Sonst die passende Regel aus `regeln`, über `trifft` oder über `suchbegriffe`.
   Eine Regel mit `"typ": "*"` ist der Fallback und wird zuletzt geprüft.
3. **Nichts gefunden:** „Kein Eintrag – noch nicht erfasst“ mit dem Button **Als Eintrag anlegen**.
   Der Button legt einen Rohling in der Arbeitskopie von `wissen.json` an. Der Suchtext landet in `name_en`.

Danach wird das Verdikt noch zweimal angepasst:

- **Eigene Abweichung** aus `profil.abweichungen` (Reiter „Abweichungen“). Sie überstimmt das Wissen für dich.
- **Build-Bedarf:** Die App sucht den Namen selbst in `zielItem`, `zielAspekt` und `sockel` des aktiven und des Ziel-Builds.
  Wird er gebraucht, lautet das Verdikt **BEHALTEN**, und die Karte sagt es, z. B. „BEHALTEN statt ZERLEGEN – wird im Ziel-Build gebraucht“.
  Das Badge zeigt „für aktuellen Build“ (grün), „für Ziel-Build“ (blau), „für beide“ oder „in keinem Build“ (grau).

Unter jedem Treffer stehen aufklappbar alle **Notizen**, deren `typen` zum Typ des Treffers passen oder deren `schlagworte` in der Suche vorkommen.

### Kategorien finden

Die Suche zerlegt Eingaben wie „gelbe runen“ oder „rare ring“:

- **Seltenheit** über `wissen.seltenheitSynonyme`: weiß/white → gewöhnlich, gelb/yellow → selten usw. Das Mapping steht in der Datei, nicht im Code.
- **Typ:** Die restlichen Wörter werden mit `trifft.typ` und `trifft.itemTyp` der Regeln verglichen.
- **Endungen** spielen keine Rolle: rune/runen, gelb/gelbe/gelben, selten/seltener, ring/rings.

Für englische Typwörter kannst du Listen angeben, z. B. `"typ": ["zauber", "charm"]` oder `"itemTyp": ["schwert", "sword"]`.
Die Felder `getragen`, `set`, `setFremd`, `duplikat`, `nichtImBuild` und `plaetze` in `trifft` beschreiben Bedingungen am Item. Sie werden bei der Regel als „Gilt für …“ angezeigt.
`nichtImBuild: true` verhindert außerdem, dass die Regel für ein benanntes Item greift, das in einem Build steht.

## Aufbau von `wissen.json`

Alle Felder außer den Namen dürfen leer bleiben. Jeder Eintrag, jede Regel, jede Notiz (und optional jedes Rezept oder Farmziel) hat `stand`.
Ist der Stand älter als `profil.einstellungen.warnTageBuildAlter`, erscheint ⚠ mit dem Hinweis „Daten könnten veraltet sein – im Spiel gegenprüfen“. Für Builds gilt das über das Feld `datum`.

```jsonc
{
  "schemaVersion": 2, "version": "1", "stand": "YYYY-MM-DD",
  "verdikte": [{ "id": "BEHALTEN", "farbe": "#2e9b50", "text": "Aufheben" }],
  "seltenheitSynonyme": [
    { "id": "selten", "name_de": "Selten", "name_en": "Rare", "synonyme": ["gelb", "yellow", "rare", "selten"] }
  ],
  "eintraege": [{
    "name_de": "", "name_en": "", "aliase": [],
    "typ": "", "itemTyp": "", "seltenheit": "",
    "verdikt": "", "begruendung": "", "quelle": "",   // quelle: Text oder id aus "quellen"
    "rezepte": [], "notiz": "", "stand": ""
  }],
  "regeln": [{
    "id": "", "trifft": { "typ": "", "seltenheit": [] }, "suchbegriffe": [],
    "verdikt": "", "begruendung": "", "ausnahmen": [], "ausnahmeText": "", "notiz": "", "stand": ""
  }],
  "rezepte": [{ "id": "", "name_de": "", "name_en": "", "input": [], "kosten": [], "ergebnis": "", "notiz": "", "stand": "" }],
  "farmziele": [{ "quelle": "", "typ": "", "belohnungen": [], "kosten": "", "notiz": "", "stand": "" }],
  "notizen": [{ "frage": "", "antwort": "", "typen": [], "schlagworte": [], "stand": "" }],
  "quellen": [{ "id": "", "name_de": "", "name_en": "", "typ": "", "notiz": "" }]
}
```

`input`, `kosten` und `belohnungen` dürfen Texte oder Objekte `{ "name_de", "name_en", "menge" }` sein.

## Aufbau von `profil.json`

```jsonc
{
  "schemaVersion": 2,
  "charakter": { "name": "", "klasse": "", "stufe": "", "notiz": "" },
  "einstellungen": { "warnTageBuildAlter": 14 },
  "builds": [{
    "id": "", "name": "", "klasse": "", "quelleUrl": "", "datum": "YYYY-MM-DD", "notiz": "",
    "slots": {   // kopf, brust, handschuhe, hose, stiefel, amulett, ring1, ring2, waffe, fokus
      "kopf": { "zielItem": "", "zielAspekt": "", "sockel": "", "affixe": [], "haertung": "", "quelle": "", "erledigt": false }
    },
    "wechselkriterien": [{ "text": "", "erledigt": false }]
  }],
  "aktiverBuild": "", "zielBuild": "",
  "sammelliste": [{ "name_de": "", "name_en": "", "notiz": "", "erledigt": false }],
  "offeneAufgaben": [{ "text": "", "erledigt": false }],
  "abweichungen": [{ "bezug": "Eintragsname oder Regel-ID", "verdikt": "", "begruendung": "", "stand": "" }]
}
```

## Inventar und Item-Analyse

**Reiter „Inventar“:** zehn Slot-Karten (Kopf, Brust, Handschuhe, Hose, Stiefel, Amulett, Ring 1, Ring 2, Waffe, Fokus).

**Item erfassen:**
- Screenshot eines Tooltips einfügen: auf die Karte tippen und Bild wählen, Strg+V drücken oder das Bild hineinziehen. Alternativ „Manuell erfassen“.
- Die Texterkennung ([Tesseract.js](https://github.com/naptha/tesseract.js) 5.1.1) läuft komplett im Browser und liegt lokal in `vendor/tesseract/`:
  - Loader und Worker: 67 KB + 124 KB
  - zwei Kerne (mit und ohne SIMD): je 3,9 MB
  - englische Sprachdaten: 2,95 MB
  - **zusammen 11,0 MB im Repo**

  Der Browser lädt beim ersten Screenshot nur einen Kern plus Sprachdaten, rund 7 MB, danach kommt alles aus dem Cache. Details in `vendor/tesseract/README.md`.
- **So wird erkannt:**
  - **Bildaufbereitung:** Pro Pixel zählt der hellste Farbkanal, damit auch oranger und blauer Text hell bleibt. Ein Schwellwert nach Otsu macht daraus schwarzen Text auf weißem Grund.
  - **Layout:** Tesseract erkennt das Seitenlayout automatisch (PSM 3). Das hält Item-Bild und Rahmen vom Text getrennt.
  - **Aufräumen:** Der Parser entfernt Fehlglyphen (◆ wird oft zu `o`/`¢`, das Gold-Icon zu `®`) und Bereichsangaben wie `[83 - 99]`.
  - **Effekttexte:** Der Absatz nach „Imprinted:“ und Unique-Kräfte zählen nicht als Affixe.
  - **Fußzeilen:** „Requires Level“, „Sell Value“ und „Durability“ werden übersprungen; „Tempers: 3/3“ wird trotzdem gelesen.
  - **Katalog-Abgleich:** Affixnamen werden mit `katalog.json` abgeglichen. Typische OCR-Fehler wie „Thoms“ werden zu „Thorns“ korrigiert und markiert.
  - **Aspekt:** Bei legendären Items leitet die App den Aspekt aus dem Namen ab („Sadistic Doom Casque“ → Sadistischer Aspekt).
  - **Große Affixe:** Ein Stern vor einer Affixzeile merkt sie als „groß“ vor.
  - **Verzaubert:** Das blaue Kreissymbol vor einer Zeile wird über die Farbe erkannt und merkt die Zeile als „verzaubert“ vor.
  - **Uniques und Runenwörter:** Der Name wird im verrauschten Titel gesucht („iy STEALTH FE“ → Stealth). Runenwort- und Unique-Absätze zählen nicht als Affixe. Runen im Sockel („CirOhm (300/600)“) werden zu Sockelinhalten.
  - **Spiel-UI:** Zeilen wie „Scroll Down“, „Unequip“, „Mark as Favorite“ oder „Seasonal Item“ werden ignoriert. Ist der Tooltip abgeschnitten, weist die App darauf hin.
- **Grenzen:**
  - Die Zierschrift der Item-Namen wird oft falsch gelesen („Doom“ → „Dos“). Bei Uniques korrigiert der Abgleich das; bei legendären Items zählt ohnehin der Aspekt.
  - Wird der Tooltip von „Scroll Down“ verdeckt, fehlen Härtungen und Vollendung. Dann im Spiel scrollen und neu aufnehmen.

### Build-Affixe auf Deutsch, Tooltips auf Englisch

Die Builds nennen Affixe auf Deutsch („Willenskraft“), die Tooltips auf Englisch („Willpower“). Den Vergleich übernimmt **`data/uebersetzungen.json`** (Deutsch → Katalogname, z. B. `"Willenskraft": "Willpower"`).
- **„Primärattribut“** passt auf Strength, Dexterity, Intelligence oder Willpower. Wer es enger will, setzt `charakter.primaerattribut`.
- **Klammerzusätze** wie „(Worldly Endurance)“ werden beim Vergleich ignoriert.
- **Schutz vor Fehlalarmen:** Hat ein Build-Affix keine Übersetzung und ist selbst kein Katalogname, meldet die Analyse ihn als **„nicht vergleichbar“**. Er gilt dann weder als vorhanden noch als fehlend, und die App schlägt für dieses Item **keine** Zeile zum Umrollen vor.
- **Einen fehlenden Begriff ergänzen:** eine Zeile in `data/uebersetzungen.json` hinzufügen, rechts genau der englische Name aus `katalog.json`.
- **Optional** kann `wissen.json` eine Sektion `affixUebersetzungen` mit demselben Format haben; sie ergänzt die Datei.
- Die App schlägt einen Slot vor (aus dem Eintrag in `wissen.json`, sonst aus dem Item-Typ), du bestätigst ihn.
- Alle erkannten Felder erscheinen zur Korrektur. Affixzeilen haben eine Konfidenz und lassen sich einzeln bearbeiten, hinzufügen und löschen.
- **Erst „Übernehmen“ schreibt ins Inventar.** Die Analyse sieht nie den rohen Erkennungstext.
- Name, Aspekt, Item-Typ und Affixe haben Vorschlagslisten aus `katalog.json`. Steht ein Affix nicht im Katalog, schlägt die App den ähnlichsten Namen vor.
- Bei Uniques werden die ersten `num_inherents` Zeilen als implizit vormarkiert, sofern der Katalog dieses Feld hat. Der aktuelle Katalog hat es nicht, deshalb markierst du implizite Affixe selbst.

**Slot-Analyse:** Pro Slot vergleicht die App das Item mit dem aktiven und dem Ziel-Build. Heraus kommen konkrete Handlungen mit Begründung und Priorität:
- **Ersetzen:** mit Quelle aus `eintraege[].quelle`, dazu jedes `farmziele`-Element, dessen `quelle_de`/`quelle_en` dort vorkommt oder das Item als Belohnung nennt, mit Kosten und Belohnungen
- **Aspekt überprägen**
- **Sockeln:** einsetzen, ersetzen oder Sockel hinzufügen (kostet ein Prisma)
- **Verzaubern:** schlechteste Zeile auf den obersten fehlenden Zielaffix umrollen, mit Pflicht-Warnung „nur EIN Affix“
- **Rezept `reroll-affixwerte`:** wenn du Werte als schwach markiert hast
- **Härten:** nur bei Keepern, Warnung, wenn der Bestand an Schriftrollen der Wiederherstellung unbekannt oder 0 ist
- **Vollenden:** nur Keeper und ab Qual 4

Sind mehrere Aktionen offen, zeigt die App die Bearbeitungsreihenfolge und verlinkt auf die Notiz „In welcher Reihenfolge bearbeite ich ein Item?“. Die Reihenfolge nimmt sie aus dem optionalen Feld `reihenfolge` dieser Notiz, sonst gilt die Standardreihenfolge: Affixe, Sockel, Aspekt, Härten, Vollenden, Transfigurieren.

**Materialien kommen aus den Daten, nicht aus dem Code.**
- Einträge in `wissen.json` mit `bestandsschluessel` sind Materialien. Der Anzeigename kommt aus `name_de`/`name_en`, die Menge aus `profil.bestand[bestandsschluessel]`.
- Fehlt der Schlüssel oder ist er `null`, gilt der Bestand als **unbekannt**, und Warnungen erscheinen.
- Jede Aktion mit Material zeigt den Bestand an, z. B. „braucht 1 Zerstreutes Prisma (Scattered Prism), du hast 0“.
- Reicht der Bestand nicht, wird die Aktion als **blockiert** markiert und nach unten sortiert, aber nicht versteckt.
- Im Code steht nur, welche Aktion welchen `bestandsschluessel` braucht: Sockel hinzufügen → `Scattered Prism`, Vollenden → `Obducite`, Verzaubern vermachter Items → `Forgotten Souls`, Härtung zurücksetzen → `Scroll of Restoration`.

**Reiter „Bestand“:** Hier bearbeitest du die Mengen direkt. Gespeichert wird in `profil.bestand`; ein leeres Feld bedeutet unbekannt.

**Reiter „Nächster Schritt“:** Alle Aktionen nach Priorität, gruppiert in „kostet nur Gold“, „braucht knappe Materialien“ und „beschaffen“.
Engpässe sind Materialien mit `engpass: true`. Falls es eine Sektion `wissen.engpaesse` gibt, hat sie Vorrang; fehlen beide, gelten alle Einträge mit `typ: "material"`. Aktionen mit Engpass-Material sind hervorgehoben. Darunter stehen die Wechselkriterien des Ziel-Builds und die offenen Aufgaben.

**Grenzen, bewusst:**
- Keine Werte-Vergleiche gegen Roll-Bereiche. Es gibt keine Min-/Max-Datenbank.
- Keine Schadensberechnung, kein DPS-Vergleich.
- Die Empfehlungen sind Regelanwendung, kein Simulator.

**Neue Felder in `profil.json`:**

```jsonc
"charakter": { …, "qualstufe": 6, "paragon": 139 },
"inventar": {
  "waffe": {
    "name": "", "slug": "", "seltenheit": "", "itemTyp": "", "gegenstandsmacht": 0,
    "vermacht": false, "aspekt": "",
    "affixe": [{ "text": "", "wert": "", "gross": false, "implizit": false, "verzaubert": false, "schwach": false }],
    "sockel": [{ "gefuellt": false, "inhalt": "" }],
    "haertungen": { "genutzt": 0, "max": 0, "affix": "" },
    "vollendung": { "stufe": 0, "max": 25 },
    "stand": "YYYY-MM-DD", "quelle": "ocr"            // oder "manuell"
  }
  // … kopf, brust, handschuhe, hose, stiefel, amulett, ring1, ring2, fokus (null = leer)
},
"bestand": { "Scattered Prism": 0, "Obducite": 873 }   // Schlüssel = bestandsschluessel aus wissen.json; fehlend/null = unbekannt
```

`aspekt` (der geprägte Aspekt) und `schwach` (Wert schwach, ohne Roll-Datenbank von dir gesetzt) sind Ergänzungen.
Die Analyse braucht sie für „Aspekt überprägen“ und das Rezept `reroll-affixwerte`.

**Genutzte Felder in `wissen.json`:**
- `eintraege[].bestandsschluessel`, `.engpass`, `.slot`, `.schwelle`, `.kategorie`, `.quelle`
- `regeln[].rezepte`, `.schwelle`
- das Rezept `reroll-affixwerte`
- die Notiz „In welcher Reihenfolge bearbeite ich ein Item?“
- `verdikte[].farbe`: Farbnamen wie `gruen`, `violett`, `blau`, `tuerkis`, `grau`, `gold` oder Hex-Werte

**`data/katalog.json`:** `{ "kategorien": { "uniques": { "typ", "anzahl", "einträge": [{ "slug", "name_en", "name_quelle" }] }, … } }`.
Die Vorschlagslisten nutzen `uniques`, `aspekte`, `itemTypen` und `affixe`.

## Was fehlt (Beschaffung)

Reiter **„Was fehlt“**: aktiver und Ziel-Build gegen das, was du hast (Inventar, Bestand, Kodex, erledigt-Häkchen). Er funktioniert auch mit leerem Inventar. „Nächster Schritt“ ist das Gegenstück für Aktionen an Items, die du schon hast.

**Arten von Posten:**
- **Item:** ein benanntes Zielitem fehlt.
- **Slot-Profil:** Der Slot hat nur einen Zielaspekt. Angezeigt werden die gesuchten Affixe, der Aspekt und die Route: Höllenflut-Truhe, Obols, Upgrade to Legendary.
- **Aspekt:** fehlt im Kodex.
- **Sockel:** ein Splitter oder Edelstein fehlt.
- **Rune:** Der Bestand reicht nicht.
- **Material:** Bestand 0, blockiert Aktionen. Angezeigt wird, wie viele.

**Ansichten:**
- **Nach Quelle** (Standard): gruppiert nach Farmziel, die Gruppe mit den meisten offenen Posten zuerst. Posten ohne passendes Farmziel landen unter „Sonstiges“, mit dem Button „Farmziel ergänzen“.
- **Nach Priorität:** Blockierer, dann aktiver Build, Ziel-Build, Wechselkriterien und offene Aufgaben.

Pro Posten gibt es die Buttons „In die Sammelliste“ und „Ausblenden“ (`profil.ausgeblendet`). Dazu kommt „Als Text kopieren“ für den Chat.

**Runen und Kodex** pflegst du im Reiter **Bestand**:
- **Runen** stehen in `profil.bestand` mit dem Runennamen als Schlüssel, z. B. `"Nagu": 2`.
- **Kodex** steht in `profil.kodex`, z. B. `{ "Sadistic Aspect": 15, "Aspect of Ignition": null }`. Eine Zahl ist der Rang, `null` bedeutet nicht im Kodex, ein fehlender Schlüssel unbekannt.
- **Runen-Aufwertung:** Mit einer Kette in `wissen.runen.aufwertungskette` rechnet die App den Bedarf aus. Die Kette wird so angegeben: `["3x Tir -> Eth", "3x Eth -> Ith"]` oder `[{ "von": "Tir", "nach": "Eth", "menge": 3 }]`. Ist ein Bestand in der Kette unbekannt, zeigt sie nur die Kette.

## Item prüfen

Reiter **„Item prüfen“**: Screenshot eines gefundenen Items einfügen, das Verdikt erscheint sofort über den korrigierbaren Werten. Die Bewertung läuft in dieser Reihenfolge:
1. **Zielitem** eines Slots im aktiven oder Ziel-Build → ANLEGEN (bzw. „Duplikat“, wenn du es schon trägst).
2. **Slot mit Zielaspekt:** Zielaffixe zählen, bei Deutsch/Englisch über `data/uebersetzungen.json`, dazu der Aspekt. Hat das Item mehr Treffer als das getragene Teil → BEHALTEN als Upgrade-Kandidat.
3. Sonst das Verdikt des **Eintrags** in `wissen.json`.
4. Sonst die passendste **Regel** (`trifft`: typ ausruestung, seltenheit, itemTyp, getragen). Vermacht hat Vorrang vor legendär. Weitere passende Regeln werden mit angezeigt.

Dazu zeigt die App den Kodex-Stand des Aspekts. Von dort geht es direkt „In die Truhe“ oder „Ins Inventar“.
Englische Item-Typen werden über `uebersetzungen.json → itemTypen` auf die deutschen Typen der Regeln abgebildet („Chest Armor“ → „Brustschutz“).

## Truhe (Stash)

Unten im Inventar: Items, die nicht angelegt sind, aber zur Verfügung stehen (`profil.stash`, gleiche Struktur wie Inventar-Items plus `id` und `notiz`). Jede Karte zeigt ihr Verdikt und wo sie in deine Builds passt. **Anlegen** tauscht mit dem Slot, das bisherige Item wandert in die Truhe.

## Tests

```
npm test        # = node --test, prüft Slot-Analyse und Tooltip-Parser (lib.js)
```

`tests/fixtures/ocr-*.json` enthalten die echte Tesseract-Ausgabe von Spiel-Screenshots (Bilder in `tests/fixtures/bilder/`).
Die Parser-Tests laufen gegen diese Ausgaben. So lässt sich jede Parser-Änderung ohne Browser gegen echte Tooltips prüfen.

## Reiter

- **Suche** (Startseite): großes Suchfeld, darunter die Sammelliste
- **Builds**: anlegen, bearbeiten, aktiv/Ziel setzen, Guide-Text importieren, Wechselkriterien
- **Inventar**: Charakterbogen mit aufklappbaren Slots, Analyse pro Slot, darunter die Truhe (Stash)
- **Item prüfen**: Screenshot → Verdikt (behalten, umbauen, würfeln, zerlegen …)
- **Was fehlt**: Beschaffung nach Quelle oder Priorität
- **Bestand**: Materialmengen bearbeiten
- **Nächster Schritt**: alle Aktionen nach Priorität, Engpässe, Wechselkriterien, Aufgaben
- **Checkliste**: Slots des aktiven Builds mit Quelle und Häkchen, Wechselkriterien des Ziel-Builds, offene Aufgaben
- **Rezepte**: Horadrimwürfel
- **Farmziele**: Bosse und Aktivitäten mit Kosten und Belohnungen, dazu die Wissensquellen
- **Wissen**: alle Notizen (Frage als Titel), Regeln, Einträge bearbeiten
- **Abweichungen**: Guide-Abweichungen (`thema`, je Quelle, `entscheidung`) und eigene Verdikte (`bezug`, `verdikt`), die das Wissen überstimmen
- **⚙ Dateien**: Import und Export beider Dateien, Integritätsprüfung, Charakter, Einstellungen

## Guide-Text importieren

**Builds → Guide-Text einfügen**. Die App erkennt:

- Slot-Zeilen wie `Helm: …`, `Gloves - …`, `Ring 1: …` oder `Offhand: …`, auf Deutsch und Englisch
- darunter Aufzählungen als Affixe, `Socket/Gem/Rune` als Sockel und `Temper/Härtung` als Härtungs-Affix
- die erste URL als Quelle

Alles Unklare landet sichtbar unter „Nicht zugeordnete Zeilen“. Gespeichert wird erst nach deiner Korrektur.

Builds aus der alten App-Version (Schema 1) übernimmt die App beim ersten Start automatisch ins neue Profil.
