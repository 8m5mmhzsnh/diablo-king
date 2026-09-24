'use strict';

/* ================================================================
   D4 Spickzettel – alles in einer Datei, keine Abhängigkeiten.
   Spieldaten: data/data.json   Fortschritt/Builds: localStorage
   ================================================================ */

const DATA_URL = 'data/data.json';
const LS = {
  builds: 'd4k.builds',
  aktiv: 'd4k.aktiv',
  ziel: 'd4k.ziel',
  sammeln: 'd4k.sammeln',
  tab: 'd4k.tab',
  dataCache: 'd4k.dataCache',
};

const SLOTS = [
  { key: 'kopf', de: 'Kopf', en: 'Helm' },
  { key: 'brust', de: 'Brust', en: 'Chest' },
  { key: 'haende', de: 'Hände', en: 'Gloves' },
  { key: 'beine', de: 'Beine', en: 'Pants' },
  { key: 'fuesse', de: 'Füße', en: 'Boots' },
  { key: 'amulett', de: 'Amulett', en: 'Amulet' },
  { key: 'ring1', de: 'Ring 1', en: 'Ring 1' },
  { key: 'ring2', de: 'Ring 2', en: 'Ring 2' },
  { key: 'waffe', de: 'Waffe', en: 'Weapon' },
  { key: 'fokus', de: 'Fokus', en: 'Offhand' },
];
const SLOT_BY_KEY = Object.fromEntries(SLOTS.map(s => [s.key, s]));

const VERDIKTE = {
  BEHALTEN: { label: 'BEHALTEN', cls: 'v-keep' },
  WUERFELN: { label: 'WÜRFELN', cls: 'v-cube' },
  ZERLEGEN: { label: 'ZERLEGEN', cls: 'v-salvage' },
  VERWERTEN: { label: 'VERWERTEN', cls: 'v-use' },
  VERKAUFEN: { label: 'VERKAUFEN', cls: 'v-sell' },
  UNBEKANNT: { label: 'KEINE DATEN', cls: 'v-unknown' },
};

/* ---------------- Hilfsfunktionen ---------------- */

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Normalisiert für Vergleiche: klein, ohne Akzente/Umlaute-Punkte, nur a-z0-9 + Leerzeichen. */
function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Enthält `hay` die Wortfolge `needle` (beides normalisiert)? */
function hasWords(hay, needle) {
  if (!hay || !needle) return false;
  return (' ' + hay + ' ').includes(' ' + needle + ' ');
}

/** "Verwegenheit (Temerity)" – nur einmal, wenn gleich oder eins fehlt. */
function bi(de, en) {
  de = (de || '').trim(); en = (en || '').trim();
  if (de && en && norm(de) !== norm(en)) return `${de} (${en})`;
  return de || en;
}

/** Name eines Listeneintrags, der String oder {name_de,name_en,menge} sein darf. */
function itemText(x) {
  if (x == null) return '';
  if (typeof x === 'string') return x;
  const n = bi(x.name_de || x.name, x.name_en);
  return x.menge != null && x.menge !== '' ? `${x.menge}× ${n}` : n;
}
function listText(x) {
  if (x == null || x === '') return '';
  if (Array.isArray(x)) return x.map(itemText).filter(Boolean).join(', ');
  return itemText(x);
}
function asArray(x) {
  if (x == null || x === '') return [];
  return Array.isArray(x) ? x : [x];
}

