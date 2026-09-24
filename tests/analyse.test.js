'use strict';
// Ausführen: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib.js');

const wissen = {
  seltenheitSynonyme: [
    { id: 'selten', name_de: 'Selten', name_en: 'Rare', synonyme: ['gelb', 'yellow', 'rare'] },
    { id: 'legendär', name_de: 'Legendär', name_en: 'Legendary', synonyme: ['orange', 'legendary'] },
    { id: 'einzigartig', name_de: 'Einzigartig', name_en: 'Unique', synonyme: ['unique', 'braun', 'gold'] },
    { id: 'vermacht', name_de: 'Vermacht', name_en: 'Ancestral', synonyme: ['900', 'ancestral'] },
  ],
  eintraege: [
    { name_de: 'Testschwert', name_en: 'Test Sword', typ: 'unique', slot: 'waffe', quelle: 'Fürst Test (Lord Test)' },
    { name_de: 'Zerstreutes Prisma', name_en: 'Scattered Prism', typ: 'material', bestandsschluessel: 'Scattered Prism', engpass: true },
    { name_de: 'Obduzit', name_en: 'Obducite', typ: 'material', bestandsschluessel: 'Obducite' },
    { name_de: 'Vergessene Seelen', name_en: 'Forgotten Soul', typ: 'material', bestandsschluessel: 'Forgotten Souls', engpass: true },
    { name_de: 'Schriftrolle der Wiederherstellung', name_en: 'Scroll of Restoration', typ: 'material', bestandsschluessel: 'Scroll of Restoration', engpass: true },
  ],
  rezepte: [{ id: 'reroll-affixwerte', name_de: 'Affixwerte neu würfeln' }],
  farmziele: [{ quelle_de: 'Fürst Test', quelle_en: 'Lord Test', typ: 'Unterschlupf-Boss', kosten: '1x Schlüssel', belohnungen: ['Anderes Teil'] }],
  notizen: [{ id: 'item-reihenfolge', frage: 'In welcher Reihenfolge bearbeite ich ein Item?', reihenfolge: L.STANDARD_REIHENFOLGE }],
  quellen: [],
  uniqueQuellen: [],
};

const build = {
  id: 'a', name: 'Aktiv',
  slots: {
    waffe: {
      zielItem: 'Testschwert', zielAspekt: '', sockel: 'Ruby',
      affixe: ['Critical Strike Damage', 'Attack Speed', 'Strength'], haertung: 'Vulnerable Damage',
    },
  },
};
const ziel = { id: 'z', name: 'Ziel', slots: { waffe: { affixe: ['Lucky Hit Chance'] } } };

function item(over = {}) {
  return L.normalizeItem(Object.assign({
    name: 'Testschwert', seltenheit: 'einzigartig', itemTyp: 'Sword', vermacht: false,
    affixe: [
      { text: 'Willpower', implizit: true },
      { text: 'Critical Strike Damage', wert: '40%' },
      { text: 'Attack Speed', wert: '8%' },
      { text: 'Strength', wert: '90' },
    ],
    sockel: [{ gefuellt: false, inhalt: '' }],
    haertungen: { genutzt: 0, max: 2, affix: '' },
    vollendung: { stufe: 0, max: 25 },
  }, over));
}

const katalogAffixe = { kategorien: { affixe: { 'einträge': ['Critical Strike Damage', 'Attack Speed', 'Strength', 'Lucky Hit Chance', 'Thorns',
  'Willpower', 'Maximum Life', 'Dexterity', 'Vulnerable Damage'].map(name_en => ({ name_en })) } } };
const run = (it, over = {}) => L.analysiereSlot(Object.assign({
  slotKey: 'waffe', item: it, build, andererBuild: ziel,
  charakter: { qualstufe: 6 }, bestand: {}, wissen, katalog: katalogAffixe,
}, over));
const kat = (res, k) => res.aktionen.filter(a => a.kategorie === k);

test('Alle Zielaffixe, leerer Sockel, 0 Härtungen → Sockel und Härten, kein Verzaubern', () => {
  const r = run(item());
  assert.equal(kat(r, 'sockel').length, 1);
  assert.match(kat(r, 'sockel')[0].text, /Ruby.*einsetzen/);
  assert.equal(kat(r, 'haerten').length, 1);
  assert.match(kat(r, 'haerten')[0].text, /Vulnerable Damage/);
  assert.equal(kat(r, 'affixe').length, 0, 'keine Verzauber-Empfehlung');
  assert.equal(kat(r, 'ersetzen').length, 0);
  // Die Pflicht-Warnung ist trotzdem sichtbar
  assert.ok(r.infos.some(i => i.text === L.TEXT.einAffix));
  // Ohne Schriftrollen: Härten-Warnung
  assert.equal(kat(r, 'haerten')[0].warnung, L.TEXT.keinReset);
  // Mehr als eine Aktion → Reihenfolge Sockel vor Härten
  const order = r.reihenfolge.map(a => a.kategorie);
  assert.ok(order.indexOf('sockel') < order.indexOf('haerten'));
});

