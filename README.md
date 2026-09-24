# D4 Spickzettel

Persönlicher Diablo-4-Spickzettel: Namen oder Kategorie eintippen, zum Beispiel „Nagu“, „gelbe Rune“ oder „rare ring“. Die App zeigt sofort ein Verdikt, etwa **BEHALTEN**, **WÜRFELN**, **ZERLEGEN**, **VERWERTEN**, **VERKAUFEN** oder **ANLEGEN**.

Reines HTML/CSS/JS, kein Build-Schritt. Einzige externe Abhängigkeit ist die Texterkennung, und die wird erst beim ersten Screenshot geladen.

## Starten

| Weg | Wie |
|---|---|
| Lokaler Webserver (empfohlen) | Im Ordner `python3 -m http.server 8000` ausführen und `http://localhost:8000` öffnen |
| Aufs Handy | Gleicher Befehl auf dem PC, dann am Handy `http://<IP-des-PCs>:8000` (gleiches WLAN). Oder das Repo über GitHub Pages veröffentlichen. |
| Doppelklick auf `index.html` | Der Browser blockiert dann das Lesen der JSON-Dateien. Unter **⚙ Dateien** einmal `wissen.json` und `profil.json` von Hand importieren. |

## Die zwei Dateien (Schema 2)

| Datei | Inhalt | Verhalten |
|---|---|---|
| `data/wissen.json` | Spielwissen, für alle gleich: `eintraege`, `regeln`, `rezepte`, `farmziele`, `notizen`, `verdikte`, `seltenheitSynonyme`, `quellen` | Wird bei einem Update **komplett ersetzt**. |
| `data/profil.json` | Persönliches: `charakter`, `einstellungen`, `builds`, `aktiverBuild`, `zielBuild`, `sammelliste`, `offeneAufgaben`, `abweichungen` | Wird **nie** überschrieben. |
| `data/profil-leer.json` | Leeres Profil als Vorlage | Daraus entsteht beim ersten Start ein Profil, wenn es keine `profil.json` gibt. |

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
    "slots": {   // kopf, brust, haende, beine, fuesse, amulett, ring1, ring2, waffe, fokus
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
- Die Texterkennung ([Tesseract.js](https://github.com/naptha/tesseract.js)) läuft komplett im Browser. Beim ersten Screenshot lädt die App sie von cdn.jsdelivr.net, dafür braucht es einmal Internet.
- Die App schlägt einen Slot vor (aus dem Item-Typ oder `katalog.json`), du bestätigst ihn.
- Alle erkannten Felder erscheinen zur Korrektur. Affixzeilen haben eine Konfidenz und lassen sich einzeln bearbeiten, hinzufügen und löschen.
- **Erst „Übernehmen“ schreibt ins Inventar.** Die Analyse sieht nie den rohen Erkennungstext.
- Bei Uniques werden die ersten `num_inherents` Zeilen (aus `data/katalog.json`) als implizit vormarkiert. Das ist ein Hinweis, du kannst es umschalten.

**Slot-Analyse:** Pro Slot vergleicht die App das Item mit dem aktiven und dem Ziel-Build. Heraus kommen konkrete Handlungen mit Begründung und Priorität:
- **Ersetzen:** mit Quelle aus `wissen.uniqueQuellen` bzw. `farmziele`
- **Aspekt überprägen**
- **Sockeln:** einsetzen, ersetzen oder Sockel hinzufügen (kostet 1 Zerstreutes Prisma)
- **Verzaubern:** schlechteste Zeile auf den obersten fehlenden Zielaffix umrollen, mit Pflicht-Warnung „nur EIN Affix“
- **Rezept `reroll-affixwerte`:** wenn du Werte als schwach markiert hast
- **Härten:** nur bei Keepern, Warnung ohne Schriftrolle der Wiederherstellung
- **Vollenden:** nur Keeper und ab Qual 4

Sind mehrere Aktionen offen, zeigt die App die Bearbeitungsreihenfolge. Sie kommt aus der Notiz `item-reihenfolge` (Feld `reihenfolge`) und verlinkt auf diese Notiz.

**Reiter „Nächster Schritt“:** Alle Aktionen nach Priorität, gruppiert in „kostet nur Gold“, „braucht knappe Materialien“ und „beschaffen“.
Material-Engpässe kommen aus `wissen.engpaesse`. Fehlt das Feld, leitet die App sie aus Einträgen mit `typ: "material"` ab. Darunter stehen die Wechselkriterien des Ziel-Builds und die offenen Aufgaben.

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
  // … kopf, brust, haende, beine, fuesse, amulett, ring1, ring2, fokus (null = leer)
},
"bestand": { "Schriftrolle der Wiederherstellung": 0 }   // leer/fehlend = unbekannt
```

`aspekt` (der geprägte Aspekt) und `schwach` (Wert schwach, ohne Roll-Datenbank von dir gesetzt) sind Ergänzungen.
Die Analyse braucht sie für „Aspekt überprägen“ und das Rezept `reroll-affixwerte`.

**Neue Felder in `wissen.json`:**
- `uniqueQuellen`: `[{ "slug", "name_de", "name_en", "quelle" | "quellen": [] }]`
- optional `engpaesse`: `["Obduzit", …]`
- das Rezept `reroll-affixwerte`
- die Notiz `item-reihenfolge`

**`data/katalog.json`:** `{ "uniques": [{ "slug", "name_de", "name_en", "itemTyp", "slot", "num_inherents" }] }`. Wird ausgeliefert, aber leer.

## Tests

```
npm test        # = node --test, prüft Slot-Analyse und Tooltip-Parser (lib.js)
```

## Reiter

- **Suche** (Startseite): großes Suchfeld, darunter die Sammelliste
- **Builds**: anlegen, bearbeiten, aktiv/Ziel setzen, Guide-Text importieren, Wechselkriterien
- **Inventar**: Items per Screenshot oder von Hand erfassen, Analyse pro Slot, Material-Bestand
- **Nächster Schritt**: alle Aktionen nach Priorität, Engpässe, Wechselkriterien, Aufgaben
- **Checkliste**: Slots des aktiven Builds mit Quelle und Häkchen, Wechselkriterien des Ziel-Builds, offene Aufgaben
- **Rezepte**: Horadrimwürfel
- **Farmziele**: Farmziele und Quellen
- **Wissen**: alle Notizen (Frage als Titel), Regeln, Einträge bearbeiten
- **Abweichungen**: eigene Verdikte, die das Wissen überstimmen
- **⚙ Dateien**: Import und Export beider Dateien, Charakter, Einstellungen

## Guide-Text importieren

**Builds → Guide-Text einfügen**. Die App erkennt:

- Slot-Zeilen wie `Helm: …`, `Gloves - …`, `Ring 1: …` oder `Offhand: …`, auf Deutsch und Englisch
- darunter Aufzählungen als Affixe, `Socket/Gem/Rune` als Sockel und `Temper/Härtung` als Härtungs-Affix
- die erste URL als Quelle

Alles Unklare landet sichtbar unter „Nicht zugeordnete Zeilen“. Gespeichert wird erst nach deiner Korrektur.

Builds aus der alten App-Version (Schema 1) übernimmt die App beim ersten Start automatisch ins neue Profil.