function verdiktKey(v) {
  const n = norm(v).replace(/ /g, '');
  if (!n) return '';
  if (n.startsWith('behalt') || n === 'keep') return 'BEHALTEN';
  if (n.startsWith('wurfel') || n.startsWith('wuerfel') || n === 'cube') return 'WUERFELN';
  if (n.startsWith('zerleg') || n === 'salvage') return 'ZERLEGEN';
  if (n.startsWith('verwert') || n === 'use') return 'VERWERTEN';
  if (n.startsWith('verkauf') || n === 'sell') return 'VERKAUFEN';
  return '';
}
function verdiktHtml(key, big) {
  const v = VERDIKTE[key] || VERDIKTE.UNBEKANNT;
  return `<span class="verdikt ${v.cls}${big ? ' big' : ''}">${v.label}</span>`;
}

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.warn('localStorage', e); }
}

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
function safeUrl(u) {
  return /^https?:\/\//i.test(u || '') ? u : '';
}
function newId() {
  return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ---------------- Zustand ---------------- */

const EMPTY_DATA = {
  einstellungen: { warnTageBuildAlter: 14 },
  eintraege: [], rezepte: [], farmziele: [], sammelliste: [], builds: [],
  aktiverBuild: '', zielBuild: '',
};

const state = {
  data: structuredClone(EMPTY_DATA),
  dataSource: '',      // 'datei' | 'cache' | 'leer'
  dataError: '',
  builds: [],
  aktivId: '',
  zielId: '',
  sammelDone: {},      // norm(name) -> true
  tab: 'suche',
  query: '',
  editor: null,        // { draft, isNew, unassigned: [] }
  importOpen: false,
  zielViewId: '',
};

function normalizeData(d) {
  const out = Object.assign(structuredClone(EMPTY_DATA), d || {});
  for (const k of ['eintraege', 'rezepte', 'farmziele', 'sammelliste', 'builds']) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  out.einstellungen = Object.assign({ warnTageBuildAlter: 14 }, out.einstellungen || {});
  out.builds = out.builds.map(normalizeBuild);
  return out;
}

function emptySlot() {
  return { zielItem: '', zielAspekt: '', sockel: '', affixe: [], haertung: '', quelle: '', erledigt: false };
}
function normalizeBuild(b) {
  b = Object.assign({ id: '', name: '', klasse: '', quelleUrl: '', datum: '', notiz: '', slots: {}, wechselkriterien: [] }, b || {});
  if (!b.id) b.id = newId();
  const slots = {};
  for (const s of SLOTS) {
    const src = (b.slots && b.slots[s.key]) || {};
    const slot = Object.assign(emptySlot(), src);
    if (typeof slot.affixe === 'string') slot.affixe = slot.affixe.split(/\n|,/).map(x => x.trim()).filter(Boolean);
    if (!Array.isArray(slot.affixe)) slot.affixe = [];
    slot.erledigt = !!slot.erledigt;
    slots[s.key] = slot;
  }
  b.slots = slots;
  b.wechselkriterien = asArray(b.wechselkriterien).map(w =>
    typeof w === 'string' ? { text: w, erledigt: false } : { text: w.text || '', erledigt: !!w.erledigt })
    .filter(w => w.text);
  return b;
}

function saveBuilds() {
  lsSet(LS.builds, state.builds);
  lsSet(LS.aktiv, state.aktivId);
  lsSet(LS.ziel, state.zielId);
}
const buildById = id => state.builds.find(b => b.id === id) || null;
const aktivBuild = () => buildById(state.aktivId);
const zielBuild = () => buildById(state.zielId);

async function loadData() {
  let loaded = null;
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    loaded = await res.json();
    state.dataSource = 'datei';
  } catch (e) {
    if (e instanceof SyntaxError) {
      state.dataSource = 'leer';
      state.dataError = `data.json ist kein gültiges JSON: ${e.message}`;
      applyData(null);
      return;
    }
    const cached = lsGet(LS.dataCache, null);
    if (cached && cached.data) {
      loaded = cached.data;
      state.dataSource = 'cache';
      state.dataError = `data.json konnte nicht direkt gelesen werden (${e.message}). Verwende die zuletzt manuell geladene Version vom ${new Date(cached.zeit).toLocaleString('de-DE')}.`;
    } else {
      state.dataSource = 'leer';
      state.dataError = `data.json konnte nicht gelesen werden (${e.message}). Beim Öffnen per Doppelklick (file://) blockiert der Browser das. Lade die Datei einmal unter „Daten“ von Hand oder starte einen lokalen Webserver (siehe README).`;
    }
  }
  applyData(loaded);
}

function applyData(raw) {
  state.data = normalizeData(raw);
  const storedBuilds = lsGet(LS.builds, null);
  if (Array.isArray(storedBuilds)) {
    state.builds = storedBuilds.map(normalizeBuild);
    state.aktivId = lsGet(LS.aktiv, '');
    state.zielId = lsGet(LS.ziel, '');
  } else {
    state.builds = structuredClone(state.data.builds);
    state.aktivId = state.data.aktiverBuild || '';
    state.zielId = state.data.zielBuild || '';
  }
  if (!buildById(state.aktivId)) state.aktivId = '';
  if (!buildById(state.zielId)) state.zielId = '';
  state.sammelDone = lsGet(LS.sammeln, {}) || {};
  buildIndex();
}

/* ---------------- Suchindex & Bewertung ---------------- */

let INDEX = [];

function entryKeys(e) {
  return [e.name_de, e.name_en, e.name, ...asArray(e.aliase)].map(norm).filter(Boolean);
}

/** Zerlegt Freitext (z. B. Sockel "Rune A + Rune B") in Einzelteile. */
function splitParts(text) {
  return String(text || '').split(/[,+;\/&\n]| und | and /i).map(x => x.trim()).filter(Boolean);
}

function buildIndex() {
  const d = state.data;
  INDEX = d.eintraege.map((e, i) => ({
    id: 'e' + i, src: e, pseudo: false,
    anzeige: bi(e.name_de || e.name, e.name_en),
    typ: e.typ || '',
    keys: entryKeys(e),
  })).filter(x => x.keys.length);

  // Namen, die nur in Builds/Listen vorkommen, trotzdem findbar machen.
  const known = x => INDEX.some(e => e.keys.some(k => hasWords(x, k)));
  const addPseudo = (text, typ) => {
    const n = norm(text);
    if (!n || known(n)) return;
    INDEX.push({ id: 'p' + INDEX.length, src: {}, pseudo: true, anzeige: text.trim(), typ, keys: [n] });
  };
  for (const b of state.builds) {
    for (const s of SLOTS) {
      const sl = b.slots[s.key];
      addPseudo(sl.zielItem, 'aus Build');
      addPseudo(sl.zielAspekt, 'Aspekt aus Build');
      splitParts(sl.sockel).forEach(p => addPseudo(p, 'Sockel aus Build'));
    }
  }
  d.sammelliste.forEach(x => addPseudo(itemText(x), 'Sammelliste'));
  d.farmziele.forEach(f => asArray(f.belohnungen).forEach(x => addPseudo(itemText(x), 'Farm-Belohnung')));
  d.rezepte.forEach(r => asArray(r.ergebnis).forEach(x => addPseudo(itemText(x), 'Würfel-Ergebnis')));
}

function score(keys, q, qTokens) {
  let best = 0;
  for (const k of keys) {
    if (k === q) return 100;
    if (k.startsWith(q)) best = Math.max(best, 85);
    else if (hasWords(k, q)) best = Math.max(best, 75);
    else if (k.includes(q)) best = Math.max(best, 55);
    else if (qTokens.length > 1 && qTokens.every(t => k.includes(t))) best = Math.max(best, 40);
  }
  return best;
}