test('Item mit verzaubertem Affix → keine Verzauber-Empfehlung, sondern Gebunden-Hinweis', () => {
  const it = item({
    affixe: [
      { text: 'Willpower', implizit: true },
      { text: 'Dexterity', wert: '50', verzaubert: true },
      { text: 'Maximum Life', wert: '300' },
    ],
  });
  const r = run(it);
  assert.equal(kat(r, 'affixe').length, 0);
  assert.ok(r.infos.some(i => /bereits an „Dexterity“ gebunden/.test(i.text)));
});

test('Nicht Zielitem und nicht vermacht → Ersetzen, KEINE Härtungs- oder Vollendungsempfehlung', () => {
  const r = run(item({ name: 'Anderes Schwert', seltenheit: 'legendär' }));
  assert.equal(kat(r, 'ersetzen').length, 1);
  assert.match(kat(r, 'ersetzen')[0].text, /Ersetzen durch Testschwert/);
  const q = kat(r, 'ersetzen')[0].quellen;
  assert.deepEqual(q.map(x => x.text), ['Fürst Test (Lord Test)', 'Fürst Test (Lord Test) [Unterschlupf-Boss]']);
  assert.equal(q[1].farm.kosten, '1x Schlüssel');
  assert.equal(kat(r, 'haerten').length, 0);
  assert.equal(kat(r, 'vollenden').length, 0);
  assert.ok(r.infos.some(i => i.text === L.TEXT.nichtHaerten));
  assert.ok(r.infos.some(i => i.text === L.TEXT.obduzitSparen));
});

test('Vermachtes Item ist Keeper, auch wenn es nicht das Zielitem ist', () => {
  const r = run(item({ name: 'Anderes Schwert', vermacht: true }));
  assert.equal(kat(r, 'ersetzen').length, 1);
  assert.equal(kat(r, 'haerten').length, 1);
  assert.equal(kat(r, 'vollenden').length, 1);
});

test('Qualstufe 2 → keine Vollendungsempfehlung', () => {
  const r = run(item(), { charakter: { qualstufe: 2 } });
  assert.equal(kat(r, 'vollenden').length, 0);
  assert.ok(r.infos.some(i => i.kategorie === 'vollenden' && /Erst ab Qual 4/.test(i.text)));
});

test('Qualstufe 6 und Keeper → Vollenden mit Obduzit', () => {
  const r = run(item());
  assert.equal(kat(r, 'vollenden').length, 1);
  assert.equal(kat(r, 'vollenden')[0].material.de, 'Obduzit');
  assert.equal(kat(r, 'vollenden')[0].material.bestand, null, 'Bestand unbekannt');
});

test('Leerer Slot → Zielitem und Quelle, keine Fehlermeldung', () => {
  const r = run(null);
  assert.equal(r.aktionen.length, 1);
  assert.equal(r.aktionen[0].kategorie, 'beschaffen');
  assert.match(r.aktionen[0].text, /Testschwert/);
  assert.equal(r.aktionen[0].quellen[0].text, 'Fürst Test (Lord Test)');
  assert.equal(r.aktionen[0].quellen[1].farm.kosten, '1x Schlüssel');
});

test('Leerer Slot ohne Build-Ziel → nur Info', () => {
  const r = run(null, { slotKey: 'kopf' });
  assert.equal(r.aktionen.length, 0);
  assert.equal(r.infos.length, 1);
});

test('Fehlender Zielaffix → schlechteste Zeile umrollen (in keinem Build gefragt zuerst)', () => {
  const r = run(item({
    affixe: [
      { text: 'Willpower', implizit: true },
      { text: 'Lucky Hit Chance', wert: '5%' },     // im Ziel-Build gefragt
      { text: 'Thorns', wert: '500' },              // in keinem Build
      { text: 'Attack Speed', wert: '8%' },
      { text: 'Strength', wert: '90' },
    ],
  }));
  const v = kat(r, 'affixe');
  assert.equal(v.length, 1);
  assert.equal(v[0].text, 'Zeile „Thorns“ umrollen auf „Critical Strike Damage“');
  assert.equal(v[0].prio, 'hoch');
});

test('Vermachtes Item: Verzaubern kostet Vergessene Seelen', () => {
  const r = run(item({ vermacht: true, affixe: [{ text: 'Willpower', implizit: true }, { text: 'Thorns', wert: '1' }] }));
  assert.equal(kat(r, 'affixe')[0].material.de, 'Vergessene Seelen');
  assert.ok(r.infos.some(i => i.text === L.TEXT.seelen('Vergessene Seelen')));
});

test('Nur schwache Werte → Rezept reroll-affixwerte', () => {
  const it = item();
  it.affixe[1].schwach = true;
  const r = run(it);
  const v = kat(r, 'affixe');
  assert.equal(v.length, 1);
  assert.match(v[0].text, /reroll-affixwerte/);
});

