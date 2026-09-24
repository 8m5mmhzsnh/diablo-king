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

function seltenheitAus(wissen, token) {
  for (const s of asArray(wissen && wissen.seltenheitSynonyme)) {
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
  for (const s of asArray(wissen && wissen.seltenheitSynonyme)) {
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
function analysiereSlot({ slotKey, item, build, andererBuild, charakter, bestand, wissen }) {
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
        text: `„${falsch.inhalt}“ ersetzen durch „${req}“. Der alte Edelstein ist nicht verloren.`,
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
  const fehlend = zielAffixe.filter(z => !affixe.some(a => textPasst(a.text, z)));
  if (wirdErsetzt) {
    info('affixe', 'Nicht verzaubern – das Teil wird ersetzt.');
  } else if (verzaubert) {
    info('affixe', `Dieses Item ist bereits an „${verzaubert.text}“ gebunden, andere Affixe sind nicht mehr umrollbar.`);
  } else if (!zielAffixe.length) {
    info('affixe', 'Keine Affix-Prioritäten im Build hinterlegt – keine Verzauber-Empfehlung möglich.');
  } else if (fehlend.length) {
    const kandidaten = affixe
      .filter(a => !a.implizit && !zielAffixe.some(z => textPasst(a.text, z)))
      .map(a => ({ a, anderer: andereAffixe.some(z => textPasst(a.text, z)) }))
      .sort((x, y) => Number(x.anderer) - Number(y.anderer));   // in keinem Build gefragt = am wenigsten nützlich
    if (kandidaten.length) {
      const k = kandidaten[0], ziel = fehlend[0], rang = zielAffixe.indexOf(ziel);
      aktion({
        kategorie: 'affixe', gruppe: item.vermacht ? 'material' : 'gold', prio: rang < 2 ? 'hoch' : 'mittel',
        text: `Zeile „${k.a.text}“ umrollen auf „${ziel}“`,
        grund: `„${ziel}“ fehlt (Priorität ${rang + 1} im Build). „${k.a.text}“ ist ${k.anderer ? 'nur im anderen Build gefragt' : 'in keinem Build gefragt'}.`,
        kandidaten: kandidaten.map(x => `${x.a.text}${x.anderer ? ' (anderer Build)' : ''}`),
        material: item.vermacht ? mat('verzaubernVermacht', 10) : null,
      });
    } else {
      info('affixe', `Es fehlt „${fehlend[0]}“, aber alle umrollbaren Zeilen sind schon Zielaffixe.`);
    }
  }
  if (!wirdErsetzt && item.vermacht && !verzaubert) info('affixe', TEXT.seelen(mat('verzaubernVermacht', 10).de));
  info('affixe', TEXT.grossUnsicher, 'unsicher');
  if (!wirdErsetzt && zielAffixe.length && !fehlend.length && affixe.some(a => a.schwach)) {
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
  } else if (h.affix && slot.haertung && !textPasst(h.affix, slot.haertung)) {
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
  for (const k of Object.keys(bestand)) if (!schluessel.includes(k)) out.bestandOhneMaterial.push(k);
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

/* Fußzeilen: werden übersprungen, beenden aber das Lesen nicht (danach kommen z. B. noch „Tempers: 3/3“). */
const RE_FUSS = /(requires level|benötigt stufe|sell value|verkaufswert|durability|haltbarkeit|account bound|accountgebunden|right mouse|rechtsklick|unique equipped|only one|kann nur|properties lost|eigenschaften gehen|lord of hatred|vessel of hatred|item$|season|saison)/i;
const RE_KOPF = /^(equipped|ausgerüstet|angelegt|currently equipped)$/i;
const RE_BASIS = /^[\d.,]+\s+(armou?r|rüstung|damage per second|schaden pro sekunde|block chance)\b|damage per hit|schaden pro treffer|attacks? per second|angriffe pro sekunde|^\s*\[\s*[\d.,]+\s*-\s*[\d.,]+\s*\]\s*damage/i;
const RE_POWER = /(\d{2,4})\s*(item power|gegenstandsmacht)|(item power|gegenstandsmacht)\D{0,4}(\d{2,4})/i;
const RE_HAERT = /(temper\w*|härtung\w*|gehärtet)\D{0,12}(\d+)\s*\/\s*(\d+)/i;
const RE_VOLL = /(masterwork\w*|vollend\w*)\D{0,12}(\d+)\s*\/\s*(\d+)/i;
const RE_LEER = /(empty socket|leerer sockel|freier sockel)/i;
const RE_GEM = /\b(ruby|sapphire|emerald|topaz|amethyst|diamond|skull|rubin|saphir|smaragd|topas|amethyst|diamant|schädel)\b/i;
const RE_ANCESTRAL = /\b(ancestral|vermacht|vermächtnis\w*)\b/i;
/* Beginn eines Effekt-Absatzes (Aspekt oder Unique-Kraft) – gehört nicht zu den Affixen. */
const RE_EFFEKT = /^(imprinted|geprägt|aufgeprägt|unique power|einzigartige kraft)\s*:/i;
/* Aufzählungszeichen, die Tesseract aus ◆ / ★ macht: o ¢ © e * • … – nur vor einem Wert. */
const RE_OCR_BULLET = /^([^\p{L}\p{N}+\-\[]{1,3}|[oOeEcCaQ0])\s+(?=[+\-]?\d)/u;
/* Stern als Aufzählungszeichen = vermutlich großer Affix. */
const RE_STERN = /^[*★✦✧☆]\s*/;

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

/**
 * Sucht den passenden Namen in einer Liste: exakt (normalisiert) oder mit kleinem Tippfehler.
 * @returns {{name: string, exakt: boolean}|null}
 */
/** Typische OCR-Verwechslungen angleichen: rn↔m, vv↔w, cl↔d, 0↔o, 1/l↔i. */
const ocrForm = s => norm(s).replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/cl/g, 'd').replace(/0/g, 'o').replace(/[1l]/g, 'i');

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

/** Bereinigt eine OCR-Zeile: Glyphen, Bereichsangaben [x - y], [+] und Streuzeichen raus. */
function ocrZeile(t) {
  return String(t || '')
    .replace(/\+?\s*\[[^\]]*\]\s*%?/g, ' ')           // +[83 - 99], [1,016 - 1,225], [30 - 50]%
    .replace(/[\[\]{}|\\¦]/g, ' ')                      // übrig gebliebene Klammern/Striche
    .replace(/[©®™¢¥£€§¤°º¹²³@#^~`´¨«»<>]/g, ' ')       // typische Fehlglyphen (Icons, Gold-Symbol)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Aspekt aus dem Namen eines legendären Items: „Sadistic Doom Casque“ → Sadistic, „… of Ignition“ → Aspect of Ignition. */
function aspektAusName(name, { wissen, katalog } = {}) {
  const nt = tokens(name);
  if (!nt.length) return null;
  const katalogAspekte = katalogListe(katalog, 'aspekte').map(a => a.name_en).filter(Boolean);
  const wissenAspekte = asArray(wissen && wissen.eintraege).filter(e => norm(e.typ) === 'aspekt');
  const kandidaten = [...new Set([...katalogAspekte, ...wissenAspekte.map(e => String(e.name_en || '').replace(/\s*aspect\s*|\s*aspekt\s*/ig, ' ').replace(/^of /i, '').trim())])]
    .filter(Boolean).map(a => ({ a, t: tokens(a) })).sort((x, y) => y.t.length - x.t.length);
  const tokEq = (x, y) => x === y || (y.length >= 5 && x.length > y.length && x.length - y.length <= 2 && x.endsWith(y)) || (y.length >= 6 && distanz(x, y) <= 1);
  for (const { a, t } of kandidaten) {
    // Präfix-Form: die ersten Wörter des Namens
    if (t.length <= nt.length && t.every((x, k) => tokEq(nt[k], x))) return aspektAnzeige(a, wissenAspekte);
    // „… of X“-Form
    const of = nt.indexOf('of');
    if (of >= 0 && t.length === nt.length - of - 1 && t.every((x, k) => tokEq(nt[of + 1 + k], x))) return aspektAnzeige(a, wissenAspekte);
  }
  return null;
}
function aspektAnzeige(kern, wissenAspekte) {
  const k = norm(kern);
  const e = wissenAspekte.find(x => hasWords(norm(x.name_en), k));
  return e ? bi(e.name_de, e.name_en) : `${kern} Aspect`;
}

/**
 * Macht aus OCR-Zeilen einen Entwurf. Das Ergebnis ist NIE direkt Inventar –
 * es wird im Formular angezeigt und erst nach Bestätigung übernommen.
 * @param {{text: string, confidence?: number}[]} lines
 */
function parseTooltip(lines, { wissen, katalog, inventar } = {}) {
  const roh = asArray(lines)
    .map(l => (typeof l === 'string' ? { text: l, confidence: null } : l))
    .map(l => ({ roh: String(l.text || '').replace(/\s+/g, ' ').trim(), confidence: l.confidence == null ? null : Math.round(l.confidence) }));
  // Zeilen ohne echten Text (Rahmen, Icons, Bildreste) verwerfen
  const clean = roh.map(l => ({ ...l, text: ocrZeile(l.roh) }))
    .filter(l => {
      const buchst = (l.text.match(/[\p{L}\p{N}]/gu) || []).length;
      if (buchst < 2) return false;
      if (l.confidence != null && l.confidence < 45 && buchst / l.text.length < 0.7) return false;
      return !RE_KOPF.test(l.text);
    });
  const item = leeresItem();
  item.quelle = 'ocr';
  const affixe = [];
  const hinweise = [];
  const selt = asArray(wissen && wissen.seltenheitSynonyme);
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
    item.itemTyp = tl.split(/\s+/).filter(w => !rarityWords.has(norm(w)) && !RE_ANCESTRAL.test(w) && !/^(sacred|heilig\w*)$/i.test(w)).join(' ').trim();
    // Name: bis zu zwei Zeilen direkt über der Typzeile
    item.name = clean.slice(Math.max(0, typIdx - 2), typIdx).map(l => l.text).join(' ').trim();
  }
  if (!item.name && clean.length) item.name = clean[0].text;
  item.name = item.name.replace(/[^\p{L}\p{N}' \-]/gu, '').replace(/\s+/g, ' ').trim();

  // Unique-Namen mit Katalog und Wissen abgleichen (OCR-Tippfehler korrigieren)
  const unique = istUnique(wissen, item.seltenheit);
  if (unique && item.name) {
    const namen = [
      ...asArray(wissen && wissen.eintraege).filter(e => ['unique', 'mythisch', 'mythic'].includes(norm(e.typ))).flatMap(e => [e.name_en, e.name_de]),
      ...katalogListe(katalog, 'uniques').map(u => u.name_en),
    ].filter(Boolean);
    const hit = namenAbgleich(item.name, namen, 0.25);
    if (hit && !hit.exakt) hinweise.push(`Name „${item.name}“ zu „${hit.name}“ korrigiert (Katalog) – bitte prüfen.`);
    if (hit) item.name = hit.name;
  } else if (item.name) {
    // Legendäre Items: Namen in Groß/Klein normalisieren, Aspekt aus dem Namen ableiten
    item.name = item.name.toLowerCase().replace(/(^|\s)\p{L}/gu, m => m.toUpperCase());
    const asp = aspektAusName(item.name, { wissen, katalog });
    if (asp) { item.aspekt = asp; hinweise.push(`Aspekt „${asp}“ aus dem Item-Namen abgeleitet – bitte prüfen.`); }
  }
  item.slug = slugify(item.name);

  const katalogAffixe = katalogListe(katalog, 'affixe').map(a => a.name_en).filter(Boolean);
  let modus = 'kopf';        // kopf → affixe → effekt → fuss
  let letztes = null;
  for (let i = typIdx >= 0 ? typIdx + 1 : 1; i < clean.length; i++) {
    const l = clean[i];
    const t = l.text;
    const p = t.match(RE_POWER);
    if (p) { item.gegenstandsmacht = Number(p[1] || p[4]); modus = 'affixe'; letztes = null; continue; }
    if (RE_ANCESTRAL.test(t) && t.length < 30) { item.vermacht = true; continue; }
    const hm = t.match(RE_HAERT);
    if (hm) { item.haertungen.genutzt = Number(hm[2]); item.haertungen.max = Number(hm[3]); letztes = null; continue; }
    const vm = t.match(RE_VOLL);
    if (vm) { item.vollendung.stufe = Number(vm[2]); item.vollendung.max = Number(vm[3]); letztes = null; continue; }
    if (RE_LEER.test(t)) { item.sockel.push({ gefuellt: false, inhalt: '' }); letztes = null; continue; }
    const gem = t.match(RE_GEM);
    if (gem && t.length < 40 && !/%/.test(t)) { item.sockel.push({ gefuellt: true, inhalt: t.replace(RE_OCR_BULLET, '') }); letztes = null; continue; }
    if (RE_FUSS.test(t)) { modus = 'fuss'; letztes = null; continue; }
    if (modus === 'fuss') continue;
    if (RE_BASIS.test(t)) { modus = 'affixe'; letztes = null; continue; }

    const stern = RE_STERN.test(l.roh);
    const ohneBullet = t.replace(RE_OCR_BULLET, '').replace(RE_STERN, '');
    if (RE_EFFEKT.test(ohneBullet)) { modus = 'effekt'; letztes = null; continue; }
    const istAffix = /^[+\-]?\s*\d/.test(ohneBullet) || /^(lucky hit|glückstreffer)\s*:/i.test(ohneBullet);
    if (modus === 'effekt' && !istAffix) continue;
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
    const m = ohneBullet.match(/^([+\-]?\s*[\d.,]+\s*%?)\s+(.+)$/);
    const a = {
      text: (m ? m[2] : ohneBullet).replace(/[+\-%\s]+$/, '').trim(),
      wert: m ? m[1].replace(/\s+/g, '') : '',
      gross: stern, implizit: false, verzaubert: false, schwach: false,
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SLOTS, SLOT_BY_KEY, SLOT_ALIAS, slotKey, slotAus, norm, tokens, hasWords, wordEq, phraseEq, phraseIn, textPasst, bi, itemText, listText,
    asArray, splitParts, slugify, seltenheitKanon, quelleText, farmQuelle, quellenFuerName, findeUnique,
    katalogListe, eintragZu, AKTION_MATERIAL, material, materialEintraege, farbeCss, pruefeIntegritaet,
    leeresItem, normalizeItem, normalizeInventar, bestandVon, engpassListe, istEngpass,
    reihenfolgeNotiz, STANDARD_REIHENFOLGE, KATEGORIE_LABEL, analysiereSlot, PRIO_RANG, TEXT,
    slotVorschlag, parseTooltip, ocrZeile, aspektAusName, namenAbgleich, distanz,
  };
}