function search(query) {
  const q = norm(query);
  if (!q) return [];
  const tokens = q.split(' ');
  return INDEX
    .map(e => ({ e, s: score(e.keys, q, tokens) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.anzeige.localeCompare(b.e.anzeige, 'de'))
    .slice(0, 20)
    .map(x => x.e);
}

const SLOT_FELDER = [
  ['zielItem', 'Ziel-Item'],
  ['zielAspekt', 'Aspekt'],
  ['sockel', 'Sockel'],
];

/** Wo braucht Build `b` einen der Namen `keys`? */
function buildRefs(b, keys) {
  if (!b) return [];
  const refs = [];
  for (const s of SLOTS) {
    const sl = b.slots[s.key];
    for (const [feld, label] of SLOT_FELDER) {
      const parts = feld === 'sockel' ? splitParts(sl[feld]) : [sl[feld]];
      if (parts.some(p => { const n = norm(p); return keys.some(k => hasWords(n, k)); })) {
        refs.push({ slot: s, feld: label, erledigt: sl.erledigt });
      }
    }
  }
  return refs;
}
const refText = refs => refs.map(r => `${r.slot.de} (${r.feld})`).join(', ');

function bewerten(entry) {
  const keys = entry.keys;
  const ab = aktivBuild(), zb = zielBuild();
  const aRefs = buildRefs(ab, keys);
  const zRefs = buildRefs(zb, keys);
  const inA = aRefs.length > 0, inZ = zRefs.length > 0;

  const zuordnung = inA && inZ ? 'beides' : inA ? 'aktueller Build' : inZ ? 'späterer Build' : 'keiner';

  const sammel = state.data.sammelliste.find(x => {
    const n = norm(itemText(typeof x === 'string' ? x : { name_de: x.name_de || x.name, name_en: x.name_en }));
    return keys.some(k => hasWords(n, k));
  });

  const dbV = verdiktKey(entry.src.verdikt);
  const dbGrund = entry.src.begruendung || '';
  let verdikt, grund, hinweis = '';

  if (inA || inZ) {
    verdikt = 'BEHALTEN';
    if (inA && inZ && ab === zb) grund = `Build „${ab.name}“ braucht es: ${refText(aRefs)}.`;
    else if (inA && inZ) grund = `Aktueller Build „${ab.name}“: ${refText(aRefs)} · Ziel-Build „${zb.name}“: ${refText(zRefs)}.`;
    else if (inA) grund = `Aktueller Build „${ab.name}“ braucht es: ${refText(aRefs)}.`;
    else { grund = `Für späteren Build „${zb.name}“: ${refText(zRefs)}.`; hinweis = 'für späteren Build'; }
  } else if (sammel) {
    verdikt = 'BEHALTEN';
    grund = 'Steht auf der Sammelliste' + (sammel.notiz ? `: ${sammel.notiz}` : '.');
  } else if (dbV) {
    verdikt = dbV;
    grund = dbGrund;
  } else {
    verdikt = 'UNBEKANNT';
    grund = entry.pseudo
      ? 'Kommt nur in einem inaktiven Build oder einer Liste vor – keine Einstufung in data.json.'
      : 'Noch kein Verdikt in data.json eingetragen.';
  }

  // Andere (weder aktive noch Ziel-) Builds als Info
  const andere = state.builds
    .filter(b => b !== ab && b !== zb)
    .map(b => ({ b, refs: buildRefs(b, keys) }))
    .filter(x => x.refs.length);

  // Standard-Verdikt aus den Daten zeigen, wenn es überstimmt wurde
  const dbHinweis = dbV && dbV !== verdikt ? { v: dbV, grund: dbGrund } : null;

  return { verdikt, grund, hinweis, zuordnung, andere, dbHinweis };
}

function quellenFuer(entry) {
  const out = [];
  if (entry.src.quelle) out.push(listText(entry.src.quelle));
  for (const f of state.data.farmziele) {
    const hit = asArray(f.belohnungen).some(x => {
      const n = norm(itemText(x));
      return entry.keys.some(k => hasWords(n, k));
    });
    if (hit) {
      const q = bi(f.quelle_de || f.quelle, f.quelle_en);
      const qNames = [f.quelle_de, f.quelle, f.quelle_en].map(norm).filter(Boolean);
      if (!q) continue;
      // Doppelte Nennung vermeiden, wenn der Eintrag die Quelle schon selbst nennt
      const dup = out.findIndex(o => qNames.includes(norm(o)) || norm(o) === norm(q));
      const text = f.typ ? `${q} [${f.typ}]` : q;
      if (dup >= 0) out[dup] = text; else out.push(text);
    }
  }
  return out;
}

function rezepteFuer(entry) {
  const ids = asArray(entry.src.rezepte);
  const touches = x => { const n = norm(listText(x)); return entry.keys.some(k => hasWords(n, k)); };
  return state.data.rezepte
    .map(r => {
      let rolle = '';
      if (ids.includes(r.id)) rolle = 'verknüpft';
      else if (touches(r.ergebnis)) rolle = 'Ergebnis';
      else if (touches(r.input)) rolle = 'Zutat';
      else if (touches(r.kosten)) rolle = 'Material';
      return rolle ? { r, rolle } : null;
    })
    .filter(Boolean);
}

/* ---------------- Rendering: Rahmen ---------------- */

function setTab(tab) {
  state.tab = tab;
  state.editor = null;
  state.importOpen = false;
  lsSet(LS.tab, tab);
  render();
  window.scrollTo(0, 0);
}

function renderHeader() {
  const ab = aktivBuild(), zb = zielBuild();
  $('#build-info').innerHTML =
    `Aktiv: <b>${esc(ab ? ab.name : '–')}</b> · Ziel: <b>${esc(zb ? zb.name : '–')}</b>`;
  document.querySelectorAll('#tabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === state.tab));

  const msgs = [];
  if (state.dataError) msgs.push(`<div class="msg ${state.dataSource === 'leer' ? 'err' : 'warn'}">${esc(state.dataError)}</div>`);
  const warnTage = state.data.einstellungen.warnTageBuildAlter;
  for (const [b, rolle] of [[ab, 'Aktiver Build'], [zb, 'Ziel-Build']]) {
    if (!b || (rolle === 'Ziel-Build' && b === ab)) continue;
    const age = ageDays(b.datum);
    if (age != null && age > warnTage) {
      msgs.push(`<div class="msg warn">${rolle} „${esc(b.name)}“ ist ${age} Tage alt – Guide auf Aktualität prüfen.</div>`);
    }
  }
  $('#banner').innerHTML = msgs.join('');
}

function render() {
  renderHeader();
  const main = $('#main');
  switch (state.tab) {
    case 'builds': main.innerHTML = state.editor ? viewEditor() : state.importOpen ? viewImport() : viewBuilds(); break;
    case 'ziel': main.innerHTML = viewZiel(); break;
    case 'wuerfel': main.innerHTML = viewWuerfel(); break;
    case 'farmen': main.innerHTML = viewFarmen(); break;
    case 'sammeln': main.innerHTML = viewSammeln(); break;
    case 'daten': main.innerHTML = viewDaten(); break;
    default: renderSuche(main);
  }
}

/* ---------------- Ansicht: Suche ---------------- */

function renderSuche(main) {
  main.innerHTML = `
    <div class="search-wrap">
      <input id="q" class="search" type="search" autocomplete="off" autocapitalize="off" spellcheck="false"
        placeholder="Item, Rune, Splitter, Material … (DE/EN)" value="${esc(state.query)}">
    </div>
    <div id="results"></div>`;
  const input = $('#q');
  input.addEventListener('input', () => { state.query = input.value; renderResults(); });
  renderResults();
  if (!('ontouchstart' in window)) input.focus();
}

function renderResults() {
  const box = $('#results');
  if (!box) return;
  const q = state.query.trim();
  if (!q) {
    const n = state.data.eintraege.length;
    box.innerHTML = `<p class="muted small">${n} Einträge in data.json${state.builds.length ? `, ${state.builds.length} Build(s)` : ''}. Tippe einen Namen auf Deutsch oder Englisch.</p>` +
      (n === 0 && !state.builds.length ? `<div class="msg info">Noch keine Daten. Trage Items in <code>data/data.json</code> ein oder lege unter „Builds“ einen Build an.</div>` : '');
    return;
  }
  const hits = search(q);
  if (!hits.length) {
    box.innerHTML = `<div class="card"><div class="res-head">${verdiktHtml('UNBEKANNT', true)}<span class="res-name">${esc(q)}</span></div>
      <p class="res-reason">Nicht gefunden – weder in data.json noch in einem Build. Im Zweifel: in data.json nachtragen.</p></div>`;
    return;
  }
  box.innerHTML = hits.map((e, i) => resultCard(e, i === 0)).join('');
}

function resultCard(e, best) {
  const b = bewerten(e);
  const quellen = quellenFuer(e);
  const rezepte = rezepteFuer(e);
  const rows = [];
  rows.push(`<div><span class="k">Build</span>${esc(b.zuordnung)}${b.hinweis ? ` <span class="tag ziel">${esc(b.hinweis)}</span>` : ''}</div>`);
  if (b.andere.length) {
    rows.push(`<div><span class="k">Auch in</span>${b.andere.map(x => `${esc(x.b.name)} (${esc(refText(x.refs))})`).join('; ')} <span class="muted">– nicht aktiv/Ziel</span></div>`);
  }
  if (quellen.length) rows.push(`<div><span class="k">Quelle</span>${esc(quellen.join(' · '))}</div>`);
  for (const { r, rolle } of rezepte) {
    rows.push(`<div><span class="k">Würfel</span><b>${esc(bi(r.name_de || r.name, r.name_en) || r.id || 'Rezept')}</b> <span class="muted">(${esc(rolle)})</span><br>
      ${r.input ? `Input: ${esc(listText(r.input))}<br>` : ''}
      ${r.kosten ? `Kosten: ${esc(listText(r.kosten))}<br>` : ''}
      ${r.ergebnis ? `Ergebnis: ${esc(listText(r.ergebnis))}` : ''}</div>`);
  }
  if (b.dbHinweis) {
    rows.push(`<div><span class="k">Sonst</span>${verdiktHtml(b.dbHinweis.v)} ${esc(b.dbHinweis.grund)}</div>`);
  }
  if (e.src.notiz) rows.push(`<div><span class="k">Notiz</span>${esc(e.src.notiz)}</div>`);

  return `<div class="card${best ? ' best' : ''}">
    <div class="res-head">${verdiktHtml(b.verdikt, true)}
      <span class="res-name">${esc(e.anzeige)}</span>
      ${e.typ ? `<span class="res-typ">${esc(e.typ)}</span>` : ''}</div>
    ${b.grund ? `<p class="res-reason">${esc(b.grund)}</p>` : ''}
    <div class="res-rows">${rows.join('')}</div>
  </div>`;
}

/* ---------------- Ansicht: Builds ---------------- */

function viewBuilds() {
  const warnTage = state.data.einstellungen.warnTageBuildAlter;
  const cards = state.builds.map(b => {
    const age = ageDays(b.datum);
    const alt = age != null && age > warnTage;
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
        ${b.id === state.aktivId ? '<span class="tag aktiv">AKTIV</span>' : ''}
        ${b.id === state.zielId ? '<span class="tag ziel">ZIEL</span>' : ''}
        ${alt ? `<span class="tag warn">${age} Tage alt</span>` : ''}
      </div>
      <div class="kv small">
        ${b.klasse ? `<span class="k">Klasse:</span> ${esc(b.klasse)} · ` : ''}
        <span class="k">Stand:</span> ${esc(b.datum || '–')}${age != null ? ` (vor ${age} Tagen)` : ''}
        ${url ? `<br><span class="k">Quelle:</span> <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>` : b.quelleUrl ? `<br><span class="k">Quelle:</span> ${esc(b.quelleUrl)}` : ''}
        ${b.notiz ? `<br>${esc(b.notiz)}` : ''}
      </div>
      ${alt ? `<div class="msg warn">Dieser Build ist älter als ${warnTage} Tage. Prüfe, ob der Guide noch aktuell ist, und aktualisiere das Datum.</div>` : ''}
      <div class="btn-row">
        ${b.id !== state.aktivId ? `<button class="btn" data-act="set-aktiv" data-id="${b.id}">Als aktiv</button>` : ''}
        ${b.id !== state.zielId ? `<button class="btn" data-act="set-ziel" data-id="${b.id}">Als Ziel</button>` : `<button class="btn" data-act="unset-ziel">Ziel entfernen</button>`}
        <button class="btn" data-act="edit" data-id="${b.id}">Bearbeiten</button>
        <button class="btn" data-act="dup" data-id="${b.id}">Duplizieren</button>
        <button class="btn danger" data-act="del" data-id="${b.id}">Löschen</button>
      </div>
      ${slotRows ? `<details><summary class="small muted">Slots anzeigen</summary><table class="slots">${slotRows}</table></details>` : '<p class="small muted">Noch keine Slots ausgefüllt.</p>'}
      <h3>Wechselkriterien ${wk.length ? `<span class="muted small">${wkDone}/${wk.length}</span>` : ''}</h3>
      ${wk.length ? `
        <div class="progress"><span style="width:${Math.round(wkDone / wk.length * 100)}%"></span></div>
        ${wkDone === wk.length ? '<div class="msg info">Alle Kriterien erfüllt – bereit zum Umstieg.</div>' : ''}
        ${wk.map((w, i) => `<label class="check${w.erledigt ? ' done' : ''}">
          <input type="checkbox" data-act="wk" data-id="${b.id}" data-i="${i}" ${w.erledigt ? 'checked' : ''}>
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

/* ---------------- Ansicht: Guide-Import ---------------- */

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

/** Findet genau einen bekannten Datenbank-Eintrag im Text → kanonische Anzeige "DE (EN)". */
function canonical(text) {
  const n = norm(text);
  const hits = INDEX.filter(e => !e.pseudo && e.keys.some(k => k.length >= 3 && hasWords(n, k)));
  return hits.length === 1 ? { text: hits[0].anzeige, erkannt: true } : { text: text.trim(), erkannt: false };
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
  let current = '';
  let waitingValue = false;
  let url = '';
  let firstLine = '';

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
    // "Label: Wert" / "Label - Wert" / "Label<TAB>Wert" / "Label | Wert"
    const m = stripped.match(/^([^:\t|–]{1,30}?)\s*(?::|\t|\||\s[-–]\s)\s*(.+)$/);
    let key = m ? slotFromLabel(m[1]) : '';
    if (key) {
      if (key === 'ring') key = resolveRing();
      current = key; waitingValue = false;
      setMain(key, m[2]);
      continue;
    }
    // Slotname allein auf einer Zeile → Wert folgt
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
      // Nicht eindeutig – lieber zeigen als falsch zuordnen
      unassigned.push(line);
    }
  }
  return { slots, unassigned, url, firstLine, erkannt };
}

/* ---------------- Ansicht: Build-Editor ---------------- */

function startEditor(build, isNew, extra = {}) {
  state.editor = Object.assign({ draft: normalizeBuild(structuredClone(build)), isNew, unassigned: [], erkannt: new Set(), preview: false }, extra);
  state.importOpen = false;
  render();
  window.scrollTo(0, 0);
}

function slotSummary(sl) {
  return [sl.zielItem, sl.zielAspekt].filter(Boolean).join(' / ');
}

function viewEditor() {
  const { draft: b, isNew, unassigned, preview, erkannt } = state.editor;
  const names = INDEX.filter(e => !e.pseudo).map(e => `<option value="${esc(e.anzeige)}">`).join('');
  const slotForms = SLOTS.map(s => {
    const sl = b.slots[s.key];
    const sum = slotSummary(sl);
    const mark = t => erkannt.has(`${s.key}.${t}`) ? ' <span class="recognized">✓ in data.json erkannt</span>' : '';
    return `<details class="slot" ${preview && sum ? 'open' : ''}>
      <summary>${esc(s.de)} <span class="muted">(${esc(s.en)})</span>${sum ? ` – <span class="muted">${esc(sum)}</span>` : ''}</summary>
      <div class="grid2">
        <label class="f">Ziel-Item${mark('item')}<input type="text" list="dl-names" name="${s.key}.zielItem" value="${esc(sl.zielItem)}"></label>
        <label class="f">Ziel-Aspekt${mark('aspekt')}<input type="text" list="dl-names" name="${s.key}.zielAspekt" value="${esc(sl.zielAspekt)}"></label>
        <label class="f">Sockel (mehrere mit Komma)<input type="text" name="${s.key}.sockel" value="${esc(sl.sockel)}"></label>
        <label class="f">Härtungs-Affix<input type="text" name="${s.key}.haertung" value="${esc(sl.haertung)}"></label>
      </div>
      <label class="f">Affix-Prioritäten (eine pro Zeile, wichtigste zuerst)<textarea name="${s.key}.affixe">${esc(sl.affixe.join('\n'))}</textarea></label>
      <label class="f">Quelle (optional, sonst aus data.json)<input type="text" name="${s.key}.quelle" value="${esc(sl.quelle)}"></label>
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
      <datalist id="dl-names">${names}</datalist>
      <div class="btn-row" style="margin-top:16px">
        <button type="submit" class="btn primary">Speichern</button>
        <button type="button" class="btn" data-act="cancel">Abbrechen</button>
      </div>
    </form>`;
}

function readEditorForm() {
  const form = $('#build-form');
  const fd = new FormData(form);
  const old = state.editor.draft;
  const b = structuredClone(old);
  b.name = (fd.get('name') || '').trim() || 'Unbenannter Build';
  b.klasse = (fd.get('klasse') || '').trim();
  b.datum = fd.get('datum') || '';
  b.quelleUrl = (fd.get('quelleUrl') || '').trim();
  b.notiz = (fd.get('notiz') || '').trim();
  for (const s of SLOTS) {
    const sl = b.slots[s.key];
    for (const f of ['zielItem', 'zielAspekt', 'sockel', 'haertung', 'quelle']) sl[f] = (fd.get(`${s.key}.${f}`) || '').trim();
    sl.affixe = String(fd.get(`${s.key}.affixe`) || '').split('\n').map(x => x.trim()).filter(Boolean);
  }
  const doneBefore = new Map(old.wechselkriterien.map(w => [norm(w.text), w.erledigt]));
  b.wechselkriterien = String(fd.get('wechselkriterien') || '').split('\n').map(x => x.trim()).filter(Boolean)
    .map(text => ({ text, erledigt: doneBefore.get(norm(text)) || false }));
  return b;
}

function saveEditor() {
  const b = readEditorForm();
  const i = state.builds.findIndex(x => x.id === b.id);
  if (i >= 0) state.builds[i] = b; else state.builds.push(b);
  if (!state.aktivId) state.aktivId = b.id;
  saveBuilds();
  buildIndex();
  state.editor = null;
  render();
  window.scrollTo(0, 0);
}

/* ---------------- Ansicht: Ziel-Ausrüstung ---------------- */

function slotQuelle(sl) {
  if (sl.quelle) return sl.quelle;
  const out = [];
  for (const t of [sl.zielItem, sl.zielAspekt]) {
    if (!t) continue;
    const n = norm(t);
    const e = INDEX.find(x => x.keys.some(k => hasWords(n, k)));
    if (e) out.push(...quellenFuer(e));
  }
  return [...new Set(out)].join(' · ');
}

function viewZiel() {
  if (!state.builds.length) return '<div class="msg info">Noch keine Builds angelegt.</div>';
  const id = buildById(state.zielViewId) ? state.zielViewId : (state.zielId || state.aktivId || state.builds[0].id);
  const b = buildById(id);
  const rows = SLOTS.map(s => ({ s, sl: b.slots[s.key] })).filter(x => x.sl.zielItem || x.sl.zielAspekt);
  const done = rows.filter(x => x.sl.erledigt).length;
  return `
    <label class="f">Build<select id="ziel-select">${state.builds.map(x =>
      `<option value="${x.id}" ${x.id === id ? 'selected' : ''}>${esc(x.name)}${x.id === state.zielId ? ' (Ziel)' : x.id === state.aktivId ? ' (aktiv)' : ''}</option>`).join('')}</select></label>
    ${rows.length ? `<p class="small muted">${done}/${rows.length} erledigt</p>
      <div class="progress"><span style="width:${Math.round(done / rows.length * 100)}%"></span></div>
      <div class="card">${rows.map(({ s, sl }) => {
        const q = slotQuelle(sl);
        return `<label class="check${sl.erledigt ? ' done' : ''}">
          <input type="checkbox" data-act="slot-done" data-id="${b.id}" data-slot="${s.key}" ${sl.erledigt ? 'checked' : ''}>
          <span class="ct"><span class="muted small">${esc(s.de)}</span><br>
            ${sl.zielItem ? `<b>${esc(sl.zielItem)}</b>` : ''}${sl.zielItem && sl.zielAspekt ? '<br>' : ''}${sl.zielAspekt ? `Aspekt: ${esc(sl.zielAspekt)}` : ''}
            <br><span class="small muted">Quelle: ${esc(q || '–')}</span></span></label>`;
      }).join('')}</div>`
      : '<div class="msg info">In diesem Build sind noch keine Ziel-Items oder Aspekte eingetragen.</div>'}`;
}

/* ---------------- Ansicht: Würfel-Rezepte ---------------- */

function viewWuerfel() {
  const r = state.data.rezepte;
  if (!r.length) return '<div class="msg info">Keine Würfel-Rezepte in data.json (Feld „rezepte“).</div>';
  return `<h2>Horadrimwürfel (Horadric Cube)</h2>` + r.map(x => `
    <div class="card">
      <div class="res-name">${esc(bi(x.name_de || x.name, x.name_en) || x.id || 'Rezept')}</div>
      <div class="res-rows">
        <div><span class="k">Input</span>${esc(listText(x.input) || '–')}</div>
        <div><span class="k">Kosten</span>${esc(listText(x.kosten) || '–')}</div>
        <div><span class="k">Ergebnis</span>${esc(listText(x.ergebnis) || '–')}</div>
        ${x.notiz ? `<div><span class="k">Notiz</span>${esc(x.notiz)}</div>` : ''}
      </div>
    </div>`).join('');
}

/* ---------------- Ansicht: Farm-Ziele ---------------- */

function viewFarmen() {
  const f = state.data.farmziele;
  if (!f.length) return '<div class="msg info">Keine Farm-Ziele in data.json (Feld „farmziele“).</div>';
  return `<h2>Farm-Ziele</h2>` + f.map(x => `
    <div class="card">
      <div class="res-head"><span class="res-name">${esc(bi(x.quelle_de || x.quelle, x.quelle_en) || '–')}</span>
        ${x.typ ? `<span class="res-typ">${esc(x.typ)}</span>` : ''}</div>
      <div class="res-rows">
        <div><span class="k">Belohnung</span>${esc(listText(x.belohnungen) || '–')}</div>
        ${x.kosten ? `<div><span class="k">Kosten</span>${esc(listText(x.kosten))}</div>` : ''}
        ${x.notiz ? `<div><span class="k">Notiz</span>${esc(x.notiz)}</div>` : ''}
      </div>
    </div>`).join('');
}

/* ---------------- Ansicht: Sammelliste ---------------- */

function viewSammeln() {
  const list = state.data.sammelliste;
  const manual = list.map(x => {
    const text = itemText(typeof x === 'string' ? x : { name_de: x.name_de || x.name, name_en: x.name_en });
    const k = norm(text);
    const done = !!state.sammelDone[k];
    return `<label class="check${done ? ' done' : ''}"><input type="checkbox" data-act="sammel" data-k="${esc(k)}" ${done ? 'checked' : ''}>
      <span class="ct">${esc(text)}${x.notiz ? `<br><span class="small muted">${esc(x.notiz)}</span>` : ''}</span></label>`;
  }).join('');

  const offen = [];
  for (const [b, rolle] of [[aktivBuild(), 'aktiv'], [zielBuild(), 'Ziel']]) {
    if (!b || (rolle === 'Ziel' && b === aktivBuild())) continue;
    for (const s of SLOTS) {
      const sl = b.slots[s.key];
      if (sl.erledigt) continue;
      for (const t of [sl.zielItem, sl.zielAspekt]) if (t) offen.push({ t, s, b, rolle });
    }
  }

  return `
    <h2>Aufheben!</h2>
    ${manual ? `<div class="card">${manual}</div>` : '<p class="small muted">Keine Einträge in „sammelliste“ (data.json).</p>'}
    <h2>Noch offen für deine Builds</h2>
    ${offen.length ? `<div class="card">${offen.map(o => `<div class="check"><span class="ct"><b>${esc(o.t)}</b><br>
      <span class="small muted">${esc(o.s.de)} · ${esc(o.b.name)} (${o.rolle})</span></span></div>`).join('')}</div>`
      : '<p class="small muted">Nichts offen – oder noch kein aktiver/Ziel-Build.</p>'}`;
}

/* ---------------- Ansicht: Daten ---------------- */

function viewDaten() {
  const d = state.data;
  const src = { datei: 'data/data.json (direkt gelesen)', cache: 'Zwischenspeicher (manuell geladene data.json)', leer: 'keine Daten geladen' }[state.dataSource] || '–';
  const exportObj = { builds: state.builds, aktiverBuild: state.aktivId, zielBuild: state.zielId };
  return `
    <h2>Datenquelle</h2>
    <div class="kv small"><span class="k">Quelle:</span> ${esc(src)}<br>
      <span class="k">Einträge:</span> ${d.eintraege.length} · <span class="k">Rezepte:</span> ${d.rezepte.length} ·
      <span class="k">Farm-Ziele:</span> ${d.farmziele.length} · <span class="k">Sammelliste:</span> ${d.sammelliste.length}</div>
    <div class="btn-row">
      <label class="btn">data.json manuell laden<input type="file" id="file-data" accept=".json,application/json" hidden></label>
      <button class="btn" data-act="reload">Neu laden</button>
    </div>
    <p class="small muted">Manuell geladene Daten werden im Browser zwischengespeichert und genutzt, falls data.json nicht direkt lesbar ist (z. B. beim Öffnen per Doppelklick).</p>

    <h2>Builds sichern</h2>
    <p class="small muted">Builds und Häkchen liegen im Browser (localStorage). Zum dauerhaften Sichern den Block unten in data.json bei „builds“, „aktiverBuild“, „zielBuild“ einsetzen.</p>
    <div class="btn-row">
      <button class="btn" data-act="export-dl">Als Datei herunterladen</button>
      <button class="btn" data-act="export-copy">Kopieren</button>
    </div>
    <pre class="json" id="export-json">${esc(JSON.stringify(exportObj, null, 2))}</pre>

    <h2>Builds importieren</h2>
    <label class="f">JSON einfügen (Format wie oben, oder eine ganze data.json)<textarea id="import-json"></textarea></label>
    <div class="btn-row">
      <button class="btn" data-act="import-builds">Importieren (ersetzt Builds)</button>
    </div>

    <h2>Zurücksetzen</h2>
    <div class="btn-row">
      <button class="btn danger" data-act="reset-builds">Builds aus data.json neu übernehmen</button>
      <button class="btn danger" data-act="reset-sammeln">Sammel-Häkchen löschen</button>
    </div>`;
}

function applyImportedBuilds(obj) {
  const builds = Array.isArray(obj) ? obj : obj.builds;
  if (!Array.isArray(builds)) throw new Error('Kein „builds“-Array gefunden.');
  state.builds = builds.map(normalizeBuild);
  state.aktivId = (!Array.isArray(obj) && obj.aktiverBuild) || '';
  state.zielId = (!Array.isArray(obj) && obj.zielBuild) || '';
  if (!buildById(state.aktivId)) state.aktivId = state.builds[0] ? state.builds[0].id : '';
  if (!buildById(state.zielId)) state.zielId = '';
  saveBuilds();
  buildIndex();
}

/* ---------------- Events ---------------- */

document.addEventListener('click', e => {
  const tabBtn = e.target.closest('#tabs button');
  if (tabBtn) { setTab(tabBtn.dataset.tab); return; }

  const el = e.target.closest('[data-act]');
  if (!el || el.type === 'checkbox') return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  const b = id ? buildById(id) : null;

  switch (act) {
    case 'new':
      startEditor({ datum: today() }, true); break;
    case 'open-import':
      state.importOpen = true; render(); break;
    case 'cancel':
      if (state.editor && state.editor.preview && !confirm('Vorschau verwerfen?')) return;
      state.editor = null; state.importOpen = false; render(); break;
    case 'edit':
      startEditor(b, false); break;
    case 'dup': {
      const c = structuredClone(b);
      c.id = newId(); c.name = b.name + ' (Kopie)';
      state.builds.push(c); saveBuilds(); buildIndex(); render(); break;
    }
    case 'del':
      if (!confirm(`Build „${b.name}“ löschen?`)) return;
      state.builds = state.builds.filter(x => x.id !== id);
      if (state.aktivId === id) state.aktivId = '';
      if (state.zielId === id) state.zielId = '';
      saveBuilds(); buildIndex(); render(); break;
    case 'set-aktiv':
      state.aktivId = id; saveBuilds(); render(); break;
    case 'set-ziel':
      state.zielId = id; saveBuilds(); render(); break;
    case 'unset-ziel':
      state.zielId = ''; saveBuilds(); render(); break;
    case 'parse': {
      const text = $('#imp-text').value;
      if (!text.trim()) { alert('Bitte zuerst Guide-Text einfügen.'); return; }
      const r = parseGuide(text);
      const name = $('#imp-name').value.trim() || r.firstLine.slice(0, 60);
      startEditor({
        name, datum: $('#imp-datum').value || today(),
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
        const item = $(`[name="${s.key}.zielItem"]`).value.trim();
        const asp = $(`[name="${s.key}.zielAspekt"]`).value.trim();
        const t = item || asp;
        if (!t) continue;
        const line = `${s.de}: ${t}`;
        if (!have.has(norm(line))) add.push(line);
      }
      ta.value = [ta.value.trim(), ...add].filter(Boolean).join('\n');
      break;
    }
    case 'reload':
      location.reload(); break;
    case 'export-dl': {
      const blob = new Blob([$('#export-json').textContent], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `d4-builds-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      break;
    }
    case 'export-copy':
      navigator.clipboard?.writeText($('#export-json').textContent)
        .then(() => { el.textContent = 'Kopiert ✓'; }, () => alert('Kopieren nicht möglich – bitte manuell markieren.'));
      break;
    case 'import-builds':
      try {
        applyImportedBuilds(JSON.parse($('#import-json').value));
        alert(`${state.builds.length} Build(s) importiert.`); render();
      } catch (err) { alert('Import fehlgeschlagen: ' + err.message); }
      break;
    case 'reset-builds':
      if (!confirm('Alle Builds im Browser durch die aus data.json ersetzen? Häkchen gehen verloren.')) return;
      state.builds = structuredClone(state.data.builds);
      state.aktivId = buildById(state.data.aktiverBuild) ? state.data.aktiverBuild : '';
      state.zielId = buildById(state.data.zielBuild) ? state.data.zielBuild : '';
      saveBuilds(); buildIndex(); render(); break;
    case 'reset-sammeln':
      if (!confirm('Alle Sammel-Häkchen löschen?')) return;
      state.sammelDone = {}; lsSet(LS.sammeln, {}); render(); break;
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'ziel-select') { state.zielViewId = el.value; render(); return; }
  if (el.id === 'file-data') {
    const file = el.files && el.files[0];
    if (!file) return;
    file.text().then(txt => {
      const obj = JSON.parse(txt);
      lsSet(LS.dataCache, { zeit: Date.now(), data: obj });
      state.dataSource = 'cache';
      state.dataError = '';
      applyData(obj);
      render();
      alert('data.json geladen.');
    }).catch(err => alert('Datei ist kein gültiges JSON: ' + err.message));
    return;
  }
  if (el.type !== 'checkbox' || !el.dataset.act) return;
  const b = buildById(el.dataset.id);
  switch (el.dataset.act) {
    case 'wk':
      b.wechselkriterien[+el.dataset.i].erledigt = el.checked; saveBuilds(); break;
    case 'slot-done':
      b.slots[el.dataset.slot].erledigt = el.checked; saveBuilds(); break;
    case 'sammel':
      if (el.checked) state.sammelDone[el.dataset.k] = true; else delete state.sammelDone[el.dataset.k];
      lsSet(LS.sammeln, state.sammelDone); break;
  }
  render();
});

document.addEventListener('submit', e => {
  if (e.target.id === 'build-form') { e.preventDefault(); saveEditor(); }
});

/* ---------------- Start ---------------- */

(async function init() {
  state.tab = lsGet(LS.tab, 'suche') || 'suche';
  await loadData();
  render();
})();