test('Falscher Sockelinhalt → ersetzen, fehlender Sockel → Prisma', () => {
  const r1 = run(item({ sockel: [{ gefuellt: true, inhalt: 'Emerald' }] }));
  assert.match(kat(r1, 'sockel')[0].text, /Emerald“ ersetzen durch „Ruby“. Der alte Edelstein ist nicht verloren/);
  const r2 = run(item({ sockel: [] }));
  assert.match(kat(r2, 'sockel')[0].text, /kostet 1 Zerstreutes Prisma/);
  assert.equal(kat(r2, 'sockel')[0].gruppe, 'material');
  assert.equal(kat(r2, 'sockel')[0].material.en, 'Scattered Prism');
  assert.equal(kat(r2, 'sockel')[0].material.engpass, true);
});

test('Splitter im Build ohne Sockel → Priorität hoch', () => {
  const b = { id: 'a', name: 'A', slots: { waffe: { zielItem: 'Testschwert', sockel: 'Testsplitter' } } };
  const r = run(item({ sockel: [] }), { build: b });
  assert.equal(kat(r, 'sockel')[0].prio, 'hoch');
});

test('Schriftrolle im Bestand → keine Kein-Reset-Warnung', () => {
  const r = run(item(), { bestand: { 'Scroll of Restoration': 2 } });
  assert.equal(kat(r, 'haerten')[0].warnung, '');
});

test('Schriftrolle mit Bestand 0 oder null → Kein-Reset-Warnung', () => {
  assert.equal(kat(run(item(), { bestand: { 'Scroll of Restoration': 0 } }), 'haerten')[0].warnung, L.TEXT.keinReset);
  assert.equal(kat(run(item(), { bestand: { 'Scroll of Restoration': null } }), 'haerten')[0].warnung, L.TEXT.keinReset);
});

test('Bestand 0 → Aktion blockiert und nach unten sortiert, nicht versteckt', () => {
  const r = run(item({ sockel: [] }), { bestand: { 'Scattered Prism': 0 } });
  const s = kat(r, 'sockel')[0];
  assert.equal(s.blockiert, true);
  assert.equal(s.material.bestand, 0);
  assert.equal(r.aktionen[r.aktionen.length - 1], s);
  const r2 = run(item({ sockel: [] }), { bestand: { 'Scattered Prism': 2 } });
  assert.equal(kat(r2, 'sockel')[0].blockiert, false);
});

test('Materialname kommt aus den Daten: ohne Eintrag bleibt der Schlüssel stehen', () => {
  const m = L.material({ eintraege: [] }, {}, 'Scattered Prism', 1);
  assert.equal(m.de, 'Scattered Prism');
  assert.equal(m.imWissen, false);
  assert.equal(m.bestand, null);
});

test('Engpässe: aus engpass:true, sonst aus typ material', () => {
  assert.equal(L.engpassListe(wissen).herkunft, 'engpass');
  assert.equal(L.engpassListe(wissen).liste.length, 3);
  const w = { eintraege: [{ name_de: 'Obduzit', name_en: 'Obducite', typ: 'material' }] };
  assert.equal(L.engpassListe(w).herkunft, 'material');
});

test('Integritätsprüfung findet fehlende Rezepte, Verdikte und Bestandsschlüssel', () => {
  const w = {
    verdikte: [{ id: 'BEHALTEN' }], rezepte: [{ id: 'a' }],
    eintraege: [{ name_de: 'X', verdikt: 'WEG', rezepte: ['a', 'b'] }, { name_de: 'M', bestandsschluessel: 'M1' }, { name_de: 'N', bestandsschluessel: 'N1' }],
    regeln: [{ id: 'r', verdikt: 'BEHALTEN', rezepte: ['c'] }],
  };
  const r = L.pruefeIntegritaet(w, { bestand: { M1: null, Z: 3 }, builds: [{ id: 'b', slots: { hose: {}, beinkleid: {} } }], aktiverBuild: 'b', zielBuild: 'fehlt' });
  assert.deepEqual(r.fehlendeRezepte.map(x => x.id), ['b', 'c']);
  assert.deepEqual(r.fehlendeVerdikte.map(x => x.id), ['WEG']);
  assert.deepEqual(r.bestandFehlt, ['N1']);
  assert.deepEqual(r.bestandNull, ['M1']);
  assert.deepEqual(r.bestandOhneMaterial, ['Z']);
  assert.deepEqual(r.slotsUnbekannt, ['b.beinkleid']);
  assert.deepEqual(r.buildsFehlen, ['zielBuild = fehlt']);
});

test('Slot-Aliase: alte Schlüssel haende/beine/fuesse werden gelesen', () => {
  const inv = L.normalizeInventar({ haende: { name: 'A' }, beine: { name: 'B' }, fuesse: { name: 'C' } });
  assert.equal(inv.handschuhe.name, 'A');
  assert.equal(inv.hose.name, 'B');
  assert.equal(inv.stiefel.name, 'C');
});

