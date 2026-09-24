'use strict';

/* ================================================================
   D4 Spickzettel – reine Logik ohne DOM.
   Wird im Browser vor app.js geladen und in Node von den Tests.
   ================================================================ */

const SLOTS = [
  { key: 'kopf', de: 'Kopf', en: 'Helm' },
  { key: 'brust', de: 'Brust', en: 'Chest' },
  { key: 'handschuhe', de: 'Handschuhe', en: 'Gloves' },
  { key: 'hose', de: 'Hose', en: 'Pants' },
  { key: 'stiefel', de: 'Stiefel', en: 'Boots' },
  { key: 'amulett', de: 'Amulett', en: 'Amulet' },
  { key: 'ring1', de: 'Ring 1', en: 'Ring 1' },
  { key: 'ring2', de: 'Ring 2', en: 'Ring 2' },
  { key: 'waffe', de: 'Waffe', en: 'Weapon' },
  { key: 'fokus', de: 'Fokus', en: 'Offhand' },
];
const SLOT_BY_KEY = Object.fromEntries(SLOTS.map(s => [s.key, s]));
/** Ältere/abweichende Schlüssel → Slot-Schlüssel der Datendateien. */
const SLOT_ALIAS = { haende: 'handschuhe', beine: 'hose', fuesse: 'stiefel', ring: 'ring1', helm: 'kopf', amulet: 'amulett', offhand: 'fokus' };
const slotKey = k => (SLOT_BY_KEY[k] ? k : SLOT_ALIAS[k] || '');
/** Liest einen Slot aus einem Objekt, auch unter altem Schlüssel. */
function slotAus(obj, key) {
  if (!obj) return undefined;
  if (obj[key] !== undefined) return obj[key];
  const alt = Object.keys(SLOT_ALIAS).find(a => SLOT_ALIAS[a] === key && obj[a] !== undefined);
  return alt ? obj[alt] : undefined;
}

/* ---------------- Text-Helfer ---------------- */

/** Normalisiert für Vergleiche: klein, ohne Akzente, nur a-z0-9 + Leerzeichen. */
function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
const tokens = s => norm(s).split(' ').filter(Boolean);

/** Enthält `hay` die Wortfolge `needle` (beides normalisiert)? */
function hasWords(hay, needle) {
  if (!hay || !needle) return false;
  return (' ' + hay + ' ').includes(' ' + needle + ' ');
}

/* Wortvergleich, der Endungen verzeiht: rune/runen, gelb/gelbe/gelben, selten/seltener, ring/rings. */
const SUFFIXE = ['e', 'n', 'en', 'er', 'es', 'em', 'ern', 's', 'r'];
function stems(w) {
  const out = new Set([w]);
  for (const s of SUFFIXE) if (w.endsWith(s) && w.length - s.length >= 3) out.add(w.slice(0, -s.length));
  return out;
}
function wordEq(a, b) {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  const sb = stems(b);
  for (const x of stems(a)) if (sb.has(x)) return true;
  return false;
}
/** Gleiche Wortfolge mit toleranten Endungen: "gelbe runen" ≈ "gelbe rune". */
function phraseEq(a, b) {
  const ta = a.split(' '), tb = b.split(' ');
  return ta.length === tb.length && ta.every((t, i) => wordEq(t, tb[i]));
}
/** Kommt die Wortfolge `needle` (tolerant) in `hay` vor? */
function phraseIn(hay, needle) {
  const th = hay.split(' '), tn = needle.split(' ');
  for (let i = 0; i + tn.length <= th.length; i++) {
    if (tn.every((t, j) => wordEq(th[i + j], t))) return true;
  }
  return false;
}
/** Beschreiben zwei Texte dasselbe (Name, Affix, Sockelinhalt)? */
function textPasst(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  return x === y || hasWords(x, y) || hasWords(y, x) || phraseIn(x, y) || phraseIn(y, x);
}

/** "Verwegenheit (Temerity)" – nur einmal, wenn gleich oder eins fehlt. */
function bi(de, en) {
  de = String(de || '').trim(); en = String(en || '').trim();
  if (de && en && norm(de) !== norm(en)) return `${de} (${en})`;
  return de || en;
}
function itemText(x) {
  if (x == null) return '';
  if (typeof x !== 'object') return String(x);
  const n = bi(x.name_de || x.name, x.name_en);
  return x.menge != null && x.menge !== '' ? `${x.menge}× ${n}` : n;
}
function listText(x) {
  if (x == null || x === '') return '';
  if (Array.isArray(x)) return x.map(itemText).filter(Boolean).join(', ');
  return itemText(x);
}
const asArray = x => (x == null || x === '' ? [] : Array.isArray(x) ? x : [x]);

/** Zerlegt Freitext (z. B. Sockel "Rune A + Rune B") in Einzelteile. */
function splitParts(text) {
  return String(text || '').split(/[,+;\/&\n]| und | and /i).map(x => x.trim()).filter(Boolean);
}
const slugify = s => norm(s).replace(/ /g, '-');

/* ---------------- Wissen-Helfer (mit explizitem wissen) ---------------- */

/** seltenheitSynonyme als Liste – versteht auch die Kurzform { id: [synonyme] }. */
function seltListe(wissen) {
  const s = wissen && wissen.seltenheitSynonyme;
  if (s && !Array.isArray(s) && typeof s === 'object') {
    return Object.entries(s).map(([id, syn]) => ({ id, synonyme: asArray(syn) }));
  }
  return asArray(s);
}

function seltenheitAus(wissen, token) {
  for (const s of seltListe(wissen)) {
    for (const syn of [s.id, ...asArray(s.synonyme)]) {
      const n = norm(syn);
      if (n && !n.includes(' ') && wordEq(token, n)) return s.id;
    }
  }
  return '';
}
function seltenheitKanon(wissen, wert) {
  const n = norm(wert);
  if (!n) return '';
  for (const s of seltListe(wissen)) {
    if ([s.id, s.name_de, s.name_en, ...asArray(s.synonyme)].some(x => norm(x) === n)) return s.id;
  }
  return seltenheitAus(wissen, n) || wert;
}

function quelleText(wissen, q) {
  if (!q) return '';
  if (typeof q === 'object') return bi(q.name_de || q.name, q.name_en);
  const n = norm(q);
  const src = asArray(wissen && wissen.quellen).find(x => norm(x.id) === n || norm(x.name_de) === n || norm(x.name_en) === n);
  if (!src) return String(q);
  const t = bi(src.name_de || src.name, src.name_en) || src.id;
  return src.typ ? `${t} [${src.typ}]` : t;
}
function farmQuelle(wissen, f) {
  const q = f.quelle ? quelleText(wissen, f.quelle) : bi(f.quelle_de, f.quelle_en);
  return f.typ && q && !q.includes('[') ? `${q} [${f.typ}]` : q;
}

/** Eintrag aus wissen.eintraege zu einem Namen (DE/EN/Alias), auch wenn der Name "DE (EN)" ist. */
function eintragZu(wissen, name) {
  if (!name) return null;
  const n = norm(name);
  const list = asArray(wissen && wissen.eintraege);
  const namen = e => [e.name_de, e.name_en, e.name, ...asArray(e.aliase)].map(norm).filter(Boolean);
  return list.find(e => namen(e).includes(n)) ||
    list.find(e => namen(e).some(k => k.length >= 3 && hasWords(n, k))) || null;
}

/**
 * Woher bekomme ich ein Item? Freitext aus eintraege[].quelle, dazu jeder Farmziel-Eintrag,
 * dessen quelle_de/quelle_en in diesem Text vorkommt oder der das Item als Belohnung nennt.
 * @returns {{text: string, farm: object|null}[]}
 */
function quellenFuerName(wissen, name) {
  const out = [];
  if (!name) return out;
  const e = eintragZu(wissen, name);
  const qtext = e && e.quelle ? listText(e.quelle) : '';
  if (qtext) out.push({ text: qtext, farm: null });
  const nq = norm(qtext);
  for (const f of asArray(wissen && wissen.farmziele)) {
    const fn = [f.quelle_de, f.quelle_en, f.quelle].map(norm).filter(Boolean);
    const perQuelle = nq && fn.some(x => hasWords(nq, x));
    const perBeute = asArray(f.belohnungen).some(b => textPasst(name, itemText(b)) || (e && textPasst(itemText(b), e.name_de || e.name_en)));
    if (!perQuelle && !perBeute) continue;
    const t = farmQuelle(wissen, f);
    if (t && !out.some(o => o.farm && norm(o.text) === norm(t))) {
      out.push({ text: t, farm: { kosten: listText(f.kosten), belohnungen: listText(f.belohnungen), notiz: f.notiz || '' } });
    }
  }
  return out;
}

/* ---------------- Katalog ---------------- */

