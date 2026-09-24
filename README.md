# D4 Spickzettel

Persönlicher Diablo-4-Spickzettel: Namen eintippen und sofort sehen, ob du ein Item
**BEHALTEN**, **WÜRFELN** (Horadrimwürfel), **ZERLEGEN**, **VERWERTEN** oder **VERKAUFEN** solltest.

Reines HTML/CSS/JS, keine Abhängigkeiten, kein Build-Schritt.

## Starten

| Weg | Wie |
|---|---|
| Lokaler Webserver (empfohlen) | Im Ordner `python3 -m http.server 8000` und dann `http://localhost:8000` öffnen |
| Aufs Handy | Gleicher Befehl auf dem PC, dann am Handy `http://<IP-des-PCs>:8000` (gleiches WLAN). Oder das Repo über GitHub Pages veröffentlichen. |
| Doppelklick auf `index.html` | Geht, aber der Browser blockiert dann das Lesen von `data/data.json` (file://). Lade die Datei einmal unter **Daten → data.json manuell laden**. Sie wird im Browser zwischengespeichert. |

## Was wo gespeichert wird

- **`data/data.json`**: Spieldaten (Items, Runen, Splitter, Materialien, Rezepte, Farm-Ziele, Sammelliste) und optional Start-Builds. Von Hand editierbar.
- **localStorage im Browser**: deine Builds, welcher Build aktiv bzw. Ziel ist, und alle Häkchen.
  Unter **Daten → Builds sichern** exportierst du die Builds als JSON. Den Block kannst du in `data.json` einsetzen, damit er dauerhaft im Repo liegt.
  Die Builds aus `data.json` werden nur übernommen, solange im Browser noch keine Builds liegen, oder wenn du **Builds aus data.json neu übernehmen** klickst.

## So entsteht das Verdikt

1. Der Name kommt im **aktiven** oder im **Ziel-Build** vor (Ziel-Item, Ziel-Aspekt oder Sockel) → **BEHALTEN**, mit Zuordnung
   „aktueller Build“, „späterer Build“ oder „beides“. Braucht ihn nur der Ziel-Build, steht dabei der Hinweis „für späteren Build“.
2. Sonst steht der Name auf der `sammelliste` → **BEHALTEN**.
3. Sonst gilt das `verdikt` aus `data.json`.
4. Sonst: **KEINE DATEN**.

Wird ein Verdikt aus `data.json` von einem Build überstimmt, zeigt die Karte es trotzdem unter „Sonst“ an.
Quelle und Würfel-Rezept werden aus `quelle`, `farmziele` und `rezepte` zusammengesucht.

Die Suche findet deutsche Namen, englische Namen und `aliase`. Groß-/Kleinschreibung, Akzente und Satzzeichen spielen keine Rolle.
Namen, die nur in einem Build stehen, sind ebenfalls findbar.

**Tipp:** Trage in den Builds die Namen so ein, wie sie in `data.json` stehen, am besten über die Autovervollständigung.
Dann steht dort „Deutsch (Englisch)“ und die Suche passt in beiden Sprachen.

## Aufbau von `data/data.json`

`data/beispiel.json` zeigt jedes Feld mit **erfundenen Platzhalter-Namen**. Alle Felder außer dem Namen dürfen leer bleiben.

```jsonc
{
  "einstellungen": { "warnTageBuildAlter": 14 },   // ab wie vielen Tagen ein Build als veraltet gilt

  "eintraege": [{
    "name_de": "", "name_en": "",        // mindestens einer von beiden
    "aliase": [],                          // weitere Suchbegriffe
    "typ": "",                             // frei: unique, aspekt, rune, splitter, material, edelstein …
    "verdikt": "",                         // BEHALTEN | WÜRFELN | ZERLEGEN | VERWERTEN | VERKAUFEN
    "begruendung": "",                     // eine Zeile
    "quelle": "",                          // Boss / Aktivität
    "rezepte": [],                         // IDs aus "rezepte"
    "notiz": ""
  }],

  "rezepte": [{
    "id": "", "name_de": "", "name_en": "",
    "input":  [{ "name_de": "", "name_en": "", "menge": 1 }],  // oder einfach ein Text
    "kosten": [{ "name_de": "", "name_en": "", "menge": 1 }],  // oder einfach ein Text
    "ergebnis": "",
    "notiz": ""
  }],

  "farmziele": [{
    "quelle_de": "", "quelle_en": "", "typ": "Boss",   // oder "Aktivität"
    "kosten": "",
    "belohnungen": [{ "name_de": "", "name_en": "" }],  // oder Texte
    "notiz": ""
  }],

  "sammelliste": [{ "name_de": "", "name_en": "", "notiz": "" }],

  "builds": [{
    "id": "", "name": "", "klasse": "", "quelleUrl": "", "datum": "YYYY-MM-DD", "notiz": "",
    "slots": {                     // kopf, brust, haende, beine, fuesse, amulett, ring1, ring2, waffe, fokus
      "kopf": {
        "zielItem": "", "zielAspekt": "", "sockel": "",
        "affixe": [], "haertung": "", "quelle": "", "erledigt": false
      }
    },
    "wechselkriterien": [{ "text": "", "erledigt": false }]
  }],
  "aktiverBuild": "",   // Build-ID
  "zielBuild": ""       // Build-ID
}
```

Nach dem Bearbeiten reicht ein Neuladen der Seite. Ist das JSON kaputt, zeigt die App eine Fehlermeldung.

## Guide-Text importieren

**Builds → Guide-Text einfügen**. Die App erkennt:

- Slot-Zeilen wie `Helm: …`, `Gloves - …`, `Ring 1: …`, `Offhand: …` (deutsch und englisch). Ein Slotname allein auf einer Zeile nimmt die nächste Zeile als Wert.
- Werte mit „Aspect/Aspekt“ werden zum Ziel-Aspekt, alles andere zum Ziel-Item.
- Darunter: Aufzählungszeilen (`-`, `•`, `1.`) als Affix-Prioritäten, `Socket/Gem/Rune/Sockel` als Sockel, `Temper/Härtung` als Härtungs-Affix.
- Die erste URL wird zur Quelle.
- Namen, die in `data.json` stehen, werden auf „Deutsch (Englisch)“ umgeschrieben und markiert.

Alles, was nicht eindeutig passt, landet sichtbar unter „Nicht zugeordnete Zeilen“. Gespeichert wird erst nach deiner Korrektur.