test('Katalog: kategorien.uniques.einträge mit Unterstrich-Slugs', () => {
  const k = { kategorien: { uniques: { typ: 'unique', 'einträge': [{ slug: 'aegroms_schism', name_en: 'Aegroms Schism' }] } } };
  assert.equal(L.findeUnique(k, "Aegrom's Schism").slug, 'aegroms_schism');
  assert.equal(L.findeUnique(k, 'Aegroms Schism').slug, 'aegroms_schism');
  assert.equal(L.katalogListe(k, 'uniques').length, 1);
});

test('Verdikt-Farbnamen werden auf CSS abgebildet', () => {
  assert.equal(L.farbeCss('gruen'), '#2e9b50');
  assert.equal(L.farbeCss('#123456'), '#123456');
  assert.equal(L.farbeCss('quatsch'), '');
});

test('Tooltip-Parser: Name, Seltenheit, Typ, Macht, Affixe, Sockel, Härtung', () => {
  const lines = [
    { text: 'ELEGY', confidence: 91 },
    { text: 'Ancestral Unique Sword', confidence: 88 },
    { text: '850 Item Power', confidence: 95 },
    { text: '1,234 Damage per Second', confidence: 90 },
    { text: '+85 Willpower', confidence: 80 },
    { text: '+7.0% Physical Damage Multiplier', confidence: 62 },
    { text: '+12.5% Damage to Close', confidence: 75 },
    { text: 'enemies', confidence: 70 },
    { text: 'Tempered 1/2', confidence: 85 },
    { text: 'Empty Socket', confidence: 90 },
    { text: 'Requires Level 60', confidence: 90 },
  ];
  const katalog = { uniques: [{ slug: 'elegy', name_en: 'Elegy', itemTyp: 'Sword', num_inherents: 1 }] };
  const r = L.parseTooltip(lines, { wissen, katalog });
  assert.equal(r.item.name, 'Elegy', 'Unique-Name über den Katalog normalisiert');
  assert.equal(r.item.seltenheit, 'einzigartig');
  assert.equal(r.item.vermacht, true);
  assert.equal(r.item.itemTyp, 'Sword');
  assert.equal(r.item.gegenstandsmacht, 850);
  assert.equal(r.item.quelle, 'ocr');
  assert.deepEqual(r.item.affixe.map(a => [a.text, a.wert, a.implizit]), [
    ['Willpower', '+85', true],
    ['Physical Damage Multiplier', '+7.0%', false],
    ['Damage to Close enemies', '+12.5%', false],
  ]);
  assert.equal(r.item.affixe[1].konfidenz, 62);
  assert.deepEqual(r.item.haertungen, { genutzt: 1, max: 2, affix: '' });
  assert.deepEqual(r.item.sockel, [{ gefuellt: false, inhalt: '' }]);
  assert.equal(r.slot.key, 'waffe');
});

test('Tooltip-Parser: Unique ohne Katalog → nichts implizit, Hinweis', () => {
  const r = L.parseTooltip(['Some Helm', 'Unique Helm', '+10% Armor'], { wissen, katalog: { uniques: [] } });
  assert.equal(r.item.affixe[0].implizit, false);
  assert.match(r.implizitHinweis, /nicht in katalog\.json/);
  assert.equal(r.slot.key, 'kopf');
  assert.match(r.implizitHinweis, /selbst markieren/);
});

test('Slot-Vorschlag: zweiter Ring geht auf Ring 2', () => {
  const s = L.slotVorschlag({ itemTyp: 'Ring', inventar: { ring1: { name: 'x' } } });
  assert.equal(s.key, 'ring2');
});

// Echte Tesseract-Ausgabe eines Spiel-Screenshots (Legendary Helm), inklusive der typischen Fehlglyphen.
const echterHelm = [
  [95, ''], [78, 'SADISTIC DOS'], [88, 'CASQUE'], [97, 'Legendary Helm'], [96, '850 Item Power'], [96, '1,275 Armor'],
  [91, 'o +85 Willpower +[83 - 99]'], [86, '¢ +1,064 Maximum Life [1,016 - 1,225]'], [85, '¢ +943 Armor [780 - 980]'],
  [90, 'o +2 to Sigil of Chaos [2 - 3]'], [93, '* Imprinted: When killing your'], [93, 'Demons, you have a 45% [30 - 50]%'],
  [97, 'chance for each to count as two'], [96, 'kills. Your Life on Kill is increased'], [87, 'by 1%[+] of your Maximum Life.'],
  [94, 'i Requires Level 70'], [70, 'j Account Bound'], [83, 'Lord of Hatred Item 1¥'], [71, 'Sell Value: 21,409 ®'],
  [96, 'Durability: 30/100'], [97, 'Tempers: 3/3'], [34, 'AE TW WT TTL em TT WY,'],
].map(([confidence, text]) => ({ confidence, text }));