/** Einträge einer Katalog-Kategorie (katalog.kategorien.X.einträge), alte Form katalog.uniques wird auch gelesen. */
function katalogListe(katalog, kategorie) {
  if (!katalog) return [];
  const k = katalog.kategorien && katalog.kategorien[kategorie];
  if (k) return asArray(k['einträge'] || k.eintraege || k.items);
  return asArray(katalog[kategorie]);
}
/** Vergleichsform für Katalognamen: Apostrophe weg, _/- wie Leerzeichen („Aegrom's Schism“ = aegroms_schism). */
const slugNorm = s => norm(String(s || '').replace(/['’`]/g, '').replace(/[_-]+/g, ' '));

function findeUnique(katalog, name, slug) {
  const list = katalogListe(katalog, 'uniques');
  const s = slugNorm(slug || name), n = slugNorm(name);
  return list.find(u => u.slug && slugNorm(u.slug) === s) ||
    list.find(u => [u.name_de, u.name_en, u.name, u.slug].some(x => x && slugNorm(x) === n)) || null;
}

/* ---------------- Inventar ---------------- */

/**
 * Welche Aktion welches Material braucht – nur der bestandsschluessel steht im Code,
 * Anzeigename und Engpass-Markierung kommen aus wissen.eintraege.
 */
const AKTION_MATERIAL = {
  sockelHinzufuegen: 'Scattered Prism',
  vollenden: 'Obducite',
  verzaubernVermacht: 'Forgotten Souls',
  haertungZuruecksetzen: 'Scroll of Restoration',
};

function leeresItem() {
  return {
    name: '', slug: '', seltenheit: '', itemTyp: '', gegenstandsmacht: '', vermacht: false, aspekt: '',
    affixe: [], sockel: [],
    haertungen: { genutzt: 0, max: 0, affix: '' },
    vollendung: { stufe: 0, max: 25 },
    stand: '', quelle: 'manuell',
  };
}
function zahl(x, fallback) {
  const n = Number(String(x ?? '').replace(',', '.'));
  return x === '' || x == null || !Number.isFinite(n) ? fallback : n;
}
function normalizeItem(it) {
  if (!it || typeof it !== 'object') return null;
  const b = Object.assign(leeresItem(), it);
  b.vermacht = !!b.vermacht;
  b.affixe = asArray(b.affixe).map(a => (typeof a === 'string' ? { text: a } : a)).map(a => ({
    text: String(a.text || '').trim(), wert: String(a.wert ?? '').trim(),
    gross: !!a.gross, implizit: !!a.implizit, verzaubert: !!a.verzaubert, schwach: !!a.schwach,
  })).filter(a => a.text || a.wert);
  b.sockel = asArray(b.sockel).map(s => (typeof s === 'string' ? { gefuellt: !!s, inhalt: s } : s))
    .map(s => ({ gefuellt: !!(s.gefuellt || s.inhalt), inhalt: String(s.inhalt || '').trim() }));
  const h = b.haertungen || {};
  b.haertungen = { genutzt: zahl(h.genutzt, 0), max: zahl(h.max, 0), affix: String(h.affix || '') };
  const v = b.vollendung || {};
  b.vollendung = { stufe: zahl(v.stufe, 0), max: zahl(v.max, 25) };
  b.quelle = b.quelle === 'ocr' ? 'ocr' : 'manuell';
  if (!b.slug && b.name) b.slug = slugify(b.name);
  return b;
}
function normalizeInventar(inv) {
  const out = {};
  for (const s of SLOTS) out[s.key] = normalizeItem(slotAus(inv, s.key));
  return out;
}

/** Bestand aus profil.bestand[schluessel] – null, wenn der Schlüssel fehlt oder null ist (= unbekannt). */
function bestandVon(bestand, schluessel) {
  if (!bestand || typeof bestand !== 'object' || !schluessel) return null;
  if (!Object.prototype.hasOwnProperty.call(bestand, schluessel)) return null;
  return zahl(bestand[schluessel], null);
}

/** Materialeinträge = Einträge mit bestandsschluessel. */
const materialEintraege = wissen => asArray(wissen && wissen.eintraege).filter(e => e.bestandsschluessel);

/** Material für eine Aktion: Name aus den Daten, Menge aus dem Bestand. */
function material(wissen, bestand, schluessel, menge) {
  const e = materialEintraege(wissen).find(x => x.bestandsschluessel === schluessel);
  const hat = bestandVon(bestand, schluessel);
  const braucht = menge == null ? 1 : menge;
  return {
    schluessel, menge: menge == null ? null : menge,
    de: e ? (e.name_de || e.name || schluessel) : schluessel,
    en: e ? (e.name_en || '') : '',
    engpass: !!(e && e.engpass),
    imWissen: !!e,
    bestand: hat,
    blockiert: hat != null && hat < braucht,
  };
}

/** Engpässe: wissen.engpaesse, sonst Einträge mit engpass:true, sonst alle Einträge mit typ "material". */
function engpassListe(wissen) {
  const e = asArray(wissen && wissen.engpaesse).map(itemText).filter(Boolean);
  if (e.length) return { liste: e, herkunft: 'engpaesse' };
  const eng = materialEintraege(wissen).filter(x => x.engpass).map(x => bi(x.name_de || x.name, x.name_en));
  if (eng.length) return { liste: eng, herkunft: 'engpass' };
  const m = asArray(wissen && wissen.eintraege).filter(x => norm(x.typ) === 'material')
    .map(x => bi(x.name_de || x.name, x.name_en)).filter(Boolean);
  return { liste: m, herkunft: 'material' };
}
function istEngpass(wissen, mat) {
  if (!mat) return false;
  if (mat.engpass) return true;
  return engpassListe(wissen).liste.some(x => textPasst(x, mat.de) || (mat.en && textPasst(x, mat.en)));
}

const STANDARD_REIHENFOLGE = ['affixe', 'sockel', 'aspekt', 'haerten', 'vollenden', 'transfigurieren'];
const KATEGORIE_LABEL = {
  ersetzen: 'Ersetzen', beschaffen: 'Beschaffen', affixe: 'Affixe (Würfel/Verzaubern)', sockel: 'Sockel',
  aspekt: 'Aspekt', haerten: 'Härten', vollenden: 'Vollenden', transfigurieren: 'Transfigurieren',
};
function reihenfolgeNotiz(wissen) {
  const list = asArray(wissen && wissen.notizen);
  const i = list.findIndex(n => n.id === 'item-reihenfolge' ||
    textPasst(n.frage, 'In welcher Reihenfolge bearbeite ich ein Item'));
  const n = i >= 0 ? list[i] : null;
  const r = n && asArray(n.reihenfolge).map(norm).filter(Boolean);
  return { index: i, notiz: n, reihenfolge: r && r.length ? r : STANDARD_REIHENFOLGE };
}

function istSplitter(wissen, text) {
  if (/(splitter|shard)/i.test(text)) return true;
  return asArray(wissen && wissen.eintraege).some(e => norm(e.typ) === 'splitter' &&
    [e.name_de, e.name_en, ...asArray(e.aliase)].some(n => n && textPasst(text, n)));
}

function istUnique(wissen, seltenheit) {
  const id = seltenheitKanon(wissen, seltenheit);
  return ['einzigartig', 'mythisch'].includes(norm(id)) || /unique|mythic|einzigartig|mythisch/i.test(seltenheit || '');
}

/* ================================================================
   Affix-Vergleich über Sprachen hinweg
   ================================================================ */

/** Primärattribute – „Primärattribut“ im Build passt auf jedes davon (oder auf charakter.primaerattribut). */
const PRIMAERATTRIBUTE = ['Strength', 'Dexterity', 'Intelligence', 'Willpower'];

/**
 * Englische Entsprechungen eines Build-Affixes. Quelle: data/uebersetzungen.json (affixe) und optional
 * wissen.affixUebersetzungen. Klammerzusätze wie „(Worldly Endurance)“ werden ignoriert.
 */
function affixVarianten(ziel, uebersetzung, charakter) {
  const basis = String(ziel || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  const out = [basis];
  const tab = uebersetzung || {};
  const key = Object.keys(tab).find(k => norm(k) === norm(basis));
  if (key) out.push(...asArray(tab[key]));
  if (/^prim(ä|ae|a)rattribut$|^primary attribute$|^hauptattribut$/i.test(basis)) {
    const eigen = charakter && charakter.primaerattribut;
    out.push(...(eigen ? affixVarianten(eigen, tab, null) : PRIMAERATTRIBUTE));
  }
  return [...new Set(out.filter(Boolean))];
}
/** Gleicher Affix? Streng: normalisiert gleich (OCR-tolerant), nicht bloß enthalten. */
function affixGleich(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  return x === y || ocrForm(a) === ocrForm(b) || phraseEq(x, y);
}
function affixPasst(itemText, ziel, uebersetzung, charakter) {
  return affixVarianten(ziel, uebersetzung, charakter).some(v => affixGleich(itemText, v));
}
/**
 * Lässt sich ein Build-Affix mit englischen Tooltip-Texten vergleichen? Nur dann darf die App
 * „fehlt“ behaupten. Vergleichbar = es gibt eine Übersetzung, oder der Text ist selbst ein Katalog-Affix.
 */
function affixVergleichbar(ziel, uebersetzung, charakter, katalogAffixe) {
  const v = affixVarianten(ziel, uebersetzung, charakter);
  if (v.length > 1) return true;
  return asArray(katalogAffixe).some(k => affixGleich(k, v[0]));
}
function affixAnzeige(ziel, uebersetzung, charakter) {
  const v = affixVarianten(ziel, uebersetzung, charakter);
  const en = v.slice(1);
  return en.length === 1 ? bi(v[0], en[0]) : en.length > 1 ? `${v[0]} (${en.join(' / ')})` : v[0];
}

/* ================================================================
   Slot-Analyse
   ================================================================ */

const TEXT = {
  einAffix: 'Pro Item ist nur EIN Affix verzauberbar. Sobald du einen anfasst, sind die anderen fix. Wähle die schlechteste Zeile.',
  grossUnsicher: 'Unsicher: Ob ein umgerollter großer Affix seinen Status behält, ist unklar – Vorschau im Spiel prüfen.',
  seelen: name => `Kostet seit Patch 3.2.1 nur noch 10 statt 25 ${name}.`,
  keinReset: 'Kein Reset möglich – erster brauchbarer Wurf zählt.',
  vollendenReset: 'Vollendung ist jederzeit zurücksetzbar, das Item wird nicht zerstört.',
  nichtHaerten: 'Noch nicht härten, das Teil wird ersetzt.',
  qual4: 'Erst ab Qual 4 sinnvoll.',
  obduzitSparen: 'Wird ersetzt, Obduzit sparen.',
};

/**
 * Vergleicht ein Inventar-Item mit dem Slot eines Builds.
 * Arbeitet nur auf bestätigten Werten aus profil.inventar.
 * @returns {{aktionen: object[], infos: object[], reihenfolge: object[], keeper: boolean, passt: boolean|null, ziel: object}}
 */
function analysiereSlot({ slotKey, item, build, andererBuild, charakter, bestand, wissen, uebersetzung, katalog }) {
  const tab = Object.assign({}, (uebersetzung && uebersetzung.affixe) || uebersetzung || {}, (wissen && wissen.affixUebersetzungen) || {});
  const katAff = katalogListe(katalog, 'affixe').map(a => a.name_en);
  const passt = (text, ziel) => affixPasst(text, ziel, tab, charakter);
  const out = { aktionen: [], infos: [], reihenfolge: [], keeper: false, passt: null, ziel: {} };
  const info = (kategorie, text, art = 'info') => out.infos.push({ kategorie, text, art });
  const aktion = a => out.aktionen.push(Object.assign({ prio: 'mittel', gruppe: 'gold', grund: '' }, a));

  if (!build) { info('allgemein', 'Kein Build gesetzt – nichts zum Vergleichen.'); return out; }
  const slot = slotAus(build.slots, slotKey) || {};
  const mat = (key, menge) => material(wissen, bestand, AKTION_MATERIAL[key], menge);
  const zielItem = String(slot.zielItem || '').trim();
  const zielAspekt = String(slot.zielAspekt || '').trim();
  const zielAffixe = asArray(slot.affixe).map(String).filter(Boolean);
  const andereAffixe = asArray((slotAus(andererBuild && andererBuild.slots, slotKey) || {}).affixe).map(String);
  out.ziel = { zielItem, zielAspekt, sockel: slot.sockel || '', haertung: slot.haertung || '', affixe: zielAffixe };

  /* ---------- leerer Slot ---------- */
  if (!item) {
    const was = zielItem || (zielAspekt ? `ein Item mit „${zielAspekt}“` : '');
    if (!was) { info('allgemein', 'Slot ist leer, und der Build hat hier kein Ziel.'); return out; }
    aktion({
      kategorie: 'beschaffen', gruppe: 'beschaffen', prio: 'hoch',
      text: `${was} besorgen`, grund: 'Slot ist im Inventar noch leer.',
      quellen: quellenFuerName(wissen, zielItem || zielAspekt),
    });
    return out;
  }

  const istZiel = !!zielItem && (textPasst(item.name, zielItem) || (item.slug && textPasst(item.slug.replace(/-/g, ' '), zielItem)));
  const wirdErsetzt = !!zielItem && !istZiel;
  const keeper = istZiel || !!item.vermacht;
  const unique = istUnique(wissen, item.seltenheit);
  out.keeper = keeper;
  out.passt = zielItem ? istZiel : null;

  /* ---------- Item passt nicht ---------- */
  if (wirdErsetzt) {
    aktion({
      kategorie: 'ersetzen', gruppe: 'beschaffen', prio: 'hoch',
      text: `Ersetzen durch ${zielItem}`,
      grund: `Der Build sieht hier ${zielItem} vor, angelegt ist ${item.name || 'ein anderes Item'}.`,
      quellen: quellenFuerName(wissen, zielItem),
    });
  }
  if (zielAspekt && !unique && !wirdErsetzt) {
    if (!(item.aspekt && textPasst(item.aspekt, zielAspekt))) {
      aktion({
        kategorie: 'aspekt', gruppe: 'gold', prio: 'hoch',
        text: `Aspekt „${zielAspekt}“ überprägen – kostet nur Gold`,
        grund: item.aspekt ? `Geprägt ist „${item.aspekt}“.` : 'Der geprägte Aspekt ist nicht erfasst (Feld „Aspekt“).',
      });
    }
  }

  /* ---------- Sockel ---------- */
  const soll = splitParts(slot.sockel);
  const ist = asArray(item.sockel).map((s, i) => ({ ...s, i, frei: true }));
  const offen = [];
  for (const req of soll) {
    const hit = ist.find(s => s.frei && s.gefuellt && s.inhalt && textPasst(s.inhalt, req));
    if (hit) hit.frei = false; else offen.push(req);
  }
  for (const req of offen) {
    const splitter = istSplitter(wissen, req);
    const leer = ist.find(s => s.frei && !(s.gefuellt && s.inhalt));
    const falsch = !leer && ist.find(s => s.frei);
    if (leer) {
      leer.frei = false;
      aktion({ kategorie: 'sockel', gruppe: 'gold', prio: splitter ? 'hoch' : 'mittel', text: `„${req}“ einsetzen`, grund: 'Sockel ist leer.' });
    } else if (falsch) {
      falsch.frei = false;
      aktion({
        kategorie: 'sockel', gruppe: 'gold', prio: 'mittel',
        // Die Zusage gilt nur für Edelsteine – bei Runen ist sie nicht belegt
        text: RE_GEM.test(falsch.inhalt) ? `„${falsch.inhalt}“ ersetzen durch „${req}“. Der alte Edelstein ist nicht verloren.` : `„${falsch.inhalt}“ ersetzen durch „${req}“.`,
        grund: `Build sieht „${req}“ vor.`,
      });
    } else if (wirdErsetzt) {
      info('sockel', `Kein Sockel für „${req}“ – aber nicht hinzufügen, das Teil wird ersetzt.`);
    } else {
      const m = mat('sockelHinzufuegen', 1);
      aktion({
        kategorie: 'sockel', gruppe: 'material', prio: splitter ? 'hoch' : 'mittel',
        text: `Sockel hinzufügen beim Juwelenschmied, kostet 1 ${m.de}`,
        grund: `Build sieht „${req}“ vor${splitter ? ' (Splitter)' : ''}, das Item hat keinen freien Sockel.`,
        material: m,
      });
    }
  }

  /* ---------- Verzaubern ---------- */
  info('affixe', TEXT.einAffix, 'warn');
  const affixe = asArray(item.affixe);
  const verzaubert = affixe.find(a => a.verzaubert);
  // Nur vergleichbare Zielaffixe dürfen als „fehlt“ gelten – sonst entstehen Fehlalarme (Willenskraft ≠ Willpower)
  const unvergleichbar = zielAffixe.filter(z => !affixVergleichbar(z, tab, charakter, katAff) && !affixe.some(a => passt(a.text, z)));
  const fehlend = zielAffixe.filter(z => !unvergleichbar.includes(z) && !affixe.some(a => passt(a.text, z)));
  if (unvergleichbar.length) {
    info('affixe', `Nicht vergleichbar (keine Übersetzung): ${unvergleichbar.join(', ')} – in data/uebersetzungen.json ergänzen. Diese Zeilen gelten weder als vorhanden noch als fehlend.`, 'unsicher');
  }
  if (wirdErsetzt) {
    info('affixe', 'Nicht verzaubern – das Teil wird ersetzt.');
  } else if (verzaubert) {
    info('affixe', `Dieses Item ist bereits an „${verzaubert.text}“ gebunden, andere Affixe sind nicht mehr umrollbar.`);
  } else if (!zielAffixe.length) {
    info('affixe', 'Keine Affix-Prioritäten im Build hinterlegt – keine Verzauber-Empfehlung möglich.');
  } else if (fehlend.length && unique && !affixe.some(a => a.implizit)) {
    info('affixe', `Es fehlt vermutlich „${affixAnzeige(fehlend[0], tab, charakter)}“. Bei Uniques sind die oberen Zeilen fest (implizit) – bitte im Item markieren. Bis dahin keine Umroll-Empfehlung, sonst könnte die App eine feste Zeile vorschlagen.`, 'warn');
  } else if (fehlend.length && unvergleichbar.length) {
    info('affixe', `Es fehlt vermutlich „${affixAnzeige(fehlend[0], tab, charakter)}“. Keine Umroll-Empfehlung, solange „${unvergleichbar.join('“, „')}“ nicht vergleichbar ist – sonst könnte die App eine gute Zeile zum Umrollen vorschlagen.`, 'warn');
  } else if (fehlend.length) {
    const kandidaten = affixe
      .filter(a => !a.implizit && !zielAffixe.some(z => passt(a.text, z)))
      .map(a => ({ a, anderer: andereAffixe.some(z => passt(a.text, z)) }))
      .sort((x, y) => Number(x.anderer) - Number(y.anderer));   // in keinem Build gefragt = am wenigsten nützlich
    if (kandidaten.length) {
      const k = kandidaten[0], ziel = fehlend[0], rang = zielAffixe.indexOf(ziel);
      aktion({
        kategorie: 'affixe', gruppe: item.vermacht ? 'material' : 'gold', prio: rang < 2 ? 'hoch' : 'mittel',
        text: `Zeile „${k.a.text}“ umrollen auf „${affixAnzeige(ziel, tab, charakter)}“`,
        grund: `„${affixAnzeige(ziel, tab, charakter)}“ fehlt (Priorität ${rang + 1} im Build). „${k.a.text}“ ist ${k.anderer ? 'nur im anderen Build gefragt' : 'in keinem Build gefragt'}.`,
        kandidaten: kandidaten.map(x => `${x.a.text}${x.anderer ? ' (anderer Build)' : ''}`),
        material: item.vermacht ? mat('verzaubernVermacht', 10) : null,
      });
    } else {
      info('affixe', `Es fehlt „${affixAnzeige(fehlend[0], tab, charakter)}“, aber alle umrollbaren Zeilen sind schon Zielaffixe.`);
    }
  }
  if (!wirdErsetzt && item.vermacht && !verzaubert) info('affixe', TEXT.seelen(mat('verzaubernVermacht', 10).de));
  info('affixe', TEXT.grossUnsicher, 'unsicher');
  if (!wirdErsetzt && zielAffixe.length && !fehlend.length && !unvergleichbar.length && affixe.some(a => a.schwach)) {
    const rezept = asArray(wissen && wissen.rezepte).find(r => r.id === 'reroll-affixwerte');
    aktion({
      kategorie: 'affixe', gruppe: 'material', prio: 'niedrig',
      text: 'Rezept „reroll-affixwerte“ im Würfel nutzen',
      grund: 'Alle Zielaffixe sind da, nur die Werte sind schwach. Das Rezept erhält große Affixe, Verzauberungen, Härtungen und Transfigurationen.',
      rezept: rezept || { id: 'reroll-affixwerte', fehlt: true },
    });
  }

  /* ---------- Härten ---------- */
  const h = item.haertungen || { genutzt: 0, max: 0 };
  const rolle = mat('haertungZuruecksetzen', 1);
  const rollen = rolle.bestand;
  if (!(h.max > 0)) {
    info('haerten', 'Härtungen nicht erfasst (max = 0).');
  } else if (h.genutzt < h.max) {
    if (!keeper) {
      info('haerten', TEXT.nichtHaerten);
    } else {
      aktion({
        kategorie: 'haerten', gruppe: 'material', prio: 'mittel',
        text: slot.haertung ? `Härten auf „${slot.haertung}“` : 'Härten (Härtungs-Affix im Build nicht hinterlegt)',
        grund: `${h.genutzt}/${h.max} Härtungen genutzt.`,
        warnung: rollen ? '' : TEXT.keinReset,
      });
    }
  } else if (h.affix && slot.haertung && !passt(h.affix, slot.haertung)) {
    if (keeper && rollen > 0) {
      aktion({
        kategorie: 'haerten', gruppe: 'material', prio: 'niedrig',
        text: `Härtung „${h.affix}“ zurücksetzen und auf „${slot.haertung}“ härten`,
        grund: 'Alle Härtungen sind verbraucht, der Affix passt nicht zum Build.',
        material: rolle,
      });
    } else {
      info('haerten', `Härtung „${h.affix}“ passt nicht zu „${slot.haertung}“ – ${keeper ? TEXT.keinReset : TEXT.nichtHaerten}`);
    }
  }

  /* ---------- Vollenden ---------- */
  const v = item.vollendung || { stufe: 0, max: 25 };
  const qual = zahl(charakter && charakter.qualstufe, null);
  if (v.stufe < v.max) {
    if (!keeper) info('vollenden', TEXT.obduzitSparen);
    else if (qual == null || qual < 4) {
      info('vollenden', qual == null ? `Qualstufe im Profil fehlt – ${TEXT.qual4}` : `${TEXT.qual4} (aktuell Qual ${qual}).`);
      info('vollenden', TEXT.vollendenReset);
    } else {
      aktion({
        kategorie: 'vollenden', gruppe: 'material', prio: 'niedrig',
        text: `Vollenden (${v.stufe}/${v.max})`, grund: 'Keeper, Qual 4 erreicht.',
        material: mat('vollenden', null),
        zusatz: TEXT.vollendenReset,
      });
    }
  }

  /* ---------- Reihenfolge ---------- */
  const rf = reihenfolgeNotiz(wissen).reihenfolge;
  // Blockierte Aktionen (Bestand reicht nicht) nach unten, nicht verstecken
  out.aktionen.forEach(a => { a.blockiert = !!(a.material && a.material.blockiert); });
  out.aktionen.sort((a, b) => Number(a.blockiert) - Number(b.blockiert));
  const bearbeiten = out.aktionen.filter(a => rf.includes(a.kategorie));
  if (bearbeiten.length > 1) {
    out.reihenfolge = [...bearbeiten].sort((a, b) => rf.indexOf(a.kategorie) - rf.indexOf(b.kategorie));
  }
  return out;
}

const PRIO_RANG = { hoch: 0, mittel: 1, niedrig: 2 };

/** Farbnamen aus wissen.verdikte[].farbe → CSS. Hex/rgb werden durchgereicht. */
const FARBNAMEN = {
  gruen: '#2e9b50', grün: '#2e9b50', violett: '#8a4fd6', lila: '#8a4fd6', blau: '#2f7fcf', tuerkis: '#1b9aa0',
  türkis: '#1b9aa0', grau: '#6f6a64', gold: '#c9a227', gelb: '#d8b43a', orange: '#d0702a', rot: '#b8432f', braun: '#8b5a2b',
};
function farbeCss(f) {
  const x = String(f || '').trim().toLowerCase();
  if (/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i.test(x)) return x;
  return FARBNAMEN[x] || '';
}

/**
 * Prüft Querverweise zwischen wissen.json und profil.json.
 * @returns {{fehlendeRezepte: object[], fehlendeVerdikte: object[], bestandFehlt: string[], bestandNull: string[], bestandOhneMaterial: string[], slotsUnbekannt: string[], buildsFehlen: string[]}}
 */
function pruefeIntegritaet(wissen, profil) {
  const rezeptIds = new Set(asArray(wissen && wissen.rezepte).map(r => r.id));
  const verdikte = new Set(asArray(wissen && wissen.verdikte).map(v => norm(v.id)));
  const out = { fehlendeRezepte: [], fehlendeVerdikte: [], bestandFehlt: [], bestandNull: [], bestandOhneMaterial: [], slotsUnbekannt: [], buildsFehlen: [] };
  const pruefe = (wo, x) => {
    for (const id of asArray(x.rezepte)) if (!rezeptIds.has(id)) out.fehlendeRezepte.push({ wo, id });
    if (x.verdikt && !verdikte.has(norm(x.verdikt))) out.fehlendeVerdikte.push({ wo, id: x.verdikt });
  };
  asArray(wissen && wissen.eintraege).forEach(e => pruefe(`Eintrag ${e.name_de || e.name_en}`, e));
  asArray(wissen && wissen.regeln).forEach(r => pruefe(`Regel ${r.id}`, r));
  asArray(profil && profil.abweichungen).forEach((a, i) => { if (a.verdikt) pruefe(`Abweichung ${i + 1}`, { verdikt: a.verdikt }); });
  const bestand = (profil && profil.bestand) || {};
  const schluessel = materialEintraege(wissen).map(e => e.bestandsschluessel);
  for (const k of schluessel) {
    if (!Object.prototype.hasOwnProperty.call(bestand, k)) out.bestandFehlt.push(k);
    else if (bestand[k] == null) out.bestandNull.push(k);
  }
  for (const k of Object.keys(bestand)) if (!schluessel.includes(k) && !istRune(wissen, k)) out.bestandOhneMaterial.push(k);
  for (const b of asArray(profil && profil.builds)) {
    for (const k of Object.keys(b.slots || {})) if (!slotKey(k)) out.slotsUnbekannt.push(`${b.id}.${k}`);
  }
  for (const [feld, id] of [['aktiverBuild', profil && profil.aktiverBuild], ['zielBuild', profil && profil.zielBuild]]) {
    if (id && !asArray(profil.builds).some(b => b.id === id)) out.buildsFehlen.push(`${feld} = ${id}`);
  }
  return out;
}

/* ================================================================
   Tooltip-Erkennung (OCR-Zeilen → Entwurf)
   ================================================================ */

const TYP_ZU_SLOT = [
  ['kopf', /\b(helm|helmet|kopfschutz|helme?)\b/i],
  ['brust', /\b(chest armou?r|chest|brustschutz|brustrüstung|rüstung)\b/i],
  ['handschuhe', /\b(gloves|handschuhe)\b/i],
  ['hose', /\b(pants|legs|hose|beinschutz)\b/i],
  ['stiefel', /\b(boots|stiefel)\b/i],
  ['amulett', /\b(amulet|amulett)\b/i],
  ['ring1', /\b(ring)\b/i],
  ['fokus', /\b(focus|shield|totem|off-?hand|fokus|schild)\b/i],
  ['waffe', /\b(sword|axe|mace|bow|crossbow|staff|wand|dagger|scythe|polearm|glaive|flail|quarterstaff|weapon|schwert|axt|streitkolben|bogen|armbrust|stab|zauberstab|dolch|sense|stangenwaffe|gleve|flegel|kampfstab|waffe)\b/i],
];

function slotVorschlag({ itemTyp, name, katalog, inventar, wissen }) {
  const u = name ? findeUnique(katalog, name) : null;
  const e = name ? eintragZu(wissen, name) : null;
  let key = e && slotKey(e.slot) ? slotKey(e.slot) : '';
  let warum = key ? 'aus wissen.json (Eintrag)' : '';
  if (!key && u && slotKey(u.slot)) { key = slotKey(u.slot); warum = 'aus katalog.json'; }
  if (!key) {
    const t = [itemTyp, u && u.itemTyp].filter(Boolean).join(' ');
    for (const [k, re] of TYP_ZU_SLOT) if (re.test(t)) { key = k; warum = `aus Item-Typ „${itemTyp || u.itemTyp}“`; break; }
  }
  if (key === 'ring1' && inventar && inventar.ring1 && !(inventar.ring2)) key = 'ring2';
  return { key, warum };
}

/* Fußzeilen und Spiel-UI unter dem Tooltip: werden übersprungen (danach kommt nur noch „Tempers: x/y“). */
const RE_FUSS = /(requires level|benötigt stufe|sell value|verkaufswert|durability|haltbarkeit|account bound|accountgebunden|right mouse|rechtsklick|unique equipped|only one|kann nur|properties lost|eigenschaften gehen|lord of hatred|vessel of hatred|seasonal item|saisonal|scroll down|unequip|ablegen|mark as favorite|favorit|(^|\s)link$|verknüpfen|not equipped)/i;
const RE_KOPF = /^(equipped|ausgerüstet|angelegt|currently equipped)$/i;
const RE_BASIS = /^[\d.,]+\s+(armou?r|rüstung|damage per second|schaden pro sekunde|block chance)\b|damage per hit|schaden pro treffer|attacks? per second|angriffe pro sekunde|^\s*\[\s*[\d.,]+\s*-\s*[\d.,]+\s*\]\s*damage/i;
const RE_POWER = /(\d{2,4})\s*(item power|gegenstandsmacht)|(item power|gegenstandsmacht)\D{0,4}(\d{2,4})/i;
const RE_HAERT = /(temper\w*|härtung\w*|gehärtet)\D{0,12}(\d+)\s*\/\s*(\d+)/i;
const RE_VOLL = /(masterwork\w*|vollend\w*)\D{0,12}(\d+)\s*\/\s*(\d+)/i;
const RE_LEER = /(empty socket|leerer sockel|freier sockel)/i;
/* Edelstein im Sockel: Zeile beginnt mit (Qualität +) Edelsteinname – nicht irgendwo im Effekttext. */
const RE_GEM = /^(?:royal|grand|flawless|chipped|crude|königlich\w*|makellos\w*|grob\w*)?\s*(ruby|sapphire|emerald|topaz|amethyst|diamond|skull|rubin|saphir|smaragd|topas|diamant|schädel)\b/i;
const RE_ANCESTRAL = /\b(ancestral|vermacht|vermächtnis\w*)\b/i;
/* Beginn eines Effekt-Absatzes (Aspekt, Unique-Kraft, Runenwort) – gehört nicht zu den Affixen. */
const RE_EFFEKT = /^(imprinted|geprägt|aufgeprägt|unique power|einzigartige kraft)\s*:|\(\s*\d+\s*\/\s*\d+\s*\)/i;
/* Runen im Sockel: „CirOhm (300/600) - Lethargic Call to Arms“ → Sockel mit Cir und Ohm. */
const RE_RUNEN_SOCKEL = /^([A-Z][a-z]{1,5}(?:[A-Z][a-z]{1,5})+)\s*\(\s*\d+\s*\/\s*\d+\s*\)/;
/* Aufzählungszeichen, die Tesseract aus ◆ macht: o ¢ © e … – nur vor einem Wert. */
const RE_OCR_BULLET = /^([^\p{L}\p{N}+\-\[]{1,3}|[oOeEcCaQ0])\s+(?=[+\-x×]?\s*\d)/u;
/* Stern (✹/★) als Aufzählungszeichen = großer Affix. */
const RE_STERN = /^[*★✦✧☆✹]\s*/;
/* Ein Affix beginnt mit einem Wert: +85, 15.0%, x14% (Multiplikator) – oder ist ein Glückstreffer. */
const RE_AFFIX_START = /^([+\-x×]?\s*\d[\d.,]*\s*%?)\s+(.+)$/i;
/* Zusätzliche englische Item-Typ-Wörter (Tooltip-Schreibweise), neben den Katalog-Typen. */
const ITEMTYP_EXTRA = ['Pants', 'Chest Armor', 'Two-Handed Sword', 'Two-Handed Axe', 'Two-Handed Mace', 'Two-Handed Scythe', 'Totem', 'Offhand'];

/** Levenshtein-Distanz (für Katalog-Abgleich von OCR-Text). */
function distanz(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, k) => k);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let k = 1; k <= n; k++) cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** Typische OCR-Verwechslungen angleichen: rn↔m, vv↔w, cl↔d, 0↔o, 1/l↔i, Apostrophe weg. */
const ocrForm = s => norm(String(s || '').replace(/['’`]/g, '')).replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/cl/g, 'd').replace(/0/g, 'o').replace(/[1l]/g, 'i');
const kompakt = s => tokens(String(s || '').replace(/['’`]/g, ''));

/**
 * Sucht den passenden Namen in einer Liste: exakt (normalisiert) oder mit kleinem Tippfehler.
 * @returns {{name: string, exakt: boolean}|null}
 */
function namenAbgleich(text, namen, maxAnteil = 0.2) {
  const n = ocrForm(text);
  if (!n) return null;
  let best = null, bestD = Infinity;
  for (const x of namen) {
    const k = ocrForm(x);
    if (!k) continue;
    if (k === n) return { name: x, exakt: norm(x) === norm(text) };
    if (Math.abs(k.length - n.length) > Math.max(2, n.length * maxAnteil)) continue;
    const d = distanz(n, k);
    if (d < bestD) { bestD = d; best = x; }
  }
  return best && bestD <= Math.max(1, Math.floor(n.length * maxAnteil)) ? { name: best, exakt: false } : null;
}

/** OCR-tolerantes Wort-Gleich: „edgeimasters“ ≈ „edgemasters“, „vaimibraces“ ≈ „vambraces“. */
function wortOcrGleich(x, y) {
  if (x === y) return true;
  const a = ocrForm(x), b = ocrForm(y);
  if (a === b) return true;
  if (b.length >= 5 && a.length > b.length && a.length - b.length <= 2 && a.endsWith(b)) return true;
  return b.length >= 5 && distanz(a, b) <= (b.length >= 9 ? 2 : 1);
}

/** Findet einen bekannten Namen als zusammenhängende Wortfolge in verrauschtem OCR-Text („iy STEALTH FE“ → Stealth). */
function namenInText(text, namen) {
  const t = kompakt(text);
  let best = null;
  for (const n of namen) {
    const k = kompakt(n);
    if (!k.length || k.length > t.length) continue;
    if (k.length === 1 && k[0].length < 4) continue;
    for (let i = 0; i + k.length <= t.length; i++) {
      if (k.every((w, j) => wortOcrGleich(t[i + j], w))) {
        if (!best || k.join(' ').length > kompakt(best).join(' ').length) best = n;
        break;
      }
    }
  }
  return best;
}

/** Bereinigt eine OCR-Zeile: Glyphen, Bereichsangaben [x - y], [+], [x] und Streuzeichen raus. */
function ocrZeile(t) {
  return String(t || '')
    .replace(/\+?\s*\[[^\]]*\]\s*%?/g, ' ')           // +[83 - 99], [1,016 - 1,225], [30 - 50]%, [x]
    .replace(/\+?\s*\[[^\]]*$/g, ' ')                  // umgebrochen: „[14 -“ am Zeilenende
    .replace(/^[^\[]*\]\s*%?/g, ' ')                   // umgebrochen: „24]%“ am Zeilenanfang
    .replace(/[\[\]{}|\\¦]/g, ' ')
    .replace(/[©®™¢¥£€§¤°º¹²³@#^~`´¨«»<>$]/g, ' ')    // typische Fehlglyphen (Icons, Gold-Symbol)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Aspekt aus dem Namen eines legendären Items: „Sadistic Doom Casque“ → Sadistic, „… of Ignition“ → Aspect of Ignition. */
function aspektAusName(name, { wissen, katalog } = {}) {
  const nt = kompakt(name);
  if (!nt.length) return null;
  const katalogAspekte = katalogListe(katalog, 'aspekte').map(a => a.name_en).filter(Boolean);
  const wissenAspekte = asArray(wissen && wissen.eintraege).filter(e => norm(e.typ) === 'aspekt');
  const kandidaten = [...new Set([...katalogAspekte, ...wissenAspekte.map(e => String(e.name_en || '').replace(/\s*aspect\s*|\s*aspekt\s*/ig, ' ').replace(/^of /i, '').trim())])]
    .filter(Boolean).map(a => ({ a, t: kompakt(a) })).filter(x => x.t.length).sort((x, y) => y.t.length - x.t.length);
  for (const { a, t } of kandidaten) {
    if (t.length <= nt.length && t.every((x, k) => wortOcrGleich(nt[k], x))) return aspektAnzeige(a, wissenAspekte);
    const of = nt.indexOf('of');
    if (of >= 0 && t.length === nt.length - of - 1 && t.every((x, k) => wortOcrGleich(nt[of + 1 + k], x))) return aspektAnzeige(a, wissenAspekte);
  }
  return null;
}
function aspektAnzeige(kern, wissenAspekte) {
  const k = kompakt(kern).join(' ');
  const e = wissenAspekte.find(x => hasWords(kompakt(x.name_en).join(' '), k));
  return e ? bi(e.name_de, e.name_en) : `${kern} Aspect`;
}

/** Item-Typ aus der Typzeile, nur bekannte Wörter („Chest Armor ON“ → „Chest Armor“). */
function itemTypAus(text, katalog) {
  const vokabular = [...katalogListe(katalog, 'itemTypen').map(t => String(t.name_en || t.slug || '').replace(/2H$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')), ...ITEMTYP_EXTRA]
    .filter(Boolean).sort((a, b) => b.length - a.length);
  const t = norm(text);
  const hit = vokabular.find(v => hasWords(t, norm(v)));
  if (hit) return hit;
  // Fallback: nur Wörter aus Buchstaben mit mindestens 3 Zeichen
  return String(text).split(/\s+/).filter(w => /^[\p{L}-]{3,}$/u.test(w)).join(' ');
}

/**
 * Macht aus OCR-Zeilen einen Entwurf. Das Ergebnis ist NIE direkt Inventar –
 * es wird im Formular angezeigt und erst nach Bestätigung übernommen.
 * @param {{text: string, confidence?: number, symbol?: 'verzaubert'|null}[]} lines
 */
function parseTooltip(lines, { wissen, katalog, inventar } = {}) {
  const roh = asArray(lines)
    .map(l => (typeof l === 'string' ? { text: l, confidence: null } : l))
    .map(l => ({ roh: String(l.text || '').replace(/\s+/g, ' ').trim(), confidence: l.confidence == null ? null : Math.round(l.confidence), symbol: l.symbol || null }));
  // Zeilen ohne echten Text (Rahmen, Icons, Bildreste) verwerfen. Ein einzelner Stern gehört zur nächsten Zeile.
  const clean = [];
  let sternDavor = false;
  for (const l of roh) {
    if (/^[*★✦✧☆✹]+$/.test(l.roh)) { sternDavor = true; continue; }
    const text = ocrZeile(l.roh);
    const buchst = (text.match(/[\p{L}\p{N}]/gu) || []).length;
    if (buchst < 2 || RE_KOPF.test(text)) continue;
    if (l.confidence != null && l.confidence < 45 && buchst / text.length < 0.7) continue;
    clean.push({ ...l, text, stern: sternDavor || RE_STERN.test(l.roh) });
    sternDavor = false;
  }
  const item = leeresItem();
  item.quelle = 'ocr';
  const affixe = [];
  const hinweise = [];
  const selt = seltListe(wissen);
  const seltenheitIn = text => {
    for (const t of tokens(text)) {
      const id = seltenheitAus(wissen, t);
      if (id && norm(id) !== 'vermacht') return { id, token: t };
    }
    return null;
  };

  // Typzeile: enthält Seltenheit und/oder Item-Typ
  let typIdx = clean.findIndex(l => seltenheitIn(l.text) && TYP_ZU_SLOT.some(([, re]) => re.test(l.text)));
  if (typIdx < 0) typIdx = clean.findIndex(l => seltenheitIn(l.text));
  if (typIdx >= 0) {
    const tl = clean[typIdx].text;
    const s = seltenheitIn(tl);
    if (s) item.seltenheit = s.id;
    item.vermacht = RE_ANCESTRAL.test(tl);
    const rarityWords = new Set(selt.flatMap(x => [x.id, ...asArray(x.synonyme)]).map(norm));
    const rest = tl.split(/\s+/).filter(w => !rarityWords.has(norm(w)) && !RE_ANCESTRAL.test(w) && !/^(sacred|heilig\w*)$/i.test(w)).join(' ');
    item.itemTyp = itemTypAus(rest, katalog);
    // Name: bis zu drei Zeilen direkt über der Typzeile, nur Zeilen, die überwiegend aus Buchstaben bestehen
    const nameZeilen = clean.slice(Math.max(0, typIdx - 3), typIdx)
      .filter(l => (l.text.match(/\p{L}/gu) || []).length / l.text.replace(/\s/g, '').length >= 0.6);
    item.name = nameZeilen.map(l => l.text).join(' ');
  }
  if (!item.name && clean.length) item.name = clean[0].text;
  item.name = item.name.replace(/[^\p{L}\p{N}'’ \-]/gu, ' ').replace(/\s+/g, ' ').trim();

  // Uniques/Runenwörter: bekannten Namen im (verrauschten) OCR-Namen suchen
  const unique = istUnique(wissen, item.seltenheit);
  const bekannte = [
    ...asArray(wissen && wissen.eintraege).filter(e => ['unique', 'mythisch', 'mythic', 'runenwort', 'runeword'].includes(norm(e.typ))).flatMap(e => [e.name_en, e.name_de]),
    ...katalogListe(katalog, 'uniques').map(u => u.name_en),
  ].filter(Boolean);
  const gefunden = unique && item.name ? (namenInText(item.name, bekannte) || (namenAbgleich(item.name, bekannte, 0.25) || {}).name) : null;
  if (gefunden) {
    if (norm(gefunden) !== norm(item.name)) hinweise.push(`Name „${item.name}“ als „${gefunden}“ erkannt (Wissen/Katalog) – bitte prüfen.`);
    item.name = gefunden;
  } else if (item.name) {
    // Wörter mit Satzzeichen/Rauschen raus, Groß/Klein normalisieren
    item.name = item.name.split(' ').filter(w => /\p{L}{2,}/u.test(w)).join(' ')
      .toLowerCase().replace(/(^|\s)\p{L}/gu, m => m.toUpperCase());
    if (!unique) {
      const asp = aspektAusName(item.name, { wissen, katalog });
      if (asp) { item.aspekt = asp; hinweise.push(`Aspekt „${asp}“ aus dem Item-Namen abgeleitet – bitte prüfen.`); }
    }
  }
  item.slug = slugify(item.name);

  const katalogAffixe = katalogListe(katalog, 'affixe').map(a => a.name_en).filter(Boolean);
  let modus = 'kopf';        // kopf → affixe → effekt → fuss
  let letztes = null;
  for (let i = typIdx >= 0 ? typIdx + 1 : 1; i < clean.length; i++) {
    const l = clean[i];
    const t = l.text;
    const hm = t.match(RE_HAERT);
    if (hm) { item.haertungen.genutzt = Number(hm[2]); item.haertungen.max = Number(hm[3]); letztes = null; continue; }
    const vm = t.match(RE_VOLL);
    if (vm) { item.vollendung.stufe = Number(vm[2]); item.vollendung.max = Number(vm[3]); letztes = null; continue; }
    if (/scroll down|runterscrollen/i.test(t) && !hinweise.some(h => /abgeschnitten/.test(h))) {
      hinweise.push('Tooltip ist abgeschnitten („Scroll Down“) – Härtungen und Vollendung stehen weiter unten. Im Spiel runterscrollen und erneut aufnehmen oder von Hand prüfen.');
    }
    if (RE_FUSS.test(t)) { modus = 'fuss'; letztes = null; continue; }
    if (modus === 'fuss') continue;
    const p = t.match(RE_POWER);
    if (p) { item.gegenstandsmacht = Number(p[1] || p[4]); modus = 'affixe'; letztes = null; continue; }
    if (RE_ANCESTRAL.test(t) && t.length < 30) { item.vermacht = true; continue; }
    const ohneBullet = t.replace(RE_OCR_BULLET, '').replace(RE_STERN, '');
    if (RE_LEER.test(t)) { item.sockel.push({ gefuellt: false, inhalt: '' }); letztes = null; continue; }
    const gem = ohneBullet.match(RE_GEM);
    if (gem && ohneBullet.length < 40 && !/%/.test(ohneBullet)) { item.sockel.push({ gefuellt: true, inhalt: ohneBullet }); letztes = null; continue; }
    if (RE_BASIS.test(t)) { modus = 'affixe'; letztes = null; continue; }

    const runen = ohneBullet.match(RE_RUNEN_SOCKEL);
    if (runen) runen[1].split(/(?=[A-Z])/).forEach(r => item.sockel.push({ gefuellt: true, inhalt: r }));
    // Effekt-Absatz (Aspekt, Unique-Kraft, Runenwort): bis zu den Fußzeilen ist nichts mehr ein Affix
    if (RE_EFFEKT.test(ohneBullet)) { modus = 'effekt'; letztes = null; continue; }
    if (modus === 'effekt') continue;
    const istAffix = RE_AFFIX_START.test(ohneBullet) || /^(lucky hit|glückstreffer)\s*:/i.test(ohneBullet);
    // Fortsetzung einer umgebrochenen Affixzeile: kurz, ohne Zahl, ohne Satzende
    if (letztes && !istAffix && ohneBullet.split(' ').length <= 3 && !/\d|[.!?]$/.test(ohneBullet)) {
      letztes.text = `${letztes.text} ${ohneBullet}`.trim();
      continue;
    }
    if (!istAffix) {
      // Langer Satz ohne Wert nach den Affixen = Effekttext (z. B. Unique-Kraft)
      if (modus === 'affixe' && ohneBullet.length > 30) modus = 'effekt';
      continue;
    }
    modus = 'affixe';
    const m = ohneBullet.match(RE_AFFIX_START);
    const text = (m ? m[2] : ohneBullet).replace(/(\s+[\d.,]+%?)+$/, '').replace(/[+\-%\s]+$/, '').trim();
    if (!/\p{L}{2,}/u.test(text)) { letztes = null; continue; }   // nur Zahlenreste
    const a = {
      text, wert: m ? m[1].replace(/\s+/g, '').replace(/^×/, 'x') : '',
      gross: !!l.stern, implizit: false, verzaubert: l.symbol === 'verzaubert', schwach: false,
      konfidenz: l.confidence, lang: ohneBullet.length > 70, roh: l.roh,
    };
    affixe.push(a);
    letztes = a;
  }

  // Affixnamen mit dem Katalog abgleichen
  for (const a of affixe) {
    const hit = namenAbgleich(a.text, katalogAffixe, 0.15);
    if (hit) {
      if (!hit.exakt) a.korrigiertAus = a.text;
      a.text = hit.name;
    }
  }
  if (affixe.some(a => a.gross)) hinweise.push('Stern-Symbol erkannt: diese Zeilen sind als „groß“ vorgemerkt – bitte prüfen.');
  if (affixe.some(a => a.verzaubert)) hinweise.push('Blaues Verzauberungs-Symbol erkannt: diese Zeile ist als „verzaubert“ vorgemerkt – bitte prüfen.');
  if (affixe.filter(a => a.verzaubert).length > 1) affixe.forEach(a => { a.verzaubert = false; });   // unmöglich → lieber nichts vormerken

  // Implizite Affixe bei Uniques vormarkieren (Hinweis aus katalog.json, keine Garantie)
  const u = findeUnique(katalog, item.name, item.slug);
  let implizitHinweis = '';
  if (unique) {
    const n = u ? zahl(u.num_inherents, null) : null;
    if (n != null) {
      affixe.slice(0, n).forEach(a => { a.implizit = true; });
      implizitHinweis = `Erste ${n} Zeile(n) laut katalog.json als implizit markiert – bitte prüfen.`;
    } else if (u) {
      implizitHinweis = `„${u.name_en || u.slug}“ steht im Katalog, aber ohne num_inherents – implizite Affixe bitte selbst markieren.`;
    } else {
      implizitHinweis = 'Unique nicht in katalog.json – implizite Affixe bitte selbst markieren.';
    }
  }
  if (u && !item.itemTyp && u.itemTyp) item.itemTyp = u.itemTyp;
  item.affixe = affixe;

  return {
    item,
    slot: slotVorschlag({ itemTyp: item.itemTyp, name: item.name, katalog, inventar, wissen }),
    unique: u,
    implizitHinweis,
    hinweise,
    roh: roh.map(l => l.roh).filter(Boolean).join('\n'),
  };
}

/* ================================================================
   Runen
   ================================================================ */

/** Bekannte Runennamen: Regel-Ausnahmen von Runen-Regeln, wissen.runen, Einträge mit typ rune. */
function runenNamen(wissen) {
  const set = new Set();
  for (const r of asArray(wissen && wissen.regeln)) {
    if (asArray(r.trifft && r.trifft.typ).some(t => norm(t) === 'rune')) asArray(r.ausnahmen).forEach(a => set.add(itemText(a)));
  }
  asArray(wissen && wissen.eintraege).filter(e => norm(e.typ) === 'rune').forEach(e => set.add(e.name_en || e.name_de));
  const ru = wissen && wissen.runen;
  if (ru) {
    asArray(ru.liste || ru.namen).forEach(n => set.add(itemText(n)));
    runenKette(wissen).forEach(k => { set.add(k.von); set.add(k.nach); });
  }
  return [...set].filter(Boolean);
}
const istRune = (wissen, text) => runenNamen(wissen).some(r => norm(r) === norm(text));

/**
 * Aufwertungskette aus wissen.runen.aufwertungskette.
 * Erlaubt: [{ "von": "Tir", "nach": "Eth", "menge": 3 }] oder ["3x Tir -> Eth"].
 */
function runenKette(wissen) {
  const roh = asArray(wissen && wissen.runen && wissen.runen.aufwertungskette);
  return roh.map(x => {
    if (x && typeof x === 'object') return { von: x.von, nach: x.nach, menge: Number(x.menge) || 3 };
    const m = String(x).match(/(\d+)\s*[x×]\s*([\p{L}]+)\s*[-–=]*>\s*([\p{L}]+)/u);
    return m ? { von: m[2], nach: m[3], menge: Number(m[1]) } : null;
  }).filter(k => k && k.von && k.nach);
}

/**
 * Bedarf über die Aufwertungskette: Wie viele der untersten Rune fehlen für `anzahl` × `rune`?
 * Nur rechnen, wenn alle Bestände der Kette bekannt sind – sonst nur die Kette zurückgeben.
 */
function runenBedarf(wissen, bestand, rune, anzahl = 1) {
  const kette = runenKette(wissen);
  const pfad = [];                         // von unten nach oben, endet bei `rune`
  let aktuell = rune;
  for (let guard = 0; guard < 20; guard++) {
    const k = kette.find(x => norm(x.nach) === norm(aktuell));
    if (!k) break;
    pfad.unshift(k);
    aktuell = k.von;
  }
  if (!pfad.length) return null;
  const unterste = pfad[0].von;
  // Wert jeder Stufe in Einheiten der untersten Rune
  const wert = { [norm(unterste)]: 1 };
  let w = 1;
  for (const k of pfad) { w *= k.menge; wert[norm(k.nach)] = w; }
  const stufen = [unterste, ...pfad.map(k => k.nach)];
  const kettenText = pfad.map(k => `${k.menge}× ${k.von} → ${k.nach}`).join(', ');
  const bestaende = stufen.map(n => ({ n, hat: bestandVon(bestand, n) }));
  const proStueck = wert[norm(rune)];
  if (bestaende.some(b => b.hat == null)) return { kettenText, unterste, proStueck, gerechnet: false };
  const vorhanden = bestaende.reduce((sum, b) => sum + b.hat * wert[norm(b.n)], 0);
  const fehlt = Math.max(0, anzahl * proStueck - vorhanden);
  return { kettenText, unterste, proStueck, gerechnet: true, vorhanden, fehlt, bestaende };
}

/* ================================================================
   Was fehlt – Beschaffung (Builds gegen Besitz)
   ================================================================ */

/** Beschaffungsroute für Slots ohne benanntes Zielitem (Logik, kein Spieldatum). */
function profilRoute(slotDe) {
  return [
    `Höllenflut, gezielte ${slotDe}-Truhe`,
    'Kuriositätenhändler mit Obols',
    'Würfel: Upgrade to Legendary mit Abstimmungsprisma',
  ];
}
const ASPEKT_RANG_HINWEIS = 'Ränge 17–21 kommen nur über vermachte Items.';

/** Farmziele, zu denen ein Name gehört: als Belohnung genannt oder im Quelltext erwähnt. */
function farmzieleFuer(wissen, name, quelleFrei) {
  const q = norm(quelleFrei);
  return asArray(wissen && wissen.farmziele).filter(f => {
    if (name && asArray(f.belohnungen).some(b => textPasst(name, itemText(b)) || (b && typeof b === 'object' && [b.name_de, b.name_en].some(x => x && textPasst(name, x))))) return true;
    return q && [f.quelle_de, f.quelle_en, f.quelle].map(norm).filter(Boolean).some(x => hasWords(q, x) || phraseIn(q, x));
  });
}

/** Kodex-Rang eines Aspekts: Zahl = Rang, null = nicht im Kodex, undefined = unbekannt. */
function kodexRang(kodex, aspekt) {
  if (!kodex || !aspekt) return undefined;
  const namen = [aspekt, ...String(aspekt).split(/[()]/).map(x => x.trim())].filter(Boolean);
  for (const [k, v] of Object.entries(kodex)) {
    if (namen.some(n => affixGleich(k, n) || textPasst(k, n))) return v == null || v === '' ? null : zahl(v, null);
  }
  return undefined;
}

/**
 * Alle offenen Beschaffungs-Posten aus aktivem und Ziel-Build.
 * Funktioniert auch mit leerem Inventar.
 * @returns {{posten: object[], ausgeblendet: number}}
 */
function wasFehlt({ profil, wissen, katalog, uebersetzung }) {
  const p = profil || {};
  const inv = normalizeInventar(p.inventar);
  const bestand = p.bestand || {};
  const tab = Object.assign({}, (uebersetzung && uebersetzung.affixe) || uebersetzung || {}, (wissen && wissen.affixUebersetzungen) || {});
  const builds = asArray(p.builds);
  const aktiv = builds.find(b => b.id === p.aktiverBuild) || null;
  const ziel = builds.find(b => b.id === p.zielBuild) || null;
  const liste = [];
  if (aktiv) liste.push({ rolle: 'aktiv', build: aktiv, anderer: ziel });
  if (ziel && ziel !== aktiv) liste.push({ rolle: 'ziel', build: ziel, anderer: aktiv });

  const map = new Map();
  const add = (id, basis, rolle, slotDe) => {
    let x = map.get(id);
    if (!x) { x = Object.assign({ id, rollen: [], slots: [], detail: [], zusatz: [], blockiert: 0, farmziele: [], quelleFrei: '' }, basis); map.set(id, x); }
    if (rolle && !x.rollen.includes(rolle)) x.rollen.push(rolle);
    if (slotDe && !x.slots.includes(slotDe)) x.slots.push(slotDe);
    return x;
  };
  const runenBedarfMap = new Map();

  for (const { rolle, build, anderer } of liste) {
    const runenInBuild = new Map();
    for (const s of SLOTS) {
      const sl = slotAus(build.slots, s.key);
      if (!sl || sl.erledigt) continue;
      const it = inv[s.key];
      // Trägst du hier schon das Zielitem des anderen Builds, ist dieser Slot weiter als verlangt
      const slAnderer = anderer && slotAus(anderer.slots, s.key);
      const weiter = !!(it && slAnderer && slAnderer.zielItem && textPasst(it.name, slAnderer.zielItem));
      const zielItem = String(sl.zielItem || '').trim();
      const zielAspekt = String(sl.zielAspekt || '').trim();

      // a) benannte Items
      if (zielItem) {
        const e = eintragZu(wissen, zielItem);
        const hat = it && (textPasst(it.name, zielItem) || (e && [e.name_de, e.name_en].some(n => n && textPasst(it.name, n))));
        if (!hat) {
          add(`item:${norm(e ? (e.name_en || e.name_de) : zielItem)}`, {
            art: 'item', titel: e ? bi(e.name_de, e.name_en) : zielItem, name: e ? (e.name_en || e.name_de) : zielItem,
            quelleFrei: e && e.quelle ? listText(e.quelle) : (sl.quelle || ''),
          }, rolle, s.de);
        }
      }
      // 2) Slot-Profil: kein Zielitem, nur Aspekt → Profil fehlt, wenn der Slot leer ist oder ein Unique/anderes Teil trägt
      if (!zielItem && zielAspekt && !weiter && (!it || istUnique(wissen, it.seltenheit))) {
        const x = add(`profil:${rolle}:${s.key}`, {
          art: 'profil', titel: `${s.de}: seltenes oder legendäres Teil`, name: zielAspekt, slot: s.de,
          gesucht: asArray(sl.affixe).map(a => affixAnzeige(a, tab, p.charakter)), aspekt: zielAspekt,
          route: profilRoute(s.de), quelleFrei: profilRoute(s.de).join(' · '),
        }, rolle, s.de);
        if (it) x.zusatz.push(`Aktuell: ${it.name || 'Item'} (${seltenheitKanon(wissen, it.seltenheit) || 'unbekannt'})`);
      }
      // b) Aspekte
      if (zielAspekt && !weiter) {
        const rang = kodexRang(p.kodex, zielAspekt);
        const imItem = it && it.aspekt && textPasst(it.aspekt, zielAspekt);
        if (!imItem && (rang === null || rang === undefined)) {
          const e = eintragZu(wissen, zielAspekt);
          const x = add(`aspekt:${norm(e ? (e.name_en || e.name_de) : zielAspekt)}`, {
            art: 'aspekt', titel: e ? bi(e.name_de, e.name_en) : zielAspekt, name: e ? (e.name_en || e.name_de) : zielAspekt,
            quelleFrei: e && e.quelle ? listText(e.quelle) : '',
          }, rolle, s.de);
          if (!x.zusatz.includes(ASPEKT_RANG_HINWEIS)) {
            x.zusatz.push(rang === null ? 'Nicht im Kodex.' : 'Im Kodex nicht eingetragen (Bestand → Kodex).');
            x.zusatz.push(ASPEKT_RANG_HINWEIS);
          }
        }
      }
      // c) Sockelinhalte (ohne Runen) und d) Runen
      const soll = splitParts(sl.sockel).map(x => x.replace(/\s*\([^)]*\)\s*$/, '').trim()).filter(Boolean);
      const ist = asArray(it && it.sockel).filter(x => x.gefuellt && x.inhalt).map(x => x.inhalt);
      for (const req of soll) {
        const drin = ist.some(x => textPasst(x, req));
        if (istRune(wissen, req)) {
          if (!drin) runenInBuild.set(norm(req), { name: req, n: (runenInBuild.get(norm(req)) || { n: 0 }).n + 1, slots: [...((runenInBuild.get(norm(req)) || {}).slots || []), s.de] });
          continue;
        }
        if (drin) continue;
        const e = eintragZu(wissen, req);
        add(`sockel:${norm(e ? (e.name_en || e.name_de) : req)}`, {
          art: 'sockel', titel: e ? bi(e.name_de, e.name_en) : req, name: e ? (e.name_en || e.name_de) : req,
          quelleFrei: e && e.quelle ? listText(e.quelle) : '',
        }, rolle, s.de);
      }
    }
    // Runenbedarf: pro Build zählen, über beide Builds das Maximum
    for (const [k, v] of runenInBuild) {
      const alt = runenBedarfMap.get(k);
      if (!alt || v.n > alt.n) runenBedarfMap.set(k, { ...v, rollen: [...new Set([...(alt ? alt.rollen : []), rolle])] });
      else alt.rollen = [...new Set([...alt.rollen, rolle])];
    }
  }
  for (const [k, v] of runenBedarfMap) {
    const hat = bestandVon(bestand, v.name);
    if (hat != null && hat >= v.n) continue;
    const x = add(`rune:${k}`, {
      art: 'rune', titel: `Rune ${v.name}`, name: v.name,
      detail: [hat == null ? `Bestand unbekannt – gebraucht: ${v.n}` : `Bestand ${hat}, gebraucht: ${v.n}`],
    }, null, null);
    v.rollen.forEach(r => { if (!x.rollen.includes(r)) x.rollen.push(r); });
    v.slots.forEach(sl => { if (!x.slots.includes(sl)) x.slots.push(sl); });
    const b = runenBedarf(wissen, bestand, v.name, v.n - (hat || 0));
    if (b && b.gerechnet) {
      x.zusatz.push(b.fehlt > 0
        ? `${v.name} fehlt. Mit deinen Beständen fehlen umgerechnet ${b.fehlt} ${b.unterste} – für 1 ${v.name} braucht es ${b.proStueck} ${b.unterste} (${b.kettenText}).`
        : `${v.name} ist über die Aufwertung erreichbar: deine Bestände reichen (${b.kettenText}).`);
    } else if (b) {
      x.zusatz.push(`Aufwertungskette: ${b.kettenText}. Für 1 ${v.name} braucht es ${b.proStueck} ${b.unterste}.`);
    }
  }

  // e) Materialien, die Aktionen blockieren (aus der Slot-Analyse, doppelte Aktionen nur einmal)
  const gesehen = new Set();
  const blockiert = new Map();
  for (const { rolle, build, anderer } of liste) {
    for (const s of SLOTS) {
      const r = analysiereSlot({ slotKey: s.key, item: inv[s.key], build, andererBuild: anderer, charakter: p.charakter, bestand, wissen, katalog, uebersetzung });
      for (const a of r.aktionen) {
        if (!a.blockiert || !a.material) continue;
        const key = `${s.key}|${a.kategorie}|${a.text}`;
        if (gesehen.has(key)) continue;
        gesehen.add(key);
        const m = a.material;
        const b = blockiert.get(m.schluessel) || { m, n: 0, rollen: new Set(), slots: new Set() };
        b.n++; b.rollen.add(rolle); b.slots.add(s.de);
        blockiert.set(m.schluessel, b);
      }
    }
  }
  for (const [schluessel, b] of blockiert) {
    const e = materialEintraege(wissen).find(x => x.bestandsschluessel === schluessel);
    const x = add(`material:${norm(schluessel)}`, {
      art: 'material', titel: bi(b.m.de, b.m.en), name: b.m.en || b.m.de,
      quelleFrei: e && e.quelle ? listText(e.quelle) : '', blockiert: b.n, engpass: b.m.engpass,
      detail: [b.m.bestand == null ? 'Bestand unbekannt' : `Bestand ${b.m.bestand}`],
    }, null, null);
    b.rollen.forEach(r => { if (!x.rollen.includes(r)) x.rollen.push(r); });
    b.slots.forEach(sl => { if (!x.slots.includes(sl)) x.slots.push(sl); });
  }

  // Farmziele zuordnen
  const alle = [...map.values()];
  for (const x of alle) x.farmziele = farmzieleFuer(wissen, x.art === 'profil' ? '' : x.name, x.quelleFrei);
  const aus = new Set(asArray(p.ausgeblendet));
  return { posten: alle.filter(x => !aus.has(x.id)), ausgeblendet: alle.filter(x => aus.has(x.id)).length, gesamt: alle.length };
}

/** Gruppierung nach Farmziel; Posten ohne Farmziel unter „Sonstiges“. Meiste offene Posten zuerst. */
function gruppiereNachQuelle(wissen, posten) {
  const gruppen = new Map();
  const sonstiges = [];
  for (const x of posten) {
    if (!x.farmziele.length) { sonstiges.push(x); continue; }
    for (const f of x.farmziele) {
      const key = norm(f.quelle_de || f.quelle_en || f.quelle);
      if (!gruppen.has(key)) gruppen.set(key, { farmziel: f, titel: farmQuelle(wissen, f), posten: [] });
      gruppen.get(key).posten.push(x);
    }
  }
  const out = [...gruppen.values()].sort((a, b) => b.posten.length - a.posten.length);
  if (sonstiges.length) out.push({ farmziel: null, titel: 'Sonstiges', posten: sonstiges });
  return out;
}

/** Reihenfolge nach Priorität: Blockierer, aktiver Build, Ziel-Build. */
function sortiereNachPrioritaet(posten) {
  const rang = x => (x.blockiert > 0 ? 0 : x.rollen.includes('aktiv') ? 1 : x.rollen.includes('ziel') ? 2 : 3);
  return [...posten].sort((a, b) => rang(a) - rang(b) || (b.blockiert || 0) - (a.blockiert || 0) || a.titel.localeCompare(b.titel, 'de'));
}

/* ================================================================
   Item prüfen – Verdikt für ein einzelnes (nicht getragenes) Item
   ================================================================ */

/** Kandidaten-Slots für ein Item (Ringe passen in beide Ringslots). */
function kandidatenSlots(item, { katalog, wissen } = {}) {
  const v = slotVorschlag({ itemTyp: item.itemTyp, name: item.name, katalog, wissen });
  if (!v.key) return [];
  return v.key === 'ring1' || v.key === 'ring2' ? ['ring1', 'ring2'] : [v.key];
}

/** Englischer Item-Typ → deutsche Bezeichnung (für Regeln wie itemTyp: ["Brustschutz"]). */
function itemTypVarianten(itemTyp, uebersetzung) {
  const tab = (uebersetzung && uebersetzung.itemTypen) || {};
  const out = [itemTyp];
  const key = Object.keys(tab).find(k => norm(k) === norm(itemTyp));
  if (key) out.push(...asArray(tab[key]));
  return out.filter(Boolean);
}

/** Passende Regel für ein Ausrüstungsteil über trifft (typ ausruestung, seltenheit, itemTyp, getragen). */
function regelFuerItem(wissen, item, { getragen = false, imBuild = false, uebersetzung } = {}) {
  const selt = [seltenheitKanon(wissen, item.seltenheit), item.vermacht ? 'vermacht' : ''].filter(Boolean).map(norm);
  const typen = itemTypVarianten(item.itemTyp, uebersetzung).map(norm);
  const treffer = [];
  for (const r of asArray(wissen && wissen.regeln)) {
    const t = r.trifft || {};
    if (!asArray(t.typ).some(x => ['ausruestung', 'ausrüstung', 'item', 'gear'].includes(norm(x)))) continue;
    const s = asArray(t.seltenheit).map(x => norm(seltenheitKanon(wissen, x)));
    if (s.length && !s.some(x => selt.includes(x))) continue;
    const it = asArray(t.itemTyp).map(norm);
    if (it.length && !it.some(x => typen.some(y => y === x || hasWords(y, x)))) continue;
    if (t.getragen === true && !getragen) continue;
    if (t.getragen === false && getragen) continue;
    if (t.nichtImBuild === true && imBuild) continue;
    // Vermacht ist die stärkere Aussage als „legendär“ – Regeln dafür haben Vorrang
    treffer.push({ r, genauigkeit: Object.keys(t).length + (it.length ? 2 : 0) + (s.includes('vermacht') ? 3 : 0) });
  }
  treffer.sort((a, b) => b.genauigkeit - a.genauigkeit);
  return treffer.map(x => x.r);
}

/**
 * Bewertet ein Item gegen beide Builds, das getragene Item und die Regeln aus wissen.json.
 * Reine Regelanwendung – keine Roll-Bereiche, keine DPS.
 */
function bewerteItem({ item, profil, wissen, katalog, uebersetzung }) {
  const p = profil || {};
  const tab = Object.assign({}, (uebersetzung && uebersetzung.affixe) || {}, (wissen && wissen.affixUebersetzungen) || {});
  const inv = normalizeInventar(p.inventar);
  const builds = asArray(p.builds);
  const rollen = [['aktiv', builds.find(b => b.id === p.aktiverBuild)], ['ziel', builds.find(b => b.id === p.zielBuild)]]
    .filter(([, b]) => b).filter(([r, b], i, arr) => !(r === 'ziel' && arr[0] && arr[0][1] === b));
  const slots = kandidatenSlots(item, { katalog, wissen });
  const passend = [];
  const zaehle = (it, sl) => {
    const ziele = asArray(sl.affixe);
    const treffer = ziele.filter(z => asArray(it && it.affixe).some(a => affixPasst(a.text, z, tab, p.charakter)));
    return { treffer: treffer.length, von: ziele.length, namen: treffer };
  };
  const e = eintragZu(wissen, item.name);
  for (const [rolle, b] of rollen) {
    for (const key of slots) {
      const sl = slotAus(b.slots, key);
      if (!sl) continue;
      const sDe = SLOT_BY_KEY[key].de;
      const getragen = inv[key];
      if (sl.zielItem && (textPasst(item.name, sl.zielItem) || (e && [e.name_de, e.name_en].some(n => n && textPasst(n, sl.zielItem))))) {
        const hatSchon = getragen && textPasst(getragen.name, item.name);
        passend.push({ rolle, build: b.name, slot: sDe, art: 'zielitem', text: hatSchon ? `Zielitem – du trägst es schon (Duplikat)` : 'Zielitem dieses Slots', hatSchon });
        continue;
      }
      if (!sl.zielItem && sl.zielAspekt && !istUnique(wissen, item.seltenheit)) {
        const c = zaehle(item, sl), g = getragen ? zaehle(getragen, sl) : null;
        const aspektPasst = item.aspekt && textPasst(item.aspekt, sl.zielAspekt);
        if (c.treffer >= 2 || aspektPasst) {
          passend.push({
            rolle, build: b.name, slot: sDe, art: 'profil', treffer: c.treffer, von: c.von, aspektPasst,
            besser: g ? c.treffer > g.treffer : true, getragenTreffer: g ? g.treffer : null,
            text: `${c.treffer}/${c.von} Zielaffixe${aspektPasst ? ', Aspekt passt' : ''}${g ? ` – getragen: ${g.treffer}/${c.von}` : ' – Slot ist leer'}`,
          });
        }
      }
    }
  }
  const regeln = regelFuerItem(wissen, item, { getragen: false, imBuild: passend.length > 0, uebersetzung });
  const gruende = [];
  let verdikt = '', quelle = '';
  const ziel = passend.find(x => x.art === 'zielitem' && !x.hatSchon);
  const upgrade = passend.find(x => x.art === 'profil' && x.besser);
  if (ziel) {
    verdikt = 'ANLEGEN'; quelle = 'build';
    gruende.push(`${ziel.slot}: Zielitem im ${ziel.rolle === 'aktiv' ? 'aktuellen' : 'Ziel-'}Build „${ziel.build}“.`);
  } else if (upgrade) {
    verdikt = 'BEHALTEN'; quelle = 'build';
    gruende.push(`${upgrade.slot} im Build „${upgrade.build}“: ${upgrade.text}. Mehr Zielaffixe als das getragene Teil – Kandidat zum Anlegen oder Umbauen.`);
  } else if (e && e.verdikt) {
    verdikt = e.verdikt; quelle = 'eintrag';
    if (e.begruendung) gruende.push(e.begruendung);
  } else if (regeln.length) {
    verdikt = regeln[0].verdikt || ''; quelle = 'regel';
    if (regeln[0].begruendung) gruende.push(regeln[0].begruendung);
  }
  // Aspekt und Kodex
  let kodexHinweis = '';
  if (item.aspekt) {
    const rang = kodexRang(p.kodex, item.aspekt);
    kodexHinweis = rang == null
      ? `Aspekt „${item.aspekt}“: ${rang === null ? 'nicht im Kodex' : 'Kodex-Stand unbekannt'}.`
      : `Aspekt „${item.aspekt}“: im Kodex, Rang ${rang}.`;
  }
  return { verdikt, quelle, gruende, passend, regeln, eintrag: e, kodexHinweis, slots };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SLOTS, SLOT_BY_KEY, SLOT_ALIAS, slotKey, slotAus, norm, tokens, hasWords, wordEq, phraseEq, phraseIn, textPasst, bi, itemText, listText,
    asArray, splitParts, slugify, seltenheitKanon, quelleText, farmQuelle, quellenFuerName, findeUnique,
    katalogListe, eintragZu, AKTION_MATERIAL, material, materialEintraege, farbeCss, pruefeIntegritaet,
    leeresItem, normalizeItem, normalizeInventar, bestandVon, engpassListe, istEngpass,
    reihenfolgeNotiz, STANDARD_REIHENFOLGE, KATEGORIE_LABEL, analysiereSlot, PRIO_RANG, TEXT,
    slotVorschlag, parseTooltip, ocrZeile, aspektAusName, namenAbgleich, namenInText, distanz, itemTypAus,
    affixVarianten, affixPasst, affixVergleichbar, affixAnzeige,
    runenNamen, istRune, runenKette, runenBedarf, wasFehlt, gruppiereNachQuelle, sortiereNachPrioritaet, farmzieleFuer, kodexRang,
    profilRoute, ASPEKT_RANG_HINWEIS, kandidatenSlots, regelFuerItem, bewerteItem, itemTypVarianten,
  };
}
