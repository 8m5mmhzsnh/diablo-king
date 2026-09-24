'use strict';

/* ================================================================
   D4 Spickzettel – Schema 2
   wissen.json  → Spielwissen, wird bei Updates komplett ersetzt
   profil.json  → persönlich, wird nie überschrieben
   Beides wird als Arbeitskopie im Browser (localStorage) gehalten.
   ================================================================ */

const SCHEMA = 2;
const FILES = {
  wissen: 'data/wissen.json',
  profil: 'data/profil.json',
  profilLeer: 'data/profil-leer.json',
  katalog: 'data/katalog.json',
};
const LS = {
  wissen: 'd4k2.wissen',            // Arbeitskopie wissen.json
  wissenBasis: 'd4k2.wissenBasis',  // Fingerabdruck der Datei, auf der die Arbeitskopie beruht
  wissenLokal: 'd4k2.wissenLokal',  // true, wenn in der App am Wissen etwas geändert wurde
  profil: 'd4k2.profil',
  katalog: 'd4k2.katalog',
  altBuilds: 'd4k.builds', altAktiv: 'd4k.aktiv', altZiel: 'd4k.ziel',  // Schema 1
};



const TRIFFT_LABEL = {
  typ: 'Typ', seltenheit: 'Seltenheit', itemTyp: 'Item-Typ', getragen: 'getragen', set: 'Set',
  setFremd: 'fremdes Set', duplikat: 'Duplikat', nichtImBuild: 'nicht im Build', plaetze: 'Plätze',
};

const STALE_TIP = 'Daten könnten veraltet sein – im Spiel gegenprüfen';

/* ================================================================
   Hilfsfunktionen
   ================================================================ */

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));