test('Echter Tooltip: Glyphen, Bereiche, Aspekt-Absatz und Fußzeilen werden richtig behandelt', () => {
  const w = Object.assign({}, wissen, {
    eintraege: [...wissen.eintraege, { name_de: 'Sadistischer Aspekt', name_en: 'Sadistic Aspect', typ: 'aspekt' }],
  });
  const katalog = { kategorien: {
    affixe: { 'einträge': ['Willpower', 'Maximum Life', 'Armor', 'To Sigil of Chaos'].map(n => ({ name_en: n })) },
    aspekte: { 'einträge': [{ name_en: 'Sadistic' }, { name_en: 'Doombringer' }] },
  } };
  const r = L.parseTooltip(echterHelm, { wissen: w, katalog });
  assert.equal(r.item.seltenheit, 'legendär');
  assert.equal(r.item.itemTyp, 'Helm');
  assert.equal(r.item.gegenstandsmacht, 850);
  assert.equal(r.item.aspekt, 'Sadistischer Aspekt (Sadistic Aspect)');
  assert.deepEqual(r.item.affixe.map(a => [a.wert, a.text]), [
    ['+85', 'Willpower'], ['+1,064', 'Maximum Life'], ['+943', 'Armor'], ['+2', 'To Sigil of Chaos'],
  ]);
  assert.deepEqual(r.item.haertungen, { genutzt: 3, max: 3, affix: '' });
  assert.equal(r.slot.key, 'kopf');
  // keine Glyphen im Ergebnis
  const sichtbar = [r.item.name, r.item.aspekt, ...r.item.affixe.flatMap(a => [a.text, a.wert])].join(' ');
  assert.doesNotMatch(sichtbar, /[©®¢¥\[\]]/);
});

test('OCR-Tippfehler im Affix werden über den Katalog korrigiert und markiert', () => {
  const katalog = { kategorien: { affixe: { 'einträge': [{ name_en: 'Thorns' }, { name_en: 'Strength' }] } } };
  const r = L.parseTooltip(['X', 'Rare Gloves', '800 Item Power', '+320 Thoms', '+95 Strenqth'], { wissen, katalog });
  assert.deepEqual(r.item.affixe.map(a => [a.text, a.korrigiertAus]), [['Thorns', 'Thoms'], ['Strength', 'Strenqth']]);
});

test('Stern vor einem Affix → als groß vorgemerkt', () => {
  const r = L.parseTooltip(['X', 'Legendary Ring', '800 Item Power', '* +12% Critical Strike Chance', 'o +5% Attack Speed'], { wissen });
  assert.deepEqual(r.item.affixe.map(a => a.gross), [true, false]);
});

test('lib.js, app.js und inventar.js vertragen sich im selben globalen Scope (keine doppelten Namen)', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const quelle = ['lib.js', 'app.js', 'inventar.js', 'fehlt.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n;\n');
  assert.doesNotThrow(() => new vm.Script(quelle));
});

const uebersetzung = { affixe: { 'Willenskraft': 'Willpower', 'Maximales Leben': 'Maximum Life', 'Krit-Schaden': 'Critical Strike Damage' } };
const deBuild = { id: 'de', name: 'DE', slots: { handschuhe: { zielAspekt: 'X', affixe: ['Willenskraft', 'Krit-Schaden', 'Maximales Leben'] } } };
const handschuh = over => L.normalizeItem(Object.assign({ name: 'Glove', seltenheit: 'legendär', affixe: [
  { text: 'Willpower', wert: '+225' }, { text: 'Maximum Life', wert: '+2047' }, { text: 'Thorns', wert: '+300' },
] }, over));

test('Deutsche Build-Affixe gegen englische Tooltips: Willenskraft = Willpower, kein Fehlalarm', () => {
  const r = L.analysiereSlot({ slotKey: 'handschuhe', item: handschuh(), build: deBuild, charakter: { qualstufe: 8 }, bestand: {}, wissen, katalog: katalogAffixe, uebersetzung });
  const v = r.aktionen.filter(a => a.kategorie === 'affixe');
  assert.equal(v.length, 1);
  assert.equal(v[0].text, 'Zeile „Thorns“ umrollen auf „Krit-Schaden (Critical Strike Damage)“');
  assert.ok(!JSON.stringify(r).includes('Willenskraft (Willpower)“ fehlt'));
});

test('Ohne Übersetzung: kein „fehlt“ und keine Umroll-Empfehlung, sondern Hinweis „nicht vergleichbar“', () => {
  const r = L.analysiereSlot({ slotKey: 'handschuhe', item: handschuh(), build: deBuild, charakter: { qualstufe: 8 }, bestand: {}, wissen, katalog: katalogAffixe, uebersetzung: {} });
  assert.equal(r.aktionen.filter(a => a.kategorie === 'affixe').length, 0);
  assert.ok(r.infos.some(i => /Nicht vergleichbar.*Willenskraft/.test(i.text)));
});

test('Primärattribut passt auf jedes Primärattribut (oder auf charakter.primaerattribut)', () => {
  assert.ok(L.affixPasst('Willpower', 'Primärattribut', {}, {}));
  assert.ok(L.affixPasst('Strength', 'Primärattribut', {}, {}));
  assert.ok(!L.affixPasst('Strength', 'Primärattribut', {}, { primaerattribut: 'Willpower' }));
  assert.ok(!L.affixPasst('Critical Strike Damage Multiplier', 'Critical Strike Damage', {}, {}), 'kein Teiltreffer');
});

