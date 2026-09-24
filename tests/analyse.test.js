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
  const r = run(item({ vermacht: true, affixe: [{ text: 'Thorns', wert: '1' }] }));
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
  assert.match(r.implizitHinweis, /selbst markieren/);
});

test('Slot-Vorschlag: zweiter Ring geht auf Ring 2', () => {
  const s = L.slotVorschlag({ itemTyp: 'Ring', inventar: { ring1: { name: 'x' } } });
  assert.equal(s.key, 'ring2');
});
