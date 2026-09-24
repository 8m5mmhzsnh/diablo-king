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
  eintraege: [],
  rezepte: [{ id: 'reroll-affixwerte', name_de: 'Affixwerte neu würfeln' }],
  farmziele: [{ quelle_de: 'Testboss', typ: 'Boss', belohnungen: ['Testschwert'] }],
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

const run = (it, over = {}) => L.analysiereSlot(Object.assign({
  slotKey: 'waffe', item: it, build, andererBuild: ziel,
  charakter: { qualstufe: 6 }, bestand: {}, wissen,
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
  assert.deepEqual(kat(r, 'ersetzen')[0].quellen.map(q => q.text), ['Testboss [Boss]']);
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
});

test('Leerer Slot → Zielitem und Quelle, keine Fehlermeldung', () => {
  const r = run(null);
  assert.equal(r.aktionen.length, 1);
  assert.equal(r.aktionen[0].kategorie, 'beschaffen');
  assert.match(r.aktionen[0].text, /Testschwert/);
  assert.deepEqual(r.aktionen[0].quellen.map(q => q.text), ['Testboss [Boss]']);
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
  const r = run(item({ vermacht: true, affixe: [{ text: 'Thorns', wert: '1' }] }));
  assert.equal(kat(r, 'affixe')[0].material.de, 'Vergessene Seelen');
  assert.ok(r.infos.some(i => i.text === L.TEXT.seelen));
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
  assert.match(kat(r2, 'sockel')[0].text, /Zerstreutes Prisma/);
  assert.equal(kat(r2, 'sockel')[0].gruppe, 'material');
});

test('Splitter im Build ohne Sockel → Priorität hoch', () => {
  const b = { id: 'a', name: 'A', slots: { waffe: { zielItem: 'Testschwert', sockel: 'Testsplitter' } } };
  const r = run(item({ sockel: [] }), { build: b });
  assert.equal(kat(r, 'sockel')[0].prio, 'hoch');
});

test('Schriftrolle im Bestand → keine Kein-Reset-Warnung', () => {
  const r = run(item(), { bestand: { 'Schriftrolle der Wiederherstellung': 2 } });
  assert.equal(kat(r, 'haerten')[0].warnung, '');
});

test('Engpässe: aus eintraege typ material abgeleitet, wenn engpaesse fehlt', () => {
  const w = { eintraege: [{ name_de: 'Obduzit', name_en: 'Obducite', typ: 'material' }] };
  const e = L.engpassListe(w);
  assert.equal(e.abgeleitet, true);
  assert.ok(L.istEngpass(w, L.MATERIAL.obduzit));
  assert.ok(!L.istEngpass(w, L.MATERIAL.prisma));
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
  assert.equal(r.item.name, 'ELEGY');
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
});

test('Slot-Vorschlag: zweiter Ring geht auf Ring 2', () => {
  const s = L.slotVorschlag({ itemTyp: 'Ring', inventar: { ring1: { name: 'x' } } });
  assert.equal(s.key, 'ring2');
});