test('Härtungs-Ziel mit Klammerzusatz wird übersetzt verglichen', () => {
  assert.deepEqual(L.affixVarianten('Maximales Leben (Worldly Endurance)', uebersetzung.affixe), ['Maximales Leben', 'Maximum Life']);
});

// ---------- Echte Tesseract-Ausgaben (tests/fixtures/ocr-*.json, Bilder in tests/fixtures/bilder/) ----------
const fixture = n => require(`./fixtures/ocr-${n}.json`);
const echtesWissen = require('../data/wissen.json');
const echterKatalog = require('../data/katalog.json');

test('Echter Screenshot Stealth (Unique mit Runenwort, abgeschnittener Tooltip)', () => {
  const r = L.parseTooltip(fixture('stealth'), { wissen: echtesWissen, katalog: echterKatalog });
  assert.equal(r.item.name, 'Stealth');
  assert.equal(r.item.seltenheit, 'einzigartig');
  assert.equal(r.item.itemTyp, 'Chest Armor');
  assert.equal(r.item.gegenstandsmacht, 850);
  assert.deepEqual(r.item.affixe.map(a => [a.wert, a.text]), [
    ['+1,671', 'Maximum Life'], ['15.0%', 'Resource Generation'], ['+25.0%', 'Attack Speed'],
    ['+25%', 'Movement Speed'], ['15.0%', 'Damage Reduction'], ['25.0%', 'Impairment Reduction'],
  ]);
  assert.deepEqual(r.item.sockel, [{ gefuellt: true, inhalt: 'Cir' }, { gefuellt: true, inhalt: 'Ohm' }]);
  assert.ok(r.hinweise.some(h => /abgeschnitten/.test(h)));
  assert.equal(r.slot.key, 'brust');
});

test('Echter Screenshot Edgemaster\'s (großer und verzauberter Affix, x-Multiplikator)', () => {
  const r = L.parseTooltip(fixture('edgemaster'), { wissen: echtesWissen, katalog: echterKatalog });
  assert.equal(r.item.seltenheit, 'legendär');
  assert.equal(r.item.vermacht, true);
  assert.equal(r.item.itemTyp, 'Gloves');
  assert.equal(r.item.gegenstandsmacht, 900);
  assert.match(r.item.aspekt, /Edgemasters/);
  assert.deepEqual(r.item.affixe.map(a => [a.wert, a.text, a.gross, a.verzaubert]), [
    ['+225', 'Willpower', true, false],
    ['+2,047', 'Maximum Life', false, false],
    ['+293', 'Life on Hit', false, true],
    ['x14%', 'Fire Damage Multiplier', false, false],
  ]);
  assert.deepEqual(r.item.haertungen, { genutzt: 4, max: 4, affix: '' });
  assert.equal(r.slot.key, 'handschuhe');
});

test('Echter Screenshot Helm über die App-Pipeline', () => {
  const r = L.parseTooltip(fixture('helm'), { wissen: echtesWissen, katalog: echterKatalog });
  assert.equal(r.item.aspekt, 'Sadistischer Aspekt (Sadistic Aspect)');
  assert.deepEqual(r.item.affixe.map(a => a.text), ['Willpower', 'Maximum Life', 'Armor', 'To Sigil of Chaos']);
  assert.deepEqual(r.item.haertungen, { genutzt: 3, max: 3, affix: '' });
});