function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.warn('localStorage', e); }
}
function lsDel(key) { try { localStorage.removeItem(key); } catch { /* egal */ } }

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function ageDays(datum) {
  if (!datum) return null;
  const t = Date.parse(datum);
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}
const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : '');
const newId = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function hashText(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

function download(name, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2) + '\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ================================================================
   Zustand
   ================================================================ */

const state = {
  wissen: null,
  profil: null,
  meldungen: [],          // { art: 'warn'|'err'|'info', text, aktion? }
  wissenQuelle: '',       // Beschreibung, woher das Wissen kommt
  profilQuelle: '',
  neueWissenDatei: null,  // { data, hash } wenn eine neuere Datei bereitliegt, aber lokale Änderungen existieren
  tab: 'suche',
  query: '',
  editor: null,           // Build-Editor
  importOpen: false,
  eintragEditor: null,    // { index, draft }
  dateienOpen: false,
  katalog: { uniques: [] },
  katalogQuelle: '',
  invEditor: null,        // Item-Entwurf (OCR oder manuell), wird erst mit „Übernehmen“ Inventar
};

function warnTage() {
  const n = Number(state.profil?.einstellungen?.warnTageBuildAlter);
  return Number.isFinite(n) && n > 0 ? n : 14;
}
const istAlt = stand => { const a = ageDays(stand); return a != null && a > warnTage(); };

function staleIcon(stand) {
  if (!istAlt(stand)) return '';
  const tip = `${STALE_TIP} (Stand ${stand}, vor ${ageDays(stand)} Tagen)`;
  return `<span class="stale" tabindex="0" title="${esc(tip)}" data-tip="${esc(tip)}">⚠</span>`;
}

/* ---------- Normalisierung ---------- */

function normalizeWissen(w) {
  w = Object.assign({}, w || {});
  for (const k of ['eintraege', 'regeln', 'rezepte', 'farmziele', 'notizen', 'verdikte', 'quellen']) {
    if (!Array.isArray(w[k])) w[k] = [];
  }
  // seltenheitSynonyme: Liste von {id, name_de, name_en, synonyme[]} – oder Objekt {id: [synonyme]} / {synonym: id}
  let s = w.seltenheitSynonyme;
  if (s && !Array.isArray(s) && typeof s === 'object') {
    const map = new Map();
    for (const [k, v] of Object.entries(s)) {
      if (Array.isArray(v)) map.set(k, { id: k, synonyme: v });
      else if (typeof v === 'string') {
        if (!map.has(v)) map.set(v, { id: v, synonyme: [] });
        map.get(v).synonyme.push(k);
      }
    }
    s = [...map.values()];
  }
  w.seltenheitSynonyme = asArray(s).filter(x => x && x.id).map(x => ({
    id: x.id, name_de: x.name_de || x.id, name_en: x.name_en || '', synonyme: asArray(x.synonyme),
  }));
  w.regeln = w.regeln.map((r, i) => Object.assign({ id: `regel-${i + 1}`, trifft: {}, suchbegriffe: [], ausnahmen: [] }, r));
  return w;
}

function emptySlot() {
  return { zielItem: '', zielAspekt: '', sockel: '', affixe: [], haertung: '', quelle: '', erledigt: false };
}
function normalizeBuild(b) {
  b = Object.assign({ id: '', name: '', klasse: '', quelleUrl: '', datum: '', notiz: '', slots: {}, wechselkriterien: [] }, b || {});
  if (!b.id) b.id = newId();
  const slots = {};
  for (const s of SLOTS) {
    const slot = Object.assign(emptySlot(), (b.slots && b.slots[s.key]) || {});
    if (typeof slot.affixe === 'string') slot.affixe = slot.affixe.split(/\n|,/).map(x => x.trim()).filter(Boolean);
    if (!Array.isArray(slot.affixe)) slot.affixe = [];
    slot.erledigt = !!slot.erledigt;
    slots[s.key] = slot;
  }
  b.slots = slots;
  b.wechselkriterien = asArray(b.wechselkriterien)
    .map(w => (typeof w === 'string' ? { text: w, erledigt: false } : { text: w.text || '', erledigt: !!w.erledigt }))
    .filter(w => w.text);
  return b;
}
function normalizeProfil(p) {
  p = Object.assign({}, p || {});
  if (!p.charakter || typeof p.charakter !== 'object') p.charakter = {};
  for (const k of ['qualstufe', 'paragon']) if (!(k in p.charakter)) p.charakter[k] = '';
  p.inventar = normalizeInventar(p.inventar);
  if (!p.bestand || typeof p.bestand !== 'object' || Array.isArray(p.bestand)) p.bestand = {};
  p.einstellungen = Object.assign({ warnTageBuildAlter: 14 }, p.einstellungen || {});
  for (const k of ['builds', 'sammelliste', 'offeneAufgaben', 'abweichungen']) if (!Array.isArray(p[k])) p[k] = [];
  p.builds = p.builds.map(normalizeBuild);
  p.sammelliste = p.sammelliste.map(x => (typeof x === 'string' ? { name_de: x, name_en: '', notiz: '', erledigt: false } : x));
  p.offeneAufgaben = p.offeneAufgaben.map(x => (typeof x === 'string' ? { text: x, erledigt: false } : x));
  if (!p.builds.some(b => b.id === p.aktiverBuild)) p.aktiverBuild = '';
  if (!p.builds.some(b => b.id === p.zielBuild)) p.zielBuild = '';
  return p;
}

/* ---------- Laden ---------- */

async function fetchJson(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return { ok: false, fehlt: res.status === 404, error: 'HTTP ' + res.status };
    const text = await res.text();
    try { return { ok: true, data: JSON.parse(text), hash: hashText(text) }; }
    catch (e) { return { ok: false, kaputt: true, error: 'kein gültiges JSON: ' + e.message }; }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function saveWissen(lokalGeaendert) {
  lsSet(LS.wissen, state.wissen);
  if (lokalGeaendert) lsSet(LS.wissenLokal, true);
  buildIndex();
}
function saveProfil() { lsSet(LS.profil, state.profil); }
const wissenLokal = () => !!lsGet(LS.wissenLokal, false);

async function loadWissen() {
  const lokal = lsGet(LS.wissen, null);
  const basis = lsGet(LS.wissenBasis, '');
  const datei = await fetchJson(FILES.wissen);

  if (datei.ok) {
    if (!lokal) {
      state.wissen = datei.data;
      lsSet(LS.wissen, datei.data); lsSet(LS.wissenBasis, datei.hash); lsDel(LS.wissenLokal);
      state.wissenQuelle = FILES.wissen;
    } else if (datei.hash === basis) {
      state.wissen = lokal;
      state.wissenQuelle = wissenLokal() ? `${FILES.wissen} + Änderungen in der App` : FILES.wissen;
    } else if (!wissenLokal()) {
      state.wissen = datei.data;
      lsSet(LS.wissen, datei.data); lsSet(LS.wissenBasis, datei.hash);
      state.wissenQuelle = FILES.wissen;
      if (basis) state.meldungen.push({ art: 'info', text: `Wissen aktualisiert auf Version ${datei.data.version || '?'} (Stand ${datei.data.stand || '?'}).` });
    } else {
      state.wissen = lokal;
      state.wissenQuelle = 'Arbeitskopie mit Änderungen in der App';
      state.neueWissenDatei = datei;
      state.meldungen.push({
        art: 'warn',
        text: `Neue wissen.json liegt bereit (Version ${datei.data.version || '?'}, Stand ${datei.data.stand || '?'}). Du hast das Wissen in der App geändert – beim Übernehmen gehen diese Änderungen verloren. Vorher unter „Dateien“ exportieren.`,
        aktion: { act: 'wissen-uebernehmen', label: 'Neue Datei übernehmen' },
      });
    }
  } else if (lokal) {
    state.wissen = lokal;
    state.wissenQuelle = 'Arbeitskopie im Browser';
    if (datei.kaputt) state.meldungen.push({ art: 'err', text: `wissen.json ist ${datei.error}. Verwende die letzte funktionierende Version.` });
  } else {
    state.wissen = {};
    state.wissenQuelle = 'nichts geladen';
    state.meldungen.push({
      art: 'err',
      text: datei.kaputt
        ? `wissen.json ist ${datei.error}.`
        : `wissen.json konnte nicht gelesen werden (${datei.error}). Beim Öffnen per Doppelklick (file://) blockiert der Browser das – unter „Dateien“ von Hand laden oder einen lokalen Webserver starten (siehe README).`,
    });
  }
  state.wissen = normalizeWissen(state.wissen);
}

/** katalog.json ist optional: Hinweise wie num_inherents für Uniques. */
async function loadKatalog() {
  const r = await fetchJson(FILES.katalog);
  let k = null;
  if (r.ok) { k = r.data; lsSet(LS.katalog, k); state.katalogQuelle = FILES.katalog; }
  else {
    k = lsGet(LS.katalog, null);
    state.katalogQuelle = k ? 'Arbeitskopie im Browser' : `nicht geladen (${r.error})`;
  }
  k = Object.assign({}, k || {});
  if (!Array.isArray(k.uniques)) k.uniques = [];
  state.katalog = k;
}

async function loadProfil() {
  const lokal = lsGet(LS.profil, null);
  if (lokal) {
    state.profil = normalizeProfil(lokal);
    state.profilQuelle = 'Browser (localStorage)';
    return;
  }
  // Erster Start: profil.json → sonst profil-leer.json → sonst leeres Profil
  let src = await fetchJson(FILES.profil);
  state.profilQuelle = FILES.profil;
  if (!src.ok) {
    src = await fetchJson(FILES.profilLeer);
    state.profilQuelle = `neu aus ${FILES.profilLeer}`;
  }
  let p = src.ok ? src.data : { schemaVersion: SCHEMA };
  if (!src.ok) state.profilQuelle = 'neues leeres Profil';

  // Builds aus Schema 1 (alte Version der App) übernehmen, wenn vorhanden
  const alt = lsGet(LS.altBuilds, null);
  if (Array.isArray(alt) && alt.length) {
    p = Object.assign({}, p, {
      builds: alt,
      aktiverBuild: lsGet(LS.altAktiv, '') || '',
      zielBuild: lsGet(LS.altZiel, '') || '',
    });
    state.meldungen.push({ art: 'info', text: `${alt.length} Build(s) aus der alten App-Version ins Profil übernommen.` });
  }
  state.profil = normalizeProfil(p);
  saveProfil();
}

function pruefeSchema() {
  if (state.wissenQuelle === 'nichts geladen') return;   // dazu gibt es schon eine Meldung
  const ws = state.wissen.schemaVersion, ps = state.profil.schemaVersion;
  const probleme = [];
  if (ws !== SCHEMA) probleme.push(`wissen.json hat schemaVersion ${ws ?? 'fehlt'}`);
  if (ps !== SCHEMA) probleme.push(`profil.json hat schemaVersion ${ps ?? 'fehlt'}`);
  if (probleme.length || ws !== ps) {
    state.meldungen.push({
      art: 'warn',
      text: `Schema passt nicht zusammen: ${probleme.join(', ') || `wissen ${ws} ≠ profil ${ps}`}. Die App erwartet ${SCHEMA}. Es wird angezeigt, was lesbar ist – Ergebnisse können unvollständig sein.`,
    });
  }
}

/* ================================================================
   Wissen-Zugriff
   ================================================================ */

const buildById = id => state.profil.builds.find(b => b.id === id) || null;
const aktivBuild = () => buildById(state.profil.aktiverBuild);
const zielBuild = () => buildById(state.profil.zielBuild);

function verdiktInfo(id) {
  const n = norm(id);
  if (!n) return null;
  const v = state.wissen.verdikte.find(x => norm(x.id) === n);
  return v ? { id: v.id, farbe: v.farbe, text: v.text || '' } : { id: String(id).toUpperCase(), farbe: '', text: 'Nicht in wissen.json → verdikte' };
}
function safeColor(c) {
  return /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i.test(c || '') ? c : '';
}
function textColorFor(c) {
  const m = /^#([0-9a-f]{6})/i.exec(c || '') || /^#([0-9a-f]{3})$/i.exec(c || '');
  if (!m) return '#fff';
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#1a120b' : '#fff';
}
function verdiktHtml(id, big) {
  const v = verdiktInfo(id);
  if (!v) return `<span class="verdikt v-none${big ? ' big' : ''}">KEIN VERDIKT</span>`;
  const bg = safeColor(v.farbe) || '#5c5249';
  return `<span class="verdikt${big ? ' big' : ''}" style="background:${bg};color:${textColorFor(bg)}" title="${esc(v.text)}">${esc(v.id)}</span>`;
}
const istVerdikt = (a, b) => norm(a) === norm(b);

/* ---------- Seltenheit (Logik in lib.js) ---------- */

const selKanon = w => seltenheitKanon(state.wissen, w);

function seltenheitAnzeige(id) {
  const s = state.wissen.seltenheitSynonyme.find(x => x.id === id);
  return s ? bi(s.name_de, s.name_en) : id;
}

/** Zerlegt eine Suche in Seltenheiten und restliche Wörter. */
function analysiere(q) {
  let rest = q.split(' ').filter(Boolean);
  const selt = new Set();
  // mehrwortige Synonyme zuerst
  for (const s of state.wissen.seltenheitSynonyme) {
    for (const syn of s.synonyme) {
      const n = norm(syn);
      if (n.includes(' ') && hasWords(rest.join(' '), n)) {
        selt.add(s.id);
        rest = (' ' + rest.join(' ') + ' ').replace(' ' + n + ' ', ' ').trim().split(' ').filter(Boolean);
      }
    }
  }
  rest = rest.filter(t => { const id = seltenheitAus(state.wissen, t); if (id) { selt.add(id); return false; } return true; });
  const typWerte = alleTypWerte();
  const typErkannt = rest.some(t => typWerte.some(v => wordEq(t, v)));
  return { q, selt, rest, typErkannt };
}

let TYPWERTE_CACHE = null;
function alleTypWerte() {
  if (TYPWERTE_CACHE) return TYPWERTE_CACHE;
  const set = new Set();
  const add = x => asArray(x).forEach(v => tokens(v).forEach(t => t !== '*' && set.add(t)));
  state.wissen.regeln.forEach(r => { add(r.trifft?.typ); add(r.trifft?.itemTyp); });
  state.wissen.eintraege.forEach(e => { add(e.typ); add(e.itemTyp); });
  TYPWERTE_CACHE = [...set];
  return TYPWERTE_CACHE;
}

/* ---------- Quellen ---------- */


/* ================================================================
   Suchindex
   ================================================================ */

let INDEX = [];

function entryKeys(e) {
  return [e.name_de, e.name_en, e.name, ...asArray(e.aliase)].map(norm).filter(Boolean);
}

function buildIndex() {
  TYPWERTE_CACHE = null;
  const w = state.wissen;
  INDEX = w.eintraege.map((e, i) => ({
    kind: 'eintrag', index: i, src: e,
    anzeige: bi(e.name_de || e.name, e.name_en), keys: entryKeys(e),
  })).filter(x => x.keys.length);

  // Namen, die nur in Builds, Listen oder als Regel-Ausnahme vorkommen, trotzdem findbar machen
  const known = n => INDEX.some(e => e.keys.some(k => hasWords(n, k)));
  const addName = (text, herkunft) => {
    text = String(text || '').trim();
    const n = norm(text);
    if (!n) return;
    const vorhanden = INDEX.find(e => e.kind === 'name' && e.keys[0] === n);
    if (vorhanden) { if (!vorhanden.herkunft.includes(herkunft)) vorhanden.herkunft.push(herkunft); return; }
    if (known(n)) return;
    INDEX.push({ kind: 'name', src: {}, anzeige: text, keys: [n], herkunft: [herkunft] });
  };
  for (const b of state.profil.builds) {
    for (const s of SLOTS) {
      const sl = b.slots[s.key];
      addName(sl.zielItem, 'Build');
      addName(sl.zielAspekt, 'Build');
      splitParts(sl.sockel).forEach(p => addName(p, 'Build'));
    }
  }
  state.profil.sammelliste.forEach(x => addName(itemText(x), 'Sammelliste'));
  w.farmziele.forEach(f => asArray(f.belohnungen).forEach(x => addName(itemText(x), 'Farm-Belohnung')));
  w.rezepte.forEach(r => asArray(r.ergebnis).forEach(x => addName(itemText(x), 'Würfel-Ergebnis')));
  w.regeln.forEach(r => asArray(r.ausnahmen).forEach(x => addName(itemText(x), 'Regel-Ausnahme')));
}

function nameScore(keys, q, qTokens) {
  let best = 0;
  for (const k of keys) {
    if (k === q) return 100;
    if (phraseEq(k, q)) best = Math.max(best, 95);
    else if (k.startsWith(q)) best = Math.max(best, 85);
    else if (hasWords(k, q) || phraseIn(k, q)) best = Math.max(best, 75);
    else if (q.length >= 3 && k.includes(q)) best = Math.max(best, 55);
    else if (qTokens.length > 1 && qTokens.every(t => k.split(' ').some(kt => wordEq(kt, t) || (t.length >= 3 && kt.startsWith(t))))) best = Math.max(best, 45);
  }
  return best;
}

/* ---------- Regeln ---------- */

const istFallback = r => asArray(r.trifft?.typ).some(t => String(t).trim() === '*');

function trifftScore(r, qa) {
  const t = r.trifft || {};
  const typVals = [...asArray(t.typ), ...asArray(t.itemTyp)].filter(v => String(v).trim() !== '*');
  if (!typVals.length) return 0;
  const typTokens = typVals.flatMap(tokens);
  if (!qa.rest.some(tok => typTokens.some(v => wordEq(tok, v)))) return 0;
  const sel = asArray(t.seltenheit).map(selKanon);
  if (qa.selt.size) {
    if (!sel.length) return 65;
    return [...qa.selt].every(s => sel.includes(s)) ? 85 : 0;
  }
  return sel.length ? 60 : 70;
}

function suchbegriffScore(r, q) {
  let best = 0;
  for (const sb of asArray(r.suchbegriffe)) {
    const n = norm(sb);
    if (!n) continue;
    if (n === q) return 100;
    if (phraseEq(n, q)) best = Math.max(best, 95);
    else if (phraseIn(q, n) || phraseIn(n, q)) best = Math.max(best, 70);
  }
  return best;
}

function regelnFuerSuche(qa) {
  const hits = [];
  for (const r of state.wissen.regeln) {
    if (istFallback(r)) continue;
    const s = Math.max(suchbegriffScore(r, qa.q), trifftScore(r, qa));
    if (s > 0) hits.push({ r, s });
  }
  if (!hits.length && (qa.selt.size || qa.typErkannt)) {
    for (const r of state.wissen.regeln) {
      if (!istFallback(r)) continue;
      const sel = asArray(r.trifft?.seltenheit).map(selKanon);
      if (sel.length && !(qa.selt.size && [...qa.selt].every(s => sel.includes(s)))) continue;
      hits.push({ r, s: 30, fallback: true });
    }
  }
  return hits.sort((a, b) => b.s - a.s);
}

/** Ist ein Name eine Ausnahme dieser Regel? */
function istAusnahme(r, keys) {
  return asArray(r.ausnahmen).some(a => { const n = norm(itemText(a)); return keys.some(k => k === n || phraseEq(k, n)); });
}

/** Regel für einen benannten Eintrag ohne eigenes Verdikt – über typ/itemTyp/seltenheit. */
function regelFuerEintrag(e, imBuild) {
  const keys = entryKeys(e);
  const typT = [...asArray(e.typ), ...asArray(e.itemTyp)].flatMap(tokens);
  const selt = selKanon(e.seltenheit);
  const passt = r => {
    const t = r.trifft || {};
    if (t.nichtImBuild === true && imBuild) return false;
    if (istAusnahme(r, keys)) return false;
    const sel = asArray(t.seltenheit).map(selKanon);
    if (sel.length && !sel.includes(selt)) return false;
    return true;
  };
  for (const r of state.wissen.regeln) {
    if (istFallback(r) || !passt(r)) continue;
    const vals = [...asArray(r.trifft?.typ), ...asArray(r.trifft?.itemTyp)].flatMap(tokens);
    if (vals.length && typT.some(t => vals.some(v => wordEq(t, v)))) return r;
  }
  return state.wissen.regeln.find(r => istFallback(r) && passt(r)) || null;
}

/* ================================================================
   Bewertung
   ================================================================ */

const SLOT_FELDER = [['zielItem', 'Ziel-Item'], ['zielAspekt', 'Aspekt'], ['sockel', 'Sockel']];

function buildRefs(b, keys) {
  if (!b || !keys.length) return [];
  const refs = [];
  for (const s of SLOTS) {
    const sl = b.slots[s.key];
    for (const [feld, label] of SLOT_FELDER) {
      const parts = feld === 'sockel' ? splitParts(sl[feld]) : [sl[feld]];
      if (parts.some(p => { const n = norm(p); return n && keys.some(k => hasWords(n, k)); })) {
        refs.push({ slot: s, feld: label });
      }
    }
  }
  return refs;
}
const refText = refs => refs.map(r => `${r.slot.de} (${r.feld})`).join(', ');

function buildBezug(keys) {
  const ab = aktivBuild(), zb = zielBuild();
  const a = buildRefs(ab, keys), z = buildRefs(zb, keys);
  return { a, z, ab, zb, inA: a.length > 0, inZ: z.length > 0 };
}

function badgeHtml(bz) {
  if (bz.inA && bz.inZ) return '<span class="badge both">für beide</span>';
  if (bz.inA) return '<span class="badge aktiv">für aktuellen Build</span>';
  if (bz.inZ) return '<span class="badge ziel">für Ziel-Build</span>';
  return '<span class="badge none">in keinem Build</span>';
}
function bezugDetail(bz) {
  const parts = [];
  if (bz.inA) parts.push(`${bz.ab.name}: ${refText(bz.a)}`);
  if (bz.inZ && bz.zb !== bz.ab) parts.push(`${bz.zb.name}: ${refText(bz.z)}`);
  return parts.join(' · ');
}

function abweichungFuer(keys, regelId) {
  return state.profil.abweichungen.find(a => {
    const n = norm(a.bezug);
    if (!n) return false;
    if (regelId && n === norm(regelId)) return true;
    return keys.some(k => k === n);
  }) || null;
}

/**
 * Verdikt in drei Stufen: Grundlage (Eintrag/Regel) → eigene Abweichung (Profil) → Build-Übersteuerung.
 */
function endVerdikt(basis, abw, bz) {
  const zeilen = [];
  let v = basis;
  if (abw && abw.verdikt) {
    zeilen.push({ art: 'abw', text: `Eigene Abweichung: ${abw.verdikt}${basis && !istVerdikt(basis, abw.verdikt) ? ` statt ${basis}` : ''}${abw.begruendung ? ` – ${abw.begruendung}` : ''}` });
    v = abw.verdikt;
  }
  if (bz && (bz.inA || bz.inZ) && !istVerdikt(v, 'BEHALTEN') && !istVerdikt(v, 'ANLEGEN')) {
    const wo = bz.inA && bz.inZ ? 'in beiden Builds' : bz.inA ? 'im aktuellen Build' : 'im Ziel-Build';
    zeilen.push({ art: 'build', text: v ? `BEHALTEN statt ${v} – wird ${wo} gebraucht` : `BEHALTEN – wird ${wo} gebraucht` });
    v = 'BEHALTEN';
  }
  return { verdikt: v, zeilen };
}

function quellenFuer(keys, eigene) {
  const out = [];
  if (eigene) asArray(eigene).forEach(q => { const t = quelleText(state.wissen, q); if (t) out.push(t); });
  for (const f of state.wissen.farmziele) {
    const hit = asArray(f.belohnungen).some(x => { const n = norm(itemText(x)); return keys.some(k => hasWords(n, k)); });
    if (!hit) continue;
    const t = farmQuelle(state.wissen, f);
    if (!t) continue;
    const plain = norm(t.replace(/\s*\[.*\]$/, ''));
    const dup = out.findIndex(o => { const po = norm(o.replace(/\s*\[.*\]$/, '')); return po === plain || hasWords(plain, po); });
    if (dup >= 0) out[dup] = t; else out.push(t);
  }
  return out;
}

function rezepteFuer(keys, ids) {
  ids = asArray(ids);
  const touches = x => { const n = norm(listText(x)); return keys.some(k => hasWords(n, k)); };
  return state.wissen.rezepte.map(r => {
    let rolle = '';
    if (r.id && ids.includes(r.id)) rolle = 'verknüpft';
    else if (touches(r.ergebnis)) rolle = 'Ergebnis';
    else if (touches(r.input)) rolle = 'Zutat';
    else if (touches(r.kosten)) rolle = 'Material';
    return rolle ? { r, rolle } : null;
  }).filter(Boolean);
}

function notizenFuer(typen, qa) {
  const typT = typen.flatMap(tokens);
  return state.wissen.notizen.filter(n => {
    if (asArray(n.typen).flatMap(tokens).some(t => typT.some(x => wordEq(t, x)))) return true;
    return asArray(n.schlagworte).some(sw => {
      const s = norm(sw);
      if (!s) return false;
      return s.includes(' ') ? phraseIn(qa.q, s) : qa.q.split(' ').some(t => wordEq(t, s));
    });
  });
}

/* ================================================================
   Rendering: Rahmen
   ================================================================ */

function setTab(tab) {
  state.tab = tab;
  state.editor = null;
  state.importOpen = false;
  state.eintragEditor = null;
  state.dateienOpen = false;
  schliesseInvEditor();
  render();
  window.scrollTo(0, 0);
}

function renderHeader() {
  const w = state.wissen;
  const alt = istAlt(w.stand);
  $('#wissen-meta').innerHTML = `Wissen v${esc(w.version || '?')} · Stand ${esc(w.stand || '?')}` +
    (ageDays(w.stand) > 0 ? ` (vor ${ageDays(w.stand)} T.)` : '') + (alt ? ' ' + staleIcon(w.stand) : '');
  const ab = aktivBuild(), zb = zielBuild();
  $('#build-info').innerHTML =
    `Aktiv: <b>${esc(ab ? ab.name : '–')}</b>${ab ? staleIcon(ab.datum) : ''} · Ziel: <b>${esc(zb ? zb.name : '–')}</b>${zb ? staleIcon(zb.datum) : ''}`;
  document.querySelectorAll('#tabs button').forEach(b =>
    b.classList.toggle('active', !state.dateienOpen && b.dataset.tab === state.tab));
  $('#btn-dateien').classList.toggle('active', state.dateienOpen);

  $('#banner').innerHTML = state.meldungen.map((m, i) =>
    `<div class="msg ${m.art}">${esc(m.text)}
      ${m.aktion ? `<button class="btn" data-act="${m.aktion.act}">${esc(m.aktion.label)}</button>` : ''}
      <button class="msg-x" data-act="msg-x" data-i="${i}" aria-label="Hinweis schließen">×</button></div>`).join('');
}

function render() {
  renderHeader();
  const main = $('#main');
  if (state.dateienOpen) { main.innerHTML = viewDateien(); return; }
  switch (state.tab) {
    case 'builds': main.innerHTML = state.editor ? viewEditor() : state.importOpen ? viewImport() : viewBuilds(); break;
    case 'checkliste': main.innerHTML = viewCheckliste(); break;
    case 'rezepte': main.innerHTML = viewRezepte(); break;
    case 'farmziele': main.innerHTML = viewFarmziele(); break;
    case 'wissen': main.innerHTML = state.eintragEditor ? viewEintragEditor() : viewWissen(); break;
    case 'abweichungen': main.innerHTML = viewAbweichungen(); break;
    case 'inventar': main.innerHTML = state.invEditor ? viewInvEditor() : viewInventar(); break;
    case 'naechster': main.innerHTML = viewNaechster(); break;
    default:
      if (state.eintragEditor) main.innerHTML = viewEintragEditor();
      else renderSuche(main);
  }
}

/* ================================================================
   Ansicht: Suche
   ================================================================ */

function renderSuche(main) {
  main.innerHTML = `
    <div class="search-wrap">
      <input id="q" class="search" type="search" autocomplete="off" autocapitalize="off" spellcheck="false"
        placeholder="Item, Rune, Kategorie … (DE/EN)" value="${esc(state.query)}" autofocus>
    </div>
    <div id="results"></div>`;
  const input = $('#q');
  input.addEventListener('input', () => { state.query = input.value; renderResults(); });
  renderResults();
  input.focus();
}

function renderResults() {
  const box = $('#results');
  if (!box) return;
  const q = norm(state.query);
  if (!q) { box.innerHTML = viewSammelliste(); return; }

  const qa = analysiere(q);
  const qTokens = q.split(' ');
  const nameHits = INDEX.map(e => ({ e, s: nameScore(e.keys, q, qTokens) })).filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.anzeige.localeCompare(b.e.anzeige, 'de'));
  const stark = nameHits.filter(x => x.s >= 75);
  const cards = [];
  const gezeigt = new Set();   // Notizen nur einmal zeigen

  if (stark.some(x => x.e.kind === 'eintrag')) {
    // a) Treffer in eintraege (plus gleich gute Namen aus Builds/Listen)
    stark.slice(0, 15).forEach(x => cards.push(cardName(x.e, qa, gezeigt)));
  } else {
    // b) Regeln
    const regeln = regelnFuerSuche(qa);
    regeln.slice(0, 6).forEach(x => cards.push(cardRegel(x.r, qa, gezeigt, x.fallback)));
    // Namen, die nur in Builds/Listen stehen
    const namen = nameHits.filter(x => x.e.kind === 'name' && x.s >= 75).slice(0, 8);
    namen.forEach(x => cards.push(cardName(x.e, qa, gezeigt)));
    // c) nichts erfasst
    if (!regeln.length && !namen.some(x => x.s >= 95)) cards.unshift(cardLeer(state.query.trim(), qa, gezeigt));
    // schwächere Namenstreffer
    const schwach = nameHits.filter(x => !namen.includes(x)).slice(0, 8);
    if (schwach.length) {
      cards.push(`<h3 class="muted small">Ähnliche Einträge</h3>`);
      schwach.forEach(x => cards.push(cardName(x.e, qa, gezeigt)));
    }
  }
  box.innerHTML = cards.join('');
}

function notizenHtml(typen, qa, gezeigt) {
  const n = notizenFuer(typen, qa).filter(x => !gezeigt.has(x));
  n.forEach(x => gezeigt.add(x));
  if (!n.length) return '';
  return `<div class="notes">${n.map(x => notizKarte(x)).join('')}</div>`;
}
function notizKarte(n, i) {
  return `<details class="note"${typeof i === 'number' ? ` id="notiz-${i}"` : ''}><summary>${esc(n.frage || '(ohne Frage)')} ${staleIcon(n.stand)}</summary>
    <div class="note-body">${n.antwort ? esc(n.antwort).replace(/\n/g, '<br>') : '<span class="muted">Noch keine Antwort eingetragen.</span>'}
    ${asArray(n.typen).length || asArray(n.schlagworte).length ? `<div class="small muted" style="margin-top:6px">
      ${asArray(n.typen).map(t => `<span class="tag">${esc(t)}</span>`).join('')}
      ${asArray(n.schlagworte).map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
    ${n.stand ? `<div class="small muted">Stand ${esc(n.stand)}</div>` : ''}</div></details>`;
}

function zeilenHtml(zeilen) {
  return zeilen.map(z => `<div class="override ${z.art}">${esc(z.text)}</div>`).join('');
}

function extraRows(keys, quellenRoh, rezeptIds) {
  const rows = [];
  const quellen = quellenFuer(keys, quellenRoh);
  if (quellen.length) rows.push(`<div><span class="k">Quelle</span>${esc(quellen.join(' · '))}</div>`);
  for (const { r, rolle } of rezepteFuer(keys, rezeptIds)) {
    rows.push(`<div><span class="k">Würfel</span><b>${esc(bi(r.name_de || r.name, r.name_en) || r.id || 'Rezept')}</b> <span class="muted">(${esc(rolle)})</span> ${staleIcon(r.stand)}<br>
      ${r.input ? `Input: ${esc(listText(r.input))}<br>` : ''}
      ${r.kosten ? `Kosten: ${esc(listText(r.kosten))}<br>` : ''}
      ${r.ergebnis ? `Ergebnis: ${esc(listText(r.ergebnis))}` : ''}</div>`);
  }
  return rows;
}

function ausnahmeVonHtml(keys) {
  return state.wissen.regeln.filter(r => istAusnahme(r, keys)).map(r =>
    `<div><span class="k">Ausnahme</span>von Regel <b>${esc(r.id)}</b>${r.verdikt ? ` (dort: ${esc(r.verdikt)})` : ''}${r.ausnahmeText ? ` – ${esc(r.ausnahmeText)}` : ''}</div>`).join('');
}

/** Treffer über einen Namen (Eintrag oder nur aus Build/Liste bekannt). */
function cardName(e, qa, gezeigt) {
  const src = e.src;
  const bz = buildBezug(e.keys);
  let basis = '', grund = '', regelHinweis = '';
  if (e.kind === 'eintrag') {
    basis = src.verdikt || '';
    grund = src.begruendung || '';
    if (!basis) {
      const r = regelFuerEintrag(src, bz.inA || bz.inZ);
      if (r) { basis = r.verdikt || ''; grund = r.begruendung || ''; regelHinweis = `laut Regel ${r.id}`; }
    }
  }
  const abw = abweichungFuer(e.keys);
  const ev = endVerdikt(basis, abw, bz);
  const typen = e.kind === 'eintrag' ? [src.typ, src.itemTyp].filter(Boolean) : [];
  const meta = [src.typ, src.itemTyp, src.seltenheit ? seltenheitAnzeige(selKanon(src.seltenheit)) : ''].filter(Boolean);

  const rows = [];
  rows.push(`<div><span class="k">Build</span>${badgeHtml(bz)} ${esc(bezugDetail(bz))}</div>`);
  const andere = state.profil.builds.filter(b => b !== bz.ab && b !== bz.zb)
    .map(b => ({ b, refs: buildRefs(b, e.keys) })).filter(x => x.refs.length);
  if (andere.length) rows.push(`<div><span class="k">Auch in</span>${andere.map(x => esc(`${x.b.name} (${refText(x.refs)})`)).join('; ')} <span class="muted">– weder aktiv noch Ziel</span></div>`);
  rows.push(ausnahmeVonHtml(e.keys));
  rows.push(...extraRows(e.keys, src.quelle, src.rezepte));
  if (src.notiz) rows.push(`<div><span class="k">Notiz</span>${esc(src.notiz)}</div>`);

  const leer = e.kind !== 'eintrag';
  return `<div class="card">
    <div class="res-head">${verdiktHtml(ev.verdikt, true)}
      <span class="res-name">${esc(e.anzeige)}</span> ${staleIcon(src.stand)}</div>
    <div class="res-typ">${leer ? `Kein Eintrag – noch nicht erfasst · bekannt aus ${esc(e.herkunft.join(', '))}` : esc(['Eintrag', ...meta].join(' · '))}${regelHinweis ? ` · ${esc(regelHinweis)}` : ''}</div>
    ${zeilenHtml(ev.zeilen)}
    ${grund ? `<p class="res-reason">${ev.zeilen.length ? '<span class="muted">Ursprünglich:</span> ' : ''}${esc(grund)}</p>` : ''}
    <div class="res-rows">${rows.join('')}</div>
    ${leer ? `<div class="btn-row"><button class="btn" data-act="rohling" data-name="${esc(e.anzeige)}">Als Eintrag anlegen</button></div>`
      : `<div class="btn-row"><button class="btn small-btn" data-act="eintrag-edit" data-i="${e.index}">Eintrag bearbeiten</button></div>`}
    ${notizenHtml(typen, qa, gezeigt)}
  </div>`;
}

function trifftHtml(t) {
  const parts = Object.entries(t || {}).map(([k, v]) => {
    let val;
    if (typeof v === 'boolean') val = v ? 'ja' : 'nein';
    else if (k === 'seltenheit') val = asArray(v).map(x => seltenheitAnzeige(selKanon(x))).join(', ');
    else val = asArray(v).join(', ');
    return `${TRIFFT_LABEL[k] || k}: ${val}`;
  });
  return parts.join(' · ');
}

function cardRegel(r, qa, gezeigt, fallback) {
  const ausn = asArray(r.ausnahmen).map(itemText).filter(Boolean);
  // Build-Bezug einer Kategorie = Bezug ihrer Ausnahmen
  const ausnBz = ausn.map(a => ({ a, bz: buildBezug([norm(a)]) }));
  const inA = ausnBz.some(x => x.bz.inA), inZ = ausnBz.some(x => x.bz.inZ);
  const abw = abweichungFuer([], r.id);
  const ev = endVerdikt(r.verdikt || '', abw, null);
  const typen = [...asArray(r.trifft?.typ), ...asArray(r.trifft?.itemTyp)].filter(x => x !== '*');

  const rows = [];
  rows.push(`<div><span class="k">Build</span>${badgeHtml({ inA, inZ })}${ausn.length ? ' <span class="muted small">(über die Ausnahmen)</span>' : ''}</div>`);
  const bed = trifftHtml(r.trifft);
  if (bed) rows.push(`<div><span class="k">Gilt für</span>${esc(bed)}</div>`);
  if (ausn.length) {
    rows.push(`<div class="ausnahmen"><span class="k">Ausnahmen</span>${r.ausnahmeText ? `<b>${esc(r.ausnahmeText)}</b>` : ''}
      <ul>${ausnBz.map(({ a, bz }) => `<li>${esc(a)} ${bz.inA || bz.inZ ? badgeHtml(bz) : ''}</li>`).join('')}</ul></div>`);
  }
  if (r.notiz) rows.push(`<div><span class="k">Notiz</span>${esc(r.notiz)}</div>`);

  return `<div class="card">
    <div class="res-head">${verdiktHtml(ev.verdikt, true)}
      <span class="res-name">${esc(state.query.trim())}</span> ${staleIcon(r.stand)}</div>
    <div class="res-typ">${fallback ? 'Fallback-Regel' : 'Regel'} · ${esc(r.id)}</div>
    ${zeilenHtml(ev.zeilen)}
    ${r.begruendung ? `<p class="res-reason">${ev.zeilen.length ? '<span class="muted">Ursprünglich:</span> ' : ''}${esc(r.begruendung)}</p>` : ''}
    <div class="res-rows">${rows.join('')}</div>
    ${notizenHtml(typen, qa, gezeigt)}
  </div>`;
}

function cardLeer(text, qa, gezeigt) {
  const bz = buildBezug([norm(text)]);
  const ev = endVerdikt('', abweichungFuer([norm(text)]), bz);
  return `<div class="card">
    <div class="res-head">${verdiktHtml(ev.verdikt, true)}<span class="res-name">${esc(text)}</span></div>
    <div class="res-typ">Kein Eintrag – noch nicht erfasst</div>
    ${zeilenHtml(ev.zeilen)}
    <div class="res-rows"><div><span class="k">Build</span>${badgeHtml(bz)}</div></div>
    <div class="btn-row"><button class="btn" data-act="rohling" data-name="${esc(text)}">Als Eintrag anlegen</button></div>
    ${notizenHtml([], qa, gezeigt)}
  </div>`;
}

/* ---------- Sammelliste (Startseite) ---------- */

function viewSammelliste() {
  const list = state.profil.sammelliste;
  const items = list.map((x, i) => {
    const text = itemText({ name_de: x.name_de || x.name, name_en: x.name_en });
    return `<div class="check${x.erledigt ? ' done' : ''}">
      <input type="checkbox" data-act="sammel" data-i="${i}" ${x.erledigt ? 'checked' : ''} aria-label="erledigt">
      <span class="ct">${esc(text)}${x.notiz ? `<br><span class="small muted">${esc(x.notiz)}</span>` : ''}</span>
      <button class="icon-btn" data-act="sammel-del" data-i="${i}" aria-label="Entfernen">×</button></div>`;
  }).join('');
  return `
    <h2>Sammelliste</h2>
    ${items ? `<div class="card">${items}</div>` : '<p class="small muted">Leer. Hier landet, was du gerade aufheben willst.</p>'}
    <form class="add-row" data-form="sammel-add">
      <input type="text" name="text" placeholder="Hinzufügen … (z. B. Name DE / Name EN)" autocomplete="off">
      <button class="btn" type="submit">+</button>
    </form>
    <p class="small muted">${state.wissen.eintraege.length} Einträge · ${state.wissen.regeln.length} Regeln · ${state.wissen.notizen.length} Notizen im Wissen.</p>`;
}

/* ================================================================
   Ansicht: Builds
   ================================================================ */

function viewBuilds() {
  const p = state.profil;
  const cards = p.builds.map(b => {
    const age = ageDays(b.datum);
    const alt = istAlt(b.datum);
    const url = safeUrl(b.quelleUrl);
    const wk = b.wechselkriterien;
    const wkDone = wk.filter(w => w.erledigt).length;
    const slotRows = SLOTS.map(s => {
      const sl = b.slots[s.key];
      const parts = [];
      if (sl.zielItem) parts.push(`<b>${esc(sl.zielItem)}</b>`);
      if (sl.zielAspekt) parts.push(`Aspekt: ${esc(sl.zielAspekt)}`);
      if (sl.sockel) parts.push(`Sockel: ${esc(sl.sockel)}`);
      if (sl.affixe.length) parts.push(`Affixe: ${esc(sl.affixe.join(' > '))}`);
      if (sl.haertung) parts.push(`Härtung: ${esc(sl.haertung)}`);
      if (!parts.length) return '';
      return `<tr><td>${esc(s.de)}${sl.erledigt ? ' ✓' : ''}</td><td>${parts.join('<br>')}</td></tr>`;
    }).join('');

    return `<div class="card">
      <div class="res-head">
        <span class="res-name">${esc(b.name || '(ohne Namen)')}</span>
        ${b.id === p.aktiverBuild ? '<span class="badge aktiv">AKTIV</span>' : ''}
        ${b.id === p.zielBuild ? '<span class="badge ziel">ZIEL</span>' : ''}
        ${staleIcon(b.datum)}
      </div>
      <div class="kv small">
        ${b.klasse ? `<span class="k">Klasse:</span> ${esc(b.klasse)} · ` : ''}
        <span class="k">Stand:</span> ${esc(b.datum || '–')}${age != null ? ` (vor ${age} Tagen)` : ''}
        ${url ? `<br><span class="k">Quelle:</span> <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>` : b.quelleUrl ? `<br><span class="k">Quelle:</span> ${esc(b.quelleUrl)}` : ''}
        ${b.notiz ? `<br>${esc(b.notiz)}` : ''}
      </div>
      ${alt ? `<div class="msg warn">Älter als ${warnTage()} Tage – prüfe, ob der Guide noch aktuell ist, und aktualisiere das Datum.</div>` : ''}
      <div class="btn-row">
        ${b.id !== p.aktiverBuild ? `<button class="btn" data-act="set-aktiv" data-id="${esc(b.id)}">Als aktiv</button>` : ''}
        ${b.id !== p.zielBuild ? `<button class="btn" data-act="set-ziel" data-id="${esc(b.id)}">Als Ziel</button>` : `<button class="btn" data-act="unset-ziel">Ziel entfernen</button>`}
        <button class="btn" data-act="edit" data-id="${esc(b.id)}">Bearbeiten</button>
        <button class="btn" data-act="dup" data-id="${esc(b.id)}">Duplizieren</button>
        <button class="btn danger" data-act="del" data-id="${esc(b.id)}">Löschen</button>
      </div>
      ${slotRows ? `<details><summary class="small muted">Slots anzeigen</summary><table class="slots">${slotRows}</table></details>` : '<p class="small muted">Noch keine Slots ausgefüllt.</p>'}
      <h3>Wechselkriterien ${wk.length ? `<span class="muted small">${wkDone}/${wk.length}</span>` : ''}</h3>
      ${wk.length ? `
        <div class="progress"><span style="width:${Math.round(wkDone / wk.length * 100)}%"></span></div>
        ${wkDone === wk.length ? '<div class="msg info">Alle Kriterien erfüllt – bereit zum Umstieg.</div>' : ''}
        ${wk.map((w, i) => `<label class="check${w.erledigt ? ' done' : ''}">
          <input type="checkbox" data-act="wk" data-id="${esc(b.id)}" data-i="${i}" ${w.erledigt ? 'checked' : ''}>
          <span class="ct">${esc(w.text)}</span></label>`).join('')}`
        : '<p class="small muted">Keine Kriterien. Unter „Bearbeiten“ festlegen, was vor dem Umstieg da sein muss.</p>'}
    </div>`;
  }).join('');

  return `
    <div class="btn-row">
      <button class="btn primary" data-act="new">+ Neuer Build</button>
      <button class="btn" data-act="open-import">Guide-Text einfügen</button>
    </div>
    ${cards || '<div class="msg info">Noch keine Builds. Lege einen an oder füge Text aus einem Build-Guide ein.</div>'}`;
}

/* ---------- Guide-Import ---------- */

function viewImport() {
  return `
    <h2>Guide-Text einfügen</h2>
    <p class="small muted">Text aus einem Build-Guide hineinkopieren. Erkannt werden Zeilen wie
      „Helm: …“, „Gloves - …“, „Ring 1: …“, dazu Aufzählungen darunter als Affixe sowie Zeilen mit
      „Aspect/Aspekt“, „Socket/Sockel/Gem/Rune“ und „Temper/Härtung“. Danach kommt eine Vorschau zum Korrigieren.</p>
    <label class="f">Build-Name<input type="text" id="imp-name" placeholder="optional – sonst erste Zeile"></label>
    <div class="grid2">
      <label class="f">Quelle-URL<input type="url" id="imp-url" placeholder="https://…"></label>
      <label class="f">Datum des Guides<input type="date" id="imp-datum" value="${today()}"></label>
    </div>
    <label class="f">Guide-Text<textarea id="imp-text" style="min-height:240px"></textarea></label>
    <div class="btn-row">
      <button class="btn primary" data-act="parse">Erkennen &amp; Vorschau</button>
      <button class="btn" data-act="cancel">Abbrechen</button>
    </div>`;
}

const SLOT_PATTERNS = [
  ['kopf', /^(helm|helmet|head|kopf|kopfschutz|haube)$/],
  ['brust', /^(chest|chest armor|chest armour|body|body armor|torso|brust|brustrustung|brustpanzer|rustung)$/],
  ['haende', /^(gloves|glove|hands|gauntlets|handschuhe|hande)$/],
  ['beine', /^(pants|legs|leggings|trousers|beine|hose|beinschutz)$/],
  ['fuesse', /^(boots|feet|shoes|fusse|stiefel|schuhe)$/],
  ['amulett', /^(amulet|amulett|neck|necklace|halskette)$/],
  ['ring1', /^(ring 1|ring one|ring i|erster ring)$/],
  ['ring2', /^(ring 2|ring two|ring ii|zweiter ring)$/],
  ['ring', /^(ring|rings|ringe)$/],
  ['waffe', /^(weapon|main hand|mainhand|main hand weapon|two handed|two handed weapon|2h|2h weapon|1h|1h weapon|one handed|waffe|haupthand|zweihand|zweihandwaffe|einhandwaffe|bludgeoning|slashing|bludgeoning weapon|slashing weapon|dual wield 1|dual wield|weapon 1)$/],
  ['fokus', /^(offhand|off hand|focus|shield|totem|fokus|nebenhand|schild|weapon 2|dual wield 2)$/],
];
function slotFromLabel(label) {
  const n = norm(label);
  if (!n || n.length > 30) return '';
  for (const [key, re] of SLOT_PATTERNS) if (re.test(n)) return key;
  return '';
}
/** Findet genau einen Eintrag aus wissen.json im Text → kanonische Anzeige "DE (EN)". */
function canonical(text) {
  const n = norm(text);
  const hits = INDEX.filter(e => e.kind === 'eintrag' && e.keys.some(k => k.length >= 3 && hasWords(n, k)));
  return hits.length === 1 ? { text: hits[0].anzeige, erkannt: true } : { text: String(text).trim(), erkannt: false };
}

const RE_ASPECT = /\b(aspect|aspekt)\b/i;
const RE_SOCKET = /\b(sockets?|sockel|gems?|edelsteine?|runes?|runen?)\b/i;
const RE_TEMPER = /\b(temper(ed|ing)?|hartung|härtung|gehartet|gehärtet)\b/i;
const RE_BULLET = /^\s*(?:[-–•*·▪►]|\d+[.)])\s*/;

function parseGuide(text) {
  const slots = {};
  SLOTS.forEach(s => { slots[s.key] = emptySlot(); });
  const unassigned = [];
  const erkannt = new Set();
  let current = '', waitingValue = false, url = '', firstLine = '';

  const setMain = (key, value) => {
    const sl = slots[key];
    const c = canonical(value);
    if (c.erkannt) erkannt.add(key + (RE_ASPECT.test(value) ? '.aspekt' : '.item'));
    if (RE_ASPECT.test(value) || RE_ASPECT.test(c.text)) {
      if (!sl.zielAspekt) sl.zielAspekt = c.text; else sl.affixe.push(c.text);
    } else if (!sl.zielItem) sl.zielItem = c.text;
    else unassigned.push(`${SLOT_BY_KEY[key].de}: ${value}`);
  };
  const resolveRing = () => (slots.ring1.zielItem || slots.ring1.zielAspekt ? 'ring2' : 'ring1');

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const u = line.match(/https?:\/\/\S+/);
    if (u && !url) { url = u[0].replace(/[)\].,]+$/, ''); continue; }

    const stripped = line.replace(RE_BULLET, '');
    const m = stripped.match(/^([^:\t|–]{1,30}?)\s*(?::|\t|\||\s[-–]\s)\s*(.+)$/);
    let key = m ? slotFromLabel(m[1]) : '';
    if (key) {
      if (key === 'ring') key = resolveRing();
      current = key; waitingValue = false;
      setMain(key, m[2]);
      continue;
    }
    let only = slotFromLabel(stripped.replace(/[:\-–]\s*$/, ''));
    if (only) {
      if (only === 'ring') only = resolveRing();
      current = only; waitingValue = true;
      continue;
    }
    if (!current) { if (!firstLine) firstLine = line; unassigned.push(line); continue; }

    const sl = slots[current];
    const value = m ? m[2] : stripped;
    if (RE_TEMPER.test(line)) {
      sl.haertung = [sl.haertung, m && RE_TEMPER.test(m[1]) ? m[2] : stripped].filter(Boolean).join(', ');
    } else if (RE_SOCKET.test(m ? m[1] : line) && !RE_ASPECT.test(line)) {
      sl.sockel = [sl.sockel, m ? m[2] : stripped].filter(Boolean).join(', ');
    } else if (waitingValue) {
      setMain(current, stripped);
      waitingValue = false;
    } else if (RE_ASPECT.test(line) && !sl.zielAspekt) {
      sl.zielAspekt = canonical(value).text;
    } else if (RE_BULLET.test(line)) {
      sl.affixe.push(stripped);
    } else {
      unassigned.push(line);
    }
  }
  return { slots, unassigned, url, firstLine, erkannt };
}

/* ---------- Build-Editor ---------- */

function startEditor(build, isNew, extra = {}) {
  state.editor = Object.assign({ draft: normalizeBuild(structuredClone(build)), isNew, unassigned: [], erkannt: new Set(), preview: false }, extra);
  state.importOpen = false;
  render();
  window.scrollTo(0, 0);
}

function namenDatalist() {
  return `<datalist id="dl-names">${INDEX.filter(e => e.kind === 'eintrag').map(e => `<option value="${esc(e.anzeige)}">`).join('')}</datalist>`;
}

function viewEditor() {
  const { draft: b, isNew, unassigned, preview, erkannt } = state.editor;
  const slotForms = SLOTS.map(s => {
    const sl = b.slots[s.key];
    const sum = [sl.zielItem, sl.zielAspekt].filter(Boolean).join(' / ');
    const mark = t => erkannt.has(`${s.key}.${t}`) ? ' <span class="recognized">✓ im Wissen erkannt</span>' : '';
    return `<details class="slot" ${preview && sum ? 'open' : ''}>
      <summary>${esc(s.de)}${s.de !== s.en ? ` <span class="muted">(${esc(s.en)})</span>` : ''}${sum ? ` – <span class="muted">${esc(sum)}</span>` : ''}</summary>
      <div class="grid2">
        <label class="f">Ziel-Item${mark('item')}<input type="text" list="dl-names" name="${s.key}.zielItem" value="${esc(sl.zielItem)}"></label>
        <label class="f">Ziel-Aspekt${mark('aspekt')}<input type="text" list="dl-names" name="${s.key}.zielAspekt" value="${esc(sl.zielAspekt)}"></label>
        <label class="f">Sockel (mehrere mit Komma)<input type="text" name="${s.key}.sockel" value="${esc(sl.sockel)}"></label>
        <label class="f">Härtungs-Affix<input type="text" name="${s.key}.haertung" value="${esc(sl.haertung)}"></label>
      </div>
      <label class="f">Affix-Prioritäten (eine pro Zeile, wichtigste zuerst)<textarea name="${s.key}.affixe">${esc(sl.affixe.join('\n'))}</textarea></label>
      <label class="f">Quelle (optional, sonst aus dem Wissen)<input type="text" name="${s.key}.quelle" value="${esc(sl.quelle)}"></label>
    </details>`;
  }).join('');

  return `
    <h2>${preview ? 'Vorschau – bitte prüfen und korrigieren' : isNew ? 'Neuer Build' : 'Build bearbeiten'}</h2>
    ${preview ? `<div class="msg info">Die Erkennung ist eine Schätzung. Felder prüfen, dann speichern. Nichts wird gespeichert, bevor du auf „Speichern“ tippst.</div>` : ''}
    ${unassigned.length ? `<details class="slot" open><summary>Nicht zugeordnete Zeilen (${unassigned.length})</summary>
      <pre class="json">${esc(unassigned.join('\n'))}</pre></details>` : ''}
    <form id="build-form" autocomplete="off">
      <label class="f">Name<input type="text" name="name" value="${esc(b.name)}" required></label>
      <div class="grid2">
        <label class="f">Klasse<input type="text" name="klasse" value="${esc(b.klasse)}"></label>
        <label class="f">Datum (Stand des Guides)<input type="date" name="datum" value="${esc(b.datum || today())}"></label>
      </div>
      <label class="f">Quelle-URL<input type="url" name="quelleUrl" value="${esc(b.quelleUrl)}" placeholder="https://…"></label>
      <label class="f">Notiz<input type="text" name="notiz" value="${esc(b.notiz)}"></label>
      <h3>Slots</h3>
      ${slotForms}
      <h3>Wechselkriterien</h3>
      <label class="f">Eine Bedingung pro Zeile – was da sein muss, bevor du umsteigst
        <textarea name="wechselkriterien" id="wk-text">${esc(b.wechselkriterien.map(w => w.text).join('\n'))}</textarea></label>
      <button type="button" class="btn" data-act="wk-from-slots">Ziel-Items der Slots übernehmen</button>
      ${namenDatalist()}
      <div class="btn-row" style="margin-top:16px">
        <button type="submit" class="btn primary">Speichern</button>
        <button type="button" class="btn" data-act="cancel">Abbrechen</button>
      </div>
    </form>`;
}

function readEditorForm() {
  const fd = new FormData($('#build-form'));
  const old = state.editor.draft;
  const b = structuredClone(old);
  b.name = String(fd.get('name') || '').trim() || 'Unbenannter Build';
  b.klasse = String(fd.get('klasse') || '').trim();
  b.datum = String(fd.get('datum') || '');
  b.quelleUrl = String(fd.get('quelleUrl') || '').trim();
  b.notiz = String(fd.get('notiz') || '').trim();
  for (const s of SLOTS) {
    const sl = b.slots[s.key];
    for (const f of ['zielItem', 'zielAspekt', 'sockel', 'haertung', 'quelle']) sl[f] = String(fd.get(`${s.key}.${f}`) || '').trim();
    sl.affixe = String(fd.get(`${s.key}.affixe`) || '').split('\n').map(x => x.trim()).filter(Boolean);
  }
  const doneBefore = new Map(old.wechselkriterien.map(w => [norm(w.text), w.erledigt]));
  b.wechselkriterien = String(fd.get('wechselkriterien') || '').split('\n').map(x => x.trim()).filter(Boolean)
    .map(text => ({ text, erledigt: doneBefore.get(norm(text)) || false }));
  return b;
}

function saveEditor() {
  const b = readEditorForm();
  const p = state.profil;
  const i = p.builds.findIndex(x => x.id === b.id);
  if (i >= 0) p.builds[i] = b; else p.builds.push(b);
  if (!p.aktiverBuild) p.aktiverBuild = b.id;
  saveProfil();
  buildIndex();
  state.editor = null;
  render();
  window.scrollTo(0, 0);
}

/* ================================================================
   Ansicht: Checkliste
   ================================================================ */

function slotQuelle(sl) {
  if (sl.quelle) return sl.quelle;
  const out = [];
  for (const t of [sl.zielItem, sl.zielAspekt]) {
    if (!t) continue;
    const n = norm(t);
    const e = INDEX.find(x => x.kind === 'eintrag' && x.keys.some(k => hasWords(n, k)));
    out.push(...quellenFuer(e ? e.keys : [n], e ? e.src.quelle : null));
  }
  return [...new Set(out)].join(' · ');
}

function viewCheckliste() {
  const ab = aktivBuild(), zb = zielBuild();
  let html = '';
  if (!ab) {
    html += '<div class="msg info">Kein aktiver Build. Unter „Builds“ einen als aktiv markieren.</div>';
  } else {
    const rows = SLOTS.map(s => ({ s, sl: ab.slots[s.key] }));
    const gefuellt = rows.filter(x => x.sl.zielItem || x.sl.zielAspekt);
    const done = gefuellt.filter(x => x.sl.erledigt).length;
    html += `<h2>Ziel-Ausrüstung: ${esc(ab.name)} ${staleIcon(ab.datum)}</h2>
      ${gefuellt.length ? `<p class="small muted">${done}/${gefuellt.length} erledigt</p>
      <div class="progress"><span style="width:${Math.round(done / gefuellt.length * 100)}%"></span></div>` : ''}
      <div class="card">${rows.map(({ s, sl }) => {
        const leer = !sl.zielItem && !sl.zielAspekt;
        const q = leer ? '' : slotQuelle(sl);
        return `<label class="check${sl.erledigt ? ' done' : ''}${leer ? ' empty' : ''}">
          <input type="checkbox" data-act="slot-done" data-id="${esc(ab.id)}" data-slot="${s.key}" ${sl.erledigt ? 'checked' : ''} ${leer ? 'disabled' : ''}>
          <span class="ct"><span class="muted small">${esc(s.de)}</span><br>
            ${leer ? '<span class="muted">– kein Ziel eingetragen –</span>' : ''}
            ${sl.zielItem ? `<b>${esc(sl.zielItem)}</b>` : ''}${sl.zielItem && sl.zielAspekt ? '<br>' : ''}${sl.zielAspekt ? `Aspekt: ${esc(sl.zielAspekt)}` : ''}
            ${leer ? '' : `<br><span class="small muted">Quelle: ${esc(q || '–')}</span>`}</span></label>`;
      }).join('')}</div>`;
  }

  html += `<h2>Wechselkriterien Ziel-Build${zb ? `: ${esc(zb.name)}` : ''}</h2>`;
  if (!zb) html += '<p class="small muted">Kein Ziel-Build gesetzt.</p>';
  else if (!zb.wechselkriterien.length) html += '<p class="small muted">Keine Kriterien eingetragen (Builds → Bearbeiten).</p>';
  else {
    const d = zb.wechselkriterien.filter(w => w.erledigt).length;
    html += `<div class="progress"><span style="width:${Math.round(d / zb.wechselkriterien.length * 100)}%"></span></div>
      <div class="card">${zb.wechselkriterien.map((w, i) => `<label class="check${w.erledigt ? ' done' : ''}">
        <input type="checkbox" data-act="wk" data-id="${esc(zb.id)}" data-i="${i}" ${w.erledigt ? 'checked' : ''}>
        <span class="ct">${esc(w.text)}</span></label>`).join('')}</div>
      ${d === zb.wechselkriterien.length ? '<div class="msg info">Alle Kriterien erfüllt – bereit zum Umstieg.</div>' : ''}`;
  }

  const auf = state.profil.offeneAufgaben;
  html += `<h2>Offene Aufgaben</h2>
    ${auf.length ? `<div class="card">${auf.map((a, i) => `<div class="check${a.erledigt ? ' done' : ''}">
      <input type="checkbox" data-act="aufgabe" data-i="${i}" ${a.erledigt ? 'checked' : ''} aria-label="erledigt">
      <span class="ct">${esc(a.text)}</span>
      <button class="icon-btn" data-act="aufgabe-del" data-i="${i}" aria-label="Entfernen">×</button></div>`).join('')}</div>` : ''}
    <form class="add-row" data-form="aufgabe-add">
      <input type="text" name="text" placeholder="Neue Aufgabe …" autocomplete="off">
      <button class="btn" type="submit">+</button>
    </form>`;
  return html;
}

/* ================================================================
   Ansicht: Rezepte / Farmziele
   ================================================================ */

function viewRezepte() {
  const r = state.wissen.rezepte;
  if (!r.length) return '<div class="msg info">Keine Würfel-Rezepte in wissen.json (Sektion „rezepte“).</div>';
  return `<h2>Horadrimwürfel (Horadric Cube)</h2>` + r.map(x => `
    <div class="card">
      <div class="res-name">${esc(bi(x.name_de || x.name, x.name_en) || x.id || 'Rezept')} ${staleIcon(x.stand)}</div>
      <div class="res-rows">
        <div><span class="k">Input</span>${esc(listText(x.input) || '–')}</div>
        <div><span class="k">Kosten</span>${esc(listText(x.kosten) || '–')}</div>
        <div><span class="k">Ergebnis</span>${esc(listText(x.ergebnis) || '–')}</div>
        ${x.notiz ? `<div><span class="k">Notiz</span>${esc(x.notiz)}</div>` : ''}
      </div>
    </div>`).join('');
}

function viewFarmziele() {
  const f = state.wissen.farmziele;
  const q = state.wissen.quellen;
  let html = '';
  if (!f.length) html += '<div class="msg info">Keine Farm-Ziele in wissen.json (Sektion „farmziele“).</div>';
  else html += `<h2>Farm-Ziele</h2>` + f.map(x => `
    <div class="card">
      <div class="res-head"><span class="res-name">${esc(farmQuelle(state.wissen, x) || '–')}</span> ${staleIcon(x.stand)}</div>
      <div class="res-rows">
        <div><span class="k">Belohnung</span>${esc(listText(x.belohnungen) || '–')}</div>
        ${x.kosten ? `<div><span class="k">Kosten</span>${esc(listText(x.kosten))}</div>` : ''}
        ${x.notiz ? `<div><span class="k">Notiz</span>${esc(x.notiz)}</div>` : ''}
      </div>
    </div>`).join('');
  if (q.length) {
    html += `<h2>Quellen</h2><div class="card">${q.map(x => `<div class="check"><span class="ct">
      <b>${esc(bi(x.name_de || x.name, x.name_en) || x.id)}</b>${x.typ ? ` <span class="res-typ">${esc(x.typ)}</span>` : ''} ${staleIcon(x.stand)}
      ${x.notiz ? `<br><span class="small muted">${esc(x.notiz)}</span>` : ''}</span></div>`).join('')}</div>`;
  }
  return html;
}

/* ================================================================
   Ansicht: Wissen (Notizen, Regeln, Einträge)
   ================================================================ */

function viewWissen() {
  const w = state.wissen;
  const notizen = w.notizen.length
    ? w.notizen.map(notizKarte).join('')
    : '<p class="small muted">Keine Notizen in wissen.json (Sektion „notizen“).</p>';
  const regeln = w.regeln.length ? w.regeln.map(r => `
    <details class="note"><summary>${verdiktHtml(r.verdikt)} ${esc(r.id)} ${staleIcon(r.stand)}</summary>
      <div class="note-body res-rows">
        ${trifftHtml(r.trifft) ? `<div><span class="k">Gilt für</span>${esc(trifftHtml(r.trifft))}</div>` : ''}
        ${asArray(r.suchbegriffe).length ? `<div><span class="k">Suchbegriffe</span>${esc(asArray(r.suchbegriffe).join(', '))}</div>` : ''}
        ${r.begruendung ? `<div><span class="k">Begründung</span>${esc(r.begruendung)}</div>` : ''}
        ${asArray(r.ausnahmen).length ? `<div><span class="k">Ausnahmen</span>${esc(asArray(r.ausnahmen).map(itemText).join(', '))}${r.ausnahmeText ? ` – ${esc(r.ausnahmeText)}` : ''}</div>` : ''}
        ${r.notiz ? `<div><span class="k">Notiz</span>${esc(r.notiz)}</div>` : ''}
        ${r.stand ? `<div class="small muted">Stand ${esc(r.stand)}</div>` : ''}
      </div></details>`).join('') : '<p class="small muted">Keine Regeln.</p>';
  const eintraege = w.eintraege.length ? `<div class="card">${w.eintraege.map((e, i) => `
    <div class="check"><span class="ct">${e.verdikt ? verdiktHtml(e.verdikt) : ''} <b>${esc(bi(e.name_de || e.name, e.name_en) || '(ohne Namen)')}</b>
      ${e.typ ? `<span class="res-typ">${esc(e.typ)}</span>` : ''} ${staleIcon(e.stand)}</span>
      <button class="btn" data-act="eintrag-edit" data-i="${i}">Bearbeiten</button></div>`).join('')}</div>`
    : '<p class="small muted">Keine Einträge.</p>';

  return `
    <h2>Notizen</h2>${notizen}
    <h2>Regeln</h2>${regeln}
    <h2>Einträge</h2>
    <div class="btn-row"><button class="btn" data-act="rohling" data-name="">+ Neuer Eintrag</button></div>
    ${eintraege}
    ${wissenLokal() ? '<div class="msg warn">Du hast das Wissen in der App geändert. Unter „Dateien“ exportieren, sonst gehen die Änderungen beim nächsten Wissens-Update verloren.</div>' : ''}`;
}

/* ---------- Eintrag-Editor (Rohling) ---------- */

function startEintragEditor(index, draft) {
  state.eintragEditor = { index, draft: structuredClone(draft) };
  render();
  window.scrollTo(0, 0);
}

function viewEintragEditor() {
  const { index, draft: e } = state.eintragEditor;
  const verd = state.wissen.verdikte.map(v => `<option value="${esc(v.id)}" ${istVerdikt(v.id, e.verdikt) ? 'selected' : ''}>${esc(v.id)}</option>`).join('');
  const selt = state.wissen.seltenheitSynonyme.map(s => `<option value="${esc(s.id)}" ${selKanon(e.seltenheit) === s.id ? 'selected' : ''}>${esc(bi(s.name_de, s.name_en))}</option>`).join('');
  return `
    <h2>${index < 0 ? 'Neuer Eintrag (Rohling)' : 'Eintrag bearbeiten'}</h2>
    <div class="msg info">Wird in der Arbeitskopie von wissen.json gespeichert. Zum Behalten unter „Dateien“ exportieren.</div>
    <form id="eintrag-form" autocomplete="off">
      <div class="grid2">
        <label class="f">Name deutsch<input type="text" name="name_de" value="${esc(e.name_de)}"></label>
        <label class="f">Name englisch<input type="text" name="name_en" value="${esc(e.name_en)}"></label>
      </div>
      <label class="f">Aliase (mit Komma)<input type="text" name="aliase" value="${esc(asArray(e.aliase).join(', '))}"></label>
      <div class="grid2">
        <label class="f">Typ<input type="text" name="typ" value="${esc(e.typ)}" placeholder="z. B. rune, zauber, item"></label>
        <label class="f">Item-Typ<input type="text" name="itemTyp" value="${esc(e.itemTyp)}"></label>
        <label class="f">Seltenheit<select name="seltenheit"><option value="">–</option>${selt}</select></label>
        <label class="f">Verdikt<select name="verdikt"><option value="">– leer –</option>${verd}</select></label>
      </div>
      <label class="f">Begründung (eine Zeile)<input type="text" name="begruendung" value="${esc(e.begruendung)}"></label>
      <div class="grid2">
        <label class="f">Quelle<input type="text" name="quelle" value="${esc(typeof e.quelle === 'string' ? e.quelle : listText(e.quelle))}"></label>
        <label class="f">Rezept-IDs (mit Komma)<input type="text" name="rezepte" value="${esc(asArray(e.rezepte).join(', '))}"></label>
      </div>
      <label class="f">Notiz<input type="text" name="notiz" value="${esc(e.notiz)}"></label>
      <label class="f">Stand<input type="date" name="stand" value="${esc(e.stand || today())}"></label>
      <div class="btn-row">
        <button type="submit" class="btn primary">Speichern</button>
        <button type="button" class="btn" data-act="eintrag-cancel">Abbrechen</button>
        ${index >= 0 ? '<button type="button" class="btn danger" data-act="eintrag-del">Löschen</button>' : ''}
      </div>
    </form>`;
}

function saveEintrag() {
  const fd = new FormData($('#eintrag-form'));
  const { index, draft } = state.eintragEditor;
  const e = Object.assign({}, draft);
  for (const k of ['name_de', 'name_en', 'typ', 'itemTyp', 'seltenheit', 'verdikt', 'begruendung', 'quelle', 'notiz', 'stand']) {
    e[k] = String(fd.get(k) || '').trim();
  }
  e.aliase = String(fd.get('aliase') || '').split(',').map(x => x.trim()).filter(Boolean);
  e.rezepte = String(fd.get('rezepte') || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!e.name_de && !e.name_en) { alert('Bitte mindestens einen Namen eintragen.'); return; }
  if (index >= 0) state.wissen.eintraege[index] = e; else state.wissen.eintraege.push(e);
  saveWissen(true);
  state.eintragEditor = null;
  state.query = e.name_en || e.name_de;
  render();
}

/* ================================================================
   Ansicht: Abweichungen
   ================================================================ */

function viewAbweichungen() {
  const list = state.profil.abweichungen;
  const verd = state.wissen.verdikte.map(v => `<option value="${esc(v.id)}">${esc(v.id)}</option>`).join('');
  const bezugOptionen = [
    ...INDEX.filter(e => e.kind === 'eintrag').map(e => e.anzeige),
    ...state.wissen.regeln.map(r => r.id),
  ].map(x => `<option value="${esc(x)}">`).join('');
  return `
    <h2>Eigene Abweichungen</h2>
    <p class="small muted">Hier überstimmst du das Wissen für dich persönlich. Gilt für einen Eintrag (Name) oder eine Regel (ID).
      Wird in profil.json gespeichert und bei Wissens-Updates nie überschrieben. Build-Bedarf hat trotzdem Vorrang (BEHALTEN).</p>
    ${list.length ? list.map((a, i) => `<div class="card">
      <div class="res-head">${verdiktHtml(a.verdikt)} <span class="res-name">${esc(a.bezug)}</span> ${staleIcon(a.stand)}</div>
      ${a.begruendung ? `<p class="res-reason">${esc(a.begruendung)}</p>` : ''}
      <div class="small muted">${a.stand ? `Stand ${esc(a.stand)}` : ''}</div>
      <div class="btn-row"><button class="btn danger" data-act="abw-del" data-i="${i}">Löschen</button></div>
    </div>`).join('') : '<p class="small muted">Noch keine Abweichungen.</p>'}
    <h3>Neue Abweichung</h3>
    <form id="abw-form" class="card" autocomplete="off">
      <label class="f">Bezug (Eintragsname oder Regel-ID)<input type="text" name="bezug" list="dl-bezug" required></label>
      <label class="f">Mein Verdikt<select name="verdikt">${verd}</select></label>
      <label class="f">Warum<input type="text" name="begruendung"></label>
      <datalist id="dl-bezug">${bezugOptionen}</datalist>
      <button type="submit" class="btn primary">Hinzufügen</button>
    </form>`;
}

/* ================================================================
   Ansicht: Dateien (Import/Export, Profil-Einstellungen)
   ================================================================ */

function viewDateien() {
  const w = state.wissen, p = state.profil;
  const charFelder = Object.keys(p.charakter).length ? Object.keys(p.charakter) : ['name', 'klasse', 'stufe', 'notiz'];
  return `
    <h2>wissen.json <span class="muted small">Spielwissen</span></h2>
    <div class="kv small">
      <span class="k">Quelle:</span> ${esc(state.wissenQuelle)}<br>
      <span class="k">Schema:</span> ${esc(w.schemaVersion ?? '–')} · <span class="k">Version:</span> ${esc(w.version || '–')} · <span class="k">Stand:</span> ${esc(w.stand || '–')} ${staleIcon(w.stand)}<br>
      ${w.eintraege.length} Einträge · ${w.regeln.length} Regeln · ${w.rezepte.length} Rezepte · ${w.farmziele.length} Farmziele · ${w.notizen.length} Notizen · ${w.quellen.length} Quellen
      ${wissenLokal() ? '<br><b class="warn-text">In der App geändert – noch nicht exportiert?</b>' : ''}
    </div>
    <div class="btn-row">
      <button class="btn" data-act="export-wissen">wissen.json exportieren</button>
      <label class="btn">wissen.json importieren (ersetzt komplett)<input type="file" id="file-wissen" accept=".json,application/json" hidden></label>
      <button class="btn danger" data-act="wissen-neu">Aus Datei im Repo neu laden</button>
    </div>

    <h2>katalog.json <span class="muted small">Hinweise zu Uniques</span></h2>
    <div class="kv small"><span class="k">Quelle:</span> ${esc(state.katalogQuelle)} · ${state.katalog.uniques.length} Uniques
      <br><span class="muted">Wird bei der Screenshot-Erkennung genutzt (num_inherents → implizite Affixe vormarkieren).</span></div>

    <h2>profil.json <span class="muted small">persönlich</span></h2>
    <div class="kv small">
      <span class="k">Quelle:</span> ${esc(state.profilQuelle)} · <span class="k">Schema:</span> ${esc(p.schemaVersion ?? '–')}<br>
      ${p.builds.length} Builds · ${p.sammelliste.length} auf der Sammelliste · ${p.offeneAufgaben.length} Aufgaben · ${p.abweichungen.length} Abweichungen
    </div>
    <div class="btn-row">
      <button class="btn" data-act="export-profil">profil.json exportieren</button>
      <label class="btn">profil.json importieren (ersetzt dein Profil)<input type="file" id="file-profil" accept=".json,application/json" hidden></label>
      <button class="btn danger" data-act="profil-leer">Profil zurücksetzen (profil-leer.json)</button>
    </div>

    <h2>Charakter &amp; Einstellungen</h2>
    <form id="profil-form" class="card" autocomplete="off">
      <div class="grid2">
        ${charFelder.map(k => `<label class="f">${esc(k)}<input type="text" name="c.${esc(k)}" value="${esc(p.charakter[k] ?? '')}"></label>`).join('')}
      </div>
      <label class="f">Warnung ab wie vielen Tagen (Builds und Wissen)<input type="text" inputmode="numeric" name="warnTage" value="${esc(p.einstellungen.warnTageBuildAlter)}"></label>
      <button type="submit" class="btn primary">Speichern</button>
    </form>
    <p class="small muted">Beide Dateien werden als Arbeitskopie im Browser gehalten. Exportierte Dateien kannst du nach <code>data/</code> ins Repo legen.</p>`;
}

/* ================================================================
   Events
   ================================================================ */

function readFileJson(input, cb) {
  const file = input.files && input.files[0];
  if (!file) return;
  file.text().then(txt => {
    let obj;
    try { obj = JSON.parse(txt); } catch (err) { alert('Datei ist kein gültiges JSON: ' + err.message); return; }
    cb(obj);
  }).finally(() => { input.value = ''; });
}

function schemaHinweis(obj, name) {
  return obj.schemaVersion === SCHEMA ? '' : `\n\nAchtung: ${name} hat schemaVersion ${obj.schemaVersion ?? 'fehlt'}, erwartet wird ${SCHEMA}.`;
}

function refreshSchemaMeldung() {
  state.meldungen = state.meldungen.filter(m => !m.text.startsWith('Schema passt nicht'));
  pruefeSchema();
}

document.addEventListener('click', e => {
  const tabBtn = e.target.closest('#tabs button');
  if (tabBtn) { setTab(tabBtn.dataset.tab); return; }
  if (e.target.closest('#btn-dateien')) {
    state.dateienOpen = !state.dateienOpen; state.editor = null; state.eintragEditor = null;
    render(); window.scrollTo(0, 0); return;
  }

  const el = e.target.closest('[data-act]');
  if (!el || el.type === 'checkbox') return;
  const act = el.dataset.act;
  const p = state.profil;
  const id = el.dataset.id;
  const b = id ? buildById(id) : null;

  switch (act) {
    case 'msg-x':
      state.meldungen.splice(+el.dataset.i, 1); renderHeader(); break;
    case 'wissen-uebernehmen':
      if (!state.neueWissenDatei || !confirm('Neue wissen.json übernehmen? Deine Änderungen am Wissen in der App gehen verloren.')) return;
      state.wissen = normalizeWissen(state.neueWissenDatei.data);
      lsSet(LS.wissen, state.neueWissenDatei.data); lsSet(LS.wissenBasis, state.neueWissenDatei.hash); lsDel(LS.wissenLokal);
      state.neueWissenDatei = null;
      state.meldungen = state.meldungen.filter(m => !m.aktion);
      state.wissenQuelle = FILES.wissen;
      buildIndex(); refreshSchemaMeldung(); render(); break;

    /* Builds */
    case 'new': startEditor({ datum: today() }, true); break;
    case 'open-import': state.importOpen = true; render(); break;
    case 'cancel':
      if (state.editor && state.editor.preview && !confirm('Vorschau verwerfen?')) return;
      state.editor = null; state.importOpen = false; render(); break;
    case 'edit': startEditor(b, false); break;
    case 'dup': {
      const c = structuredClone(b);
      c.id = newId(); c.name = b.name + ' (Kopie)';
      p.builds.push(c); saveProfil(); buildIndex(); render(); break;
    }
    case 'del':
      if (!confirm(`Build „${b.name}“ löschen?`)) return;
      p.builds = p.builds.filter(x => x.id !== id);
      if (p.aktiverBuild === id) p.aktiverBuild = '';
      if (p.zielBuild === id) p.zielBuild = '';
      saveProfil(); buildIndex(); render(); break;
    case 'set-aktiv': p.aktiverBuild = id; saveProfil(); render(); break;
    case 'set-ziel': p.zielBuild = id; saveProfil(); render(); break;
    case 'unset-ziel': p.zielBuild = ''; saveProfil(); render(); break;
    case 'parse': {
      const text = $('#imp-text').value;
      if (!text.trim()) { alert('Bitte zuerst Guide-Text einfügen.'); return; }
      const r = parseGuide(text);
      startEditor({
        name: $('#imp-name').value.trim() || r.firstLine.slice(0, 60),
        datum: $('#imp-datum').value || today(),
        quelleUrl: $('#imp-url').value.trim() || r.url,
        slots: r.slots,
      }, true, { preview: true, unassigned: r.unassigned, erkannt: r.erkannt });
      break;
    }
    case 'wk-from-slots': {
      const ta = $('#wk-text');
      const have = new Set(ta.value.split('\n').map(norm).filter(Boolean));
      const add = [];
      for (const s of SLOTS) {
        const t = $(`[name="${s.key}.zielItem"]`).value.trim() || $(`[name="${s.key}.zielAspekt"]`).value.trim();
        if (!t) continue;
        const line = `${s.de}: ${t}`;
        if (!have.has(norm(line))) add.push(line);
      }
      ta.value = [ta.value.trim(), ...add].filter(Boolean).join('\n');
      break;
    }

    /* Sammelliste / Aufgaben */
    case 'sammel-del': p.sammelliste.splice(+el.dataset.i, 1); saveProfil(); buildIndex(); render(); break;
    case 'aufgabe-del': p.offeneAufgaben.splice(+el.dataset.i, 1); saveProfil(); render(); break;

    /* Wissen-Einträge */
    case 'rohling': {
      const name = el.dataset.name || '';
      startEintragEditor(-1, {
        name_de: '', name_en: name, aliase: [], typ: '', itemTyp: '', seltenheit: '', verdikt: '',
        begruendung: '', quelle: '', rezepte: [], notiz: '', stand: today(),
      });
      break;
    }
    case 'eintrag-edit': startEintragEditor(+el.dataset.i, state.wissen.eintraege[+el.dataset.i]); break;
    case 'eintrag-cancel': state.eintragEditor = null; render(); break;
    case 'eintrag-del': {
      const i = state.eintragEditor.index;
      if (!confirm('Eintrag aus dem Wissen löschen?')) return;
      state.wissen.eintraege.splice(i, 1);
      saveWissen(true); state.eintragEditor = null; render(); break;
    }

    /* Abweichungen */
    case 'abw-del': p.abweichungen.splice(+el.dataset.i, 1); saveProfil(); render(); break;

    /* Dateien */
    case 'export-wissen':
      download('wissen.json', state.wissen);
      lsDel(LS.wissenLokal);
      render(); break;
    case 'export-profil': download('profil.json', state.profil); break;
    case 'wissen-neu':
      if (wissenLokal() && !confirm('Arbeitskopie verwerfen und wissen.json aus dem Repo neu laden? Änderungen in der App gehen verloren.')) return;
      lsDel(LS.wissen); lsDel(LS.wissenBasis); lsDel(LS.wissenLokal);
      location.reload(); break;
    case 'profil-leer':
      if (!confirm('Dein Profil (Builds, Häkchen, Listen, Abweichungen) löschen und aus profil-leer.json neu anlegen? Vorher exportieren!')) return;
      fetchJson(FILES.profilLeer).then(r => {
        state.profil = normalizeProfil(r.ok ? r.data : { schemaVersion: SCHEMA });
        state.profilQuelle = r.ok ? `neu aus ${FILES.profilLeer}` : 'neues leeres Profil';
        saveProfil(); buildIndex(); refreshSchemaMeldung(); render();
      });
      break;
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'file-wissen') {
    readFileJson(el, obj => {
      if (!confirm('wissen.json komplett ersetzen?' + schemaHinweis(obj, 'Die Datei'))) return;
      state.wissen = normalizeWissen(obj);
      lsSet(LS.wissen, obj); lsDel(LS.wissenLokal);
      state.wissenQuelle = 'importierte Datei';
      buildIndex(); refreshSchemaMeldung(); render();
    });
    return;
  }
  if (el.id === 'file-profil') {
    readFileJson(el, obj => {
      if (!confirm('Dein Profil durch diese Datei ersetzen?' + schemaHinweis(obj, 'Die Datei'))) return;
      state.profil = normalizeProfil(obj);
      state.profilQuelle = 'importierte Datei';
      saveProfil(); buildIndex(); refreshSchemaMeldung(); render();
    });
    return;
  }
  if (el.type !== 'checkbox' || !el.dataset.act) return;
  const p = state.profil;
  const b = buildById(el.dataset.id);
  switch (el.dataset.act) {
    case 'wk': b.wechselkriterien[+el.dataset.i].erledigt = el.checked; break;
    case 'slot-done': b.slots[el.dataset.slot].erledigt = el.checked; break;
    case 'sammel': p.sammelliste[+el.dataset.i].erledigt = el.checked; break;
    case 'aufgabe': p.offeneAufgaben[+el.dataset.i].erledigt = el.checked; break;
    default: return;
  }
  saveProfil();
  el.closest('.check')?.classList.toggle('done', el.checked);
  if (el.dataset.act === 'wk' || el.dataset.act === 'slot-done') render();
});

document.addEventListener('submit', e => {
  const f = e.target;
  e.preventDefault();
  const p = state.profil;
  if (f.id === 'build-form') { saveEditor(); return; }
  if (f.id === 'eintrag-form') { saveEintrag(); return; }
  if (f.id === 'abw-form') {
    const fd = new FormData(f);
    const bezug = String(fd.get('bezug') || '').trim();
    if (!bezug) return;
    // Anzeige "DE (EN)" auf einen Namen reduzieren, damit der Vergleich greift
    const hit = INDEX.find(x => x.kind === 'eintrag' && x.anzeige === bezug);
    p.abweichungen.push({
      bezug: hit ? (hit.src.name_en || hit.src.name_de) : bezug,
      verdikt: String(fd.get('verdikt') || ''),
      begruendung: String(fd.get('begruendung') || '').trim(),
      stand: today(),
    });
    saveProfil(); render(); return;
  }
  if (f.id === 'profil-form') {
    const fd = new FormData(f);
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith('c.')) continue;
      const t = String(v).trim();
      p.charakter[k.slice(2)] = /^\d+$/.test(t) ? Number(t) : t;   // qualstufe, paragon als Zahl
    }
    const n = parseInt(fd.get('warnTage'), 10);
    if (n > 0) p.einstellungen.warnTageBuildAlter = n;
    saveProfil(); render(); return;
  }
  const art = f.dataset.form;
  const text = String(new FormData(f).get('text') || '').trim();
  if (!text) return;
  if (art === 'sammel-add') {
    // "Deutsch / Englisch" oder "Deutsch (Englisch)" aufteilen
    const m = text.match(/^(.+?)\s*(?:\/|\()\s*(.+?)\)?$/);
    p.sammelliste.push({ name_de: m ? m[1] : text, name_en: m ? m[2] : '', notiz: '', erledigt: false });
    saveProfil(); buildIndex(); render();
    $(`[data-form="sammel-add"] input`)?.focus();
  } else if (art === 'aufgabe-add') {
    p.offeneAufgaben.push({ text, erledigt: false });
    saveProfil(); render();
  }
});

/* ================================================================
   Start
   ================================================================ */

(async function init() {
  state.tab = 'suche';   // Startseite ist immer die Suche
  try {
    await loadWissen();
    await loadProfil();
    await loadKatalog();
    pruefeSchema();
    buildIndex();
  } catch (err) {
    console.error(err);
    state.wissen = state.wissen || normalizeWissen({});
    state.profil = state.profil || normalizeProfil({});
    state.meldungen.push({ art: 'err', text: 'Fehler beim Laden: ' + err.message });
    try { buildIndex(); } catch { /* leerer Index */ }
  }
  render();
})();