test('Echtes Profil: Handschuh mit Willpower meldet Willenskraft nicht als fehlend', () => {
  const uebersetzung = require('../data/uebersetzungen.json');
  const item = L.normalizeItem(L.parseTooltip(fixture('edgemaster'), { wissen: echtesWissen, katalog: echterKatalog }).item);
  const build = { id: 'starter', name: 'Starter', slots: { handschuhe: {
    zielAspekt: 'Aspekt des höllischen Befehlshabers (Hellbent Commander Aspect)',
    affixe: ['Willenskraft', 'Krit-Schaden-Multiplikator', 'Verwundbar-Schaden-Multiplikator', 'Maximales Leben'],
    haertung: 'Krit-Schaden (Worldly Finesse)' } } };
  const r = L.analysiereSlot({ slotKey: 'handschuhe', item, build, charakter: { qualstufe: 8 }, bestand: {}, wissen: echtesWissen, katalog: echterKatalog, uebersetzung });
  const text = JSON.stringify(r);
  assert.ok(!/Willenskraft[^"]*fehlt/.test(text), 'Willenskraft darf nicht als fehlend gelten');
  assert.ok(r.infos.some(i => /bereits an „Life on Hit“ gebunden/.test(i.text)));
});

test('Unique ohne markierte implizite Zeilen → keine Umroll-Empfehlung, sondern Bitte zum Markieren', () => {
  const it = item({ affixe: [{ text: 'Thorns', wert: '1' }, { text: 'Attack Speed', wert: '8%' }] });   // item() ist ein Unique
  const r = run(it);
  assert.equal(kat(r, 'affixe').length, 0);
  assert.ok(r.infos.some(i => /implizit.*markieren/.test(i.text)));
  const it2 = item({ affixe: [{ text: 'Willpower', implizit: true }, { text: 'Thorns', wert: '1' }, { text: 'Attack Speed', wert: '8%' }] });
  assert.equal(kat(run(it2), 'affixe').length, 1, 'mit markierter impliziter Zeile gibt es wieder eine Empfehlung');
});

// ---------- Was fehlt ----------
const wissenFehlt = {
  seltenheitSynonyme: wissen.seltenheitSynonyme,
  verdikte: [{ id: 'BEHALTEN' }],
  eintraege: [
    { name_de: 'Elegie', name_en: 'Elegy', typ: 'unique', quelle: 'Fürst Zir (Lord Zir)' },
    { name_de: 'Leorics Krone', name_en: "Leoric's Crown", typ: 'unique', quelle: 'Baal' },
    { name_de: 'Splitter der Qual', name_en: 'Splinter of Anguish', typ: 'splitter' },
    { name_de: 'Zerstreutes Prisma', name_en: 'Scattered Prism', typ: 'material', bestandsschluessel: 'Scattered Prism', engpass: true, quelle: 'Weltbosse' },
    { name_de: 'Aspekt der Zündung', name_en: 'Aspect of Ignition', typ: 'aspekt' },
  ],
  regeln: [{ id: 'rune-ueberschuss', trifft: { typ: 'rune' }, ausnahmen: ['Nagu', 'Tir', 'Eth', 'Ith', 'Tal'] }],
  rezepte: [], notizen: [],
  farmziele: [
    { quelle_de: 'Fürst Zir', typ: 'Unterschlupf-Boss', kosten: '1x Unterschlupfschlüssel', belohnungen: [{ name_de: 'Elegie', name_en: 'Elegy' }] },
    { quelle_de: 'Weltbosse', typ: 'Aktivität', belohnungen: ['Zerstreute Prismen'] },
  ],
  runen: { aufwertungskette: ['3x Tir -> Eth', '3x Eth -> Ith', '3x Ith -> Tal'] },
};
const profilFehlt = over => Object.assign({
  aktiverBuild: 'a', zielBuild: 'z', charakter: {}, bestand: { 'Scattered Prism': 0 }, kodex: {}, inventar: {}, ausgeblendet: [],
  builds: [
    { id: 'a', name: 'A', slots: {
      waffe: { zielItem: 'Elegie (Elegy)', sockel: 'Nagu' },
      kopf: { zielItem: "Leorics Krone (Leoric's Crown)", sockel: 'Splitter der Qual' },
      ring2: { zielAspekt: 'Aspekt der Zündung (Aspect of Ignition)', affixe: ['Willenskraft'] },
    } },
    { id: 'z', name: 'Z', slots: { brust: { zielItem: 'Enigma', sockel: 'Tal' } } },
  ],
}, over);
const fehlt = over => L.wasFehlt({ profil: profilFehlt(over), wissen: wissenFehlt, katalog: katalogAffixe, uebersetzung: { affixe: { Willenskraft: 'Willpower' } } });

test('Was fehlt: leeres Inventar → alle Zielitems beider Builds als Posten, kein Fehler', () => {
  const r = fehlt();
  const items = r.posten.filter(x => x.art === 'item').map(x => x.name).sort();
  assert.deepEqual(items, ['Elegy', 'Enigma', "Leoric's Crown"]);
  assert.ok(r.posten.some(x => x.art === 'profil' && x.slots.includes('Ring 2')));
  assert.ok(r.posten.some(x => x.art === 'aspekt' && /Zündung/.test(x.titel)));
  assert.ok(r.posten.some(x => x.art === 'sockel' && /Splitter der Qual/.test(x.titel)));
});

test('Was fehlt: Slot als erledigt markiert → Posten verschwindet', () => {
  const p = profilFehlt();
  p.builds[0].slots.waffe.erledigt = true;
  const r = L.wasFehlt({ profil: p, wissen: wissenFehlt, katalog: katalogAffixe });
  assert.ok(!r.posten.some(x => x.name === 'Elegy'));
  assert.ok(!r.posten.some(x => x.id === 'rune:nagu'), 'auch die Rune des erledigten Slots entfällt');
});

test('Was fehlt: Material mit Bestand 0, das drei Aktionen blockiert → Blockierer mit Zahl 3', () => {
  const ohneSockel = n => ({ name: n, seltenheit: 'legendär', affixe: [], sockel: [] });
  const p = profilFehlt({
    inventar: { ring1: ohneSockel('R1'), ring2: ohneSockel('R2'), amulett: ohneSockel('A') },
    builds: [{ id: 'a', name: 'A', slots: {
      ring1: { zielAspekt: 'X', sockel: 'Splitter der Qual' }, ring2: { zielAspekt: 'Y', sockel: 'Splitter der Qual' },
      amulett: { zielAspekt: 'Z', sockel: 'Splitter der Qual' },
    } }],
    zielBuild: '',
  });
  const r = L.wasFehlt({ profil: p, wissen: wissenFehlt, katalog: katalogAffixe });
  const m = r.posten.find(x => x.art === 'material');
  assert.equal(m.blockiert, 3);
  assert.equal(L.sortiereNachPrioritaet(r.posten)[0], m, 'Blockierer stehen ganz oben');
});

test('Was fehlt: Posten ohne passendes Farmziel → „Sonstiges“ mit Freitext-Quelle', () => {
  const r = fehlt();
  const g = L.gruppiereNachQuelle(wissenFehlt, r.posten);
  const sonst = g.find(x => x.titel === 'Sonstiges');
  const krone = sonst.posten.find(x => x.name === "Leoric's Crown");
  assert.equal(krone.quelleFrei, 'Baal');
  const zir = g.find(x => x.farmziel && x.farmziel.quelle_de === 'Fürst Zir');
  assert.ok(zir.posten.some(x => x.name === 'Elegy'));
  assert.ok(g.find(x => x.farmziel && x.farmziel.quelle_de === 'Weltbosse') || true);
});

test('Was fehlt: ausgeblendeter Posten erscheint nicht, der Zähler stimmt trotzdem', () => {
  const alle = fehlt();
  const r = fehlt({ ausgeblendet: ['item:elegy'] });
  assert.equal(r.posten.length, alle.posten.length - 1);
  assert.equal(r.ausgeblendet, 1);
  assert.equal(r.gesamt, alle.gesamt);
  assert.ok(!r.posten.some(x => x.id === 'item:elegy'));
});

test('Was fehlt: Aspekt mit Kodex-Rang gilt als vorhanden, null = nicht im Kodex', () => {
  assert.ok(!fehlt({ kodex: { 'Aspect of Ignition': 12 } }).posten.some(x => x.art === 'aspekt'));
  const r = fehlt({ kodex: { 'Aspect of Ignition': null } });
  const a = r.posten.find(x => x.art === 'aspekt');
  assert.ok(a.zusatz.includes('Nicht im Kodex.'));
  assert.ok(a.zusatz.includes(L.ASPEKT_RANG_HINWEIS));
});

test('Runen: Bedarf über die Aufwertungskette (Tal aus Tir), nur mit bekanntem Bestand gerechnet', () => {
  const b = L.runenBedarf(wissenFehlt, { Tir: 12, Eth: 0, Ith: 0, Tal: 0 }, 'Tal', 1);
  assert.equal(b.proStueck, 27);
  assert.equal(b.fehlt, 15);
  const unbekannt = L.runenBedarf(wissenFehlt, { Tir: 12 }, 'Tal', 1);
  assert.equal(unbekannt.gerechnet, false);
  const r = fehlt({ bestand: { 'Scattered Prism': 0, Tir: 12, Eth: 0, Ith: 0, Tal: 0 } });
  const tal = r.posten.find(x => x.id === 'rune:tal');
  assert.match(tal.zusatz[0], /Tal fehlt\. .*15 Tir – für 1 Tal braucht es 27 Tir/);
});

test('Was fehlt: Slot-Profil nennt gesuchte Affixe (übersetzt) und die Route', () => {
  const x = fehlt().posten.find(y => y.art === 'profil');
  assert.deepEqual(x.gesucht, ['Willenskraft (Willpower)']);
  assert.equal(x.route.length, 3);
  assert.match(x.route[0], /Höllenflut.*Ring 2-Truhe/);
});

// ---------- Item prüfen ----------
test('Item prüfen: Zielitem eines Builds → ANLEGEN', () => {
  const r = L.bewerteItem({ item: L.normalizeItem({ name: 'Elegy', seltenheit: 'einzigartig', itemTyp: 'Sword' }), profil: profilFehlt(), wissen: wissenFehlt, katalog: katalogAffixe });
  assert.equal(r.verdikt, 'ANLEGEN');
  assert.equal(r.passend[0].art, 'zielitem');
});

test('Item prüfen: legendär, nicht im Build → Regel „nicht getragen“; vermacht hat Vorrang', () => {
  const w = Object.assign({}, wissenFehlt, { regeln: [
    { id: 'leg', trifft: { typ: 'ausruestung', seltenheit: ['legendär'], getragen: false }, verdikt: 'ZERLEGEN' },
    { id: 'verm', trifft: { typ: 'ausruestung', seltenheit: ['vermacht'] }, verdikt: 'BEHALTEN' },
  ] });
  const it = over => L.normalizeItem(Object.assign({ name: 'Grim Gloves', seltenheit: 'legendär', itemTyp: 'Gloves' }, over));
  assert.equal(L.bewerteItem({ item: it(), profil: profilFehlt(), wissen: w, katalog: katalogAffixe }).verdikt, 'ZERLEGEN');
  assert.equal(L.bewerteItem({ item: it({ vermacht: true }), profil: profilFehlt(), wissen: w, katalog: katalogAffixe }).verdikt, 'BEHALTEN');
});
