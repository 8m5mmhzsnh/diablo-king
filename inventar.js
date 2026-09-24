'use strict';

/* ================================================================
   Inventar, Slot-Analyse, „Nächster Schritt“ und Screenshot-Erkennung.
   Die Logik (analysiereSlot, parseTooltip) steht in lib.js.
   ================================================================ */

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

const GRENZEN_HTML = `
  <details class="grenzen">
    <summary>Was diese Analyse <b>nicht</b> kann</summary>
    <ul>
      <li>Keine Werte-Vergleiche gegen Roll-Bereiche – es gibt keine Datenbank mit Min-/Max-Werten.
        Also nie „dein Roll ist 85 % vom Maximum“. Ob ein Wert schwach ist, markierst du selbst.</li>
      <li>Keine Schadensberechnung und kein Vergleich zweier Items nach DPS.</li>
      <li>Die Empfehlungen sind Regelanwendung auf deine bestätigten Werte und die Build-Vorgaben – kein Simulator.
        Im Zweifel gilt die Vorschau im Spiel.</li>
    </ul>
  </details>`;

const INFO_ICON = { warn: '⚠', unsicher: '❓', info: 'ℹ' };

/* ---------------- Analyse-Aufrufe ---------------- */

function slotHatZiel(sl) {
  return !!(sl && (sl.zielItem || sl.zielAspekt || sl.sockel || (sl.affixe && sl.affixe.length) || sl.haertung));
}

function analysenFuerSlot(slotKey) {
  const ab = aktivBuild(), zb = zielBuild();
  const p = state.profil;
  const run = (build, anderer) => analysiereSlot({
    slotKey, item: p.inventar[slotKey], build, andererBuild: anderer,
    charakter: p.charakter, bestand: p.bestand, wissen: state.wissen,
  });
  const out = [];
  if (ab) out.push({ rolle: 'aktiv', build: ab, r: run(ab, zb) });
  if (zb && zb !== ab && slotHatZiel(zb.slots[slotKey])) out.push({ rolle: 'ziel', build: zb, r: run(zb, ab) });
  if (!ab && !zb) out.push({ rolle: 'keiner', build: null, r: run(null, null) });
  return out;
}

/* ---------------- Rendering-Bausteine ---------------- */

function materialHtml(m) {
  if (!m) return '';
  const eng = istEngpass(state.wissen, m);
  return `<div class="small">braucht ${m.menge ? esc(m.menge) + ' ' : ''}${esc(bi(m.de, m.en))}${eng ? ' <span class="tag warn">Engpass</span>' : ''}</div>`;
}

function quellenHtml(a) {
  if (!a.quellen) return '';
  if (!a.quellen.length) return '<div class="small muted">Quelle: – (in wissen.json unter uniqueQuellen oder farmziele ergänzen)</div>';
  return `<div class="small">Quelle: ${a.quellen.map(q => q.farm
    ? `<a href="#" data-act="goto-tab" data-tab="farmziele">${esc(q.text)}</a>` : esc(q.text)).join(' · ')}</div>`;
}

function aktionHtml(a, extra = '') {
  const rez = a.rezept
    ? `<div class="small">${a.rezept.fehlt ? 'Rezept „reroll-affixwerte“ fehlt in wissen.json → rezepte.' : `<a href="#" data-act="goto-tab" data-tab="rezepte">Rezept ansehen: ${esc(bi(a.rezept.name_de || a.rezept.id, a.rezept.name_en))}</a>`}</div>` : '';
  return `<li class="aktion">
    <span class="prio ${a.prio}">${esc(a.prio)}</span>${extra}
    <b>${esc(a.text)}</b>
    ${a.grund ? `<div class="small muted">${esc(a.grund)}</div>` : ''}
    ${a.kandidaten && a.kandidaten.length > 1 ? `<div class="small muted">Umrollbare Zeilen, schlechteste zuerst: ${esc(a.kandidaten.join(' · '))}</div>` : ''}
    ${materialHtml(a.material)}${quellenHtml(a)}${rez}
    ${a.warnung ? `<div class="hinweis warn">⚠ ${esc(a.warnung)}</div>` : ''}
    ${a.zusatz ? `<div class="small muted">${esc(a.zusatz)}</div>` : ''}
  </li>`;
}

function analyseHtml({ rolle, build, r }) {
  const titel = rolle === 'aktiv' ? `Aktueller Build „${esc(build.name)}“` : rolle === 'ziel' ? `Ziel-Build „${esc(build.name)}“` : 'Kein Build';
  const infos = r.infos.map(i => `<li class="hinweis ${i.art}">${INFO_ICON[i.art] || 'ℹ'} ${esc(i.text)}</li>`).join('');
  let rf = '';
  if (r.reihenfolge.length) {
    const n = reihenfolgeNotiz(state.wissen);
    rf = `<div class="reihenfolge"><b>Reihenfolge:</b>
      <ol>${r.reihenfolge.map(a => `<li>${esc(KATEGORIE_LABEL[a.kategorie] || a.kategorie)}: ${esc(a.text)}</li>`).join('')}</ol>
      ${n.index >= 0 ? `<a href="#" data-act="goto-notiz" data-i="${n.index}">Warum diese Reihenfolge? → Notiz</a>`
        : '<span class="small muted">Notiz „In welcher Reihenfolge bearbeite ich ein Item?“ fehlt in wissen.json.</span>'}</div>`;
  }
  return `<div class="analyse ${rolle}">
    <div class="analyse-titel">${rolle === 'ziel' ? '<span class="badge ziel">Ziel</span>' : rolle === 'aktiv' ? '<span class="badge aktiv">Aktiv</span>' : ''} ${titel}</div>
    ${r.aktionen.length ? `<ul class="aktionen">${r.aktionen.map(a => aktionHtml(a)).join('')}</ul>` : '<p class="small muted">Keine Aktion nötig.</p>'}
    ${rf}
    ${infos ? `<ul class="hinweise">${infos}</ul>` : ''}
  </div>`;
}

function itemKurzHtml(it) {
  const tags = [
    it.seltenheit && `<span class="tag">${esc(seltenheitAnzeige(selKanon(it.seltenheit)))}</span>`,
    it.vermacht && '<span class="tag warn">vermacht</span>',
    it.gegenstandsmacht && `<span class="tag">${esc(it.gegenstandsmacht)} GM</span>`,
    `<span class="tag">${it.quelle === 'ocr' ? 'OCR, bestätigt' : 'manuell'}</span>`,
  ].filter(Boolean).join('');
  const aff = it.affixe.map(a => `<li>${a.wert ? `<b>${esc(a.wert)}</b> ` : ''}${esc(a.text)}
    ${a.implizit ? '<span class="mini">impl.</span>' : ''}${a.gross ? '<span class="mini gross">groß</span>' : ''}${a.verzaubert ? '<span class="mini verz">verz.</span>' : ''}${a.schwach ? '<span class="mini">schwach</span>' : ''}</li>`).join('');
  const sock = it.sockel.length ? it.sockel.map(s => s.gefuellt && s.inhalt ? esc(s.inhalt) : '<i>leer</i>').join(', ') : 'keiner';
  return `<div class="item-name">${esc(it.name || '(ohne Namen)')} ${it.stand ? staleIcon(it.stand) : ''}</div>
    <div class="small muted">${esc(it.itemTyp || '')}</div>
    <div>${tags}</div>
    ${aff ? `<ul class="affixe">${aff}</ul>` : '<p class="small muted">Keine Affixe erfasst.</p>'}
    <div class="kv small">
      ${it.aspekt ? `<span class="k">Aspekt:</span> ${esc(it.aspekt)}<br>` : ''}
      <span class="k">Sockel:</span> ${sock} ·
      <span class="k">Härtung:</span> ${it.haertungen.max ? `${it.haertungen.genutzt}/${it.haertungen.max}` : '–'}${it.haertungen.affix ? ` (${esc(it.haertungen.affix)})` : ''} ·
      <span class="k">Vollendung:</span> ${it.vollendung.stufe}/${it.vollendung.max}
      ${it.stand ? `<br><span class="k">Stand:</span> ${esc(it.stand)}` : ''}
    </div>`;
}

/* ---------------- Ansicht: Inventar ---------------- */

function viewInventar() {
  const p = state.profil;
  const ab = aktivBuild();
  const c = p.charakter;
  const cards = SLOTS.map(s => {
    const it = p.inventar[s.key];
    const sl = ab && ab.slots[s.key];
    const ziel = sl ? [sl.zielItem, sl.zielAspekt && `Aspekt: ${sl.zielAspekt}`].filter(Boolean).join(' · ') : '';
    return `<div class="card inv-card" data-slot="${s.key}" tabindex="0">
      <div class="inv-head"><b>${esc(s.de)}</b> <span class="muted small">(${esc(s.en)})</span>
        ${ziel ? `<div class="small muted">Ziel: ${esc(ziel)}</div>` : ''}</div>
      ${it ? `${itemKurzHtml(it)}
        <div class="btn-row">
          <button class="btn" data-act="inv-edit" data-slot="${s.key}">Bearbeiten</button>
          <label class="btn">Neuer Screenshot<input type="file" accept="image/*" hidden data-inv-file="${s.key}"></label>
          <button class="btn danger" data-act="inv-del" data-slot="${s.key}">Entfernen</button>
        </div>`
      : `<label class="drop" data-slot="${s.key}">
          <input type="file" accept="image/*" hidden data-inv-file="${s.key}">
          <b>Screenshot hier einfügen</b>
          <span class="small muted">tippen zum Auswählen · Strg+V · hineinziehen</span>
        </label>
        <button class="btn" data-act="inv-manuell" data-slot="${s.key}">Manuell erfassen</button>`}
      ${analysenFuerSlot(s.key).map(analyseHtml).join('')}
    </div>`;
  }).join('');

  return `
    ${GRENZEN_HTML}
    <div class="inv-top">
      <label class="btn primary">📷 Screenshot wählen<input type="file" accept="image/*" hidden data-inv-file=""></label>
      <span class="small muted">oder irgendwo einfügen (Strg+V) – der Slot wird vorgeschlagen.</span>
    </div>
    <div class="kv small">Qualstufe: <b>${esc(c.qualstufe || '–')}</b> · Paragon: <b>${esc(c.paragon || '–')}</b>
      <a href="#" data-act="open-dateien">ändern</a></div>
    <div class="inv-grid">${cards}</div>
    ${viewBestand()}`;
}

function viewBestand() {
  const b = state.profil.bestand;
  const bekannt = Object.values(MATERIAL).map(m => m.de);
  const namen = [...new Set([...bekannt, ...Object.keys(b)])];
  return `<h2>Material-Bestand</h2>
    <p class="small muted">Leer = unbekannt. Wird z. B. für die Warnung „Kein Reset möglich“ beim Härten genutzt.</p>
    <form id="bestand-form" class="card" autocomplete="off">
      ${namen.map((n, i) => `<div class="bestand-row">
        <label for="best-${i}">${esc(n)}${MATERIAL_EN(n) ? ` <span class="muted small">(${esc(MATERIAL_EN(n))})</span>` : ''}</label>
        <input id="best-${i}" type="text" inputmode="numeric" name="b.${esc(n)}" value="${esc(b[n] ?? '')}">
      </div>`).join('')}
      <div class="bestand-row"><input type="text" name="neu-name" placeholder="weiteres Material"><input type="text" inputmode="numeric" name="neu-wert" placeholder="Anzahl"></div>
      <button class="btn primary" type="submit">Speichern</button>
    </form>`;
}
function MATERIAL_EN(de) {
  const m = Object.values(MATERIAL).find(x => x.de === de);
  return m ? m.en : '';
}

/* ---------------- Ansicht: Item-Editor ---------------- */

function schliesseInvEditor() {
  if (state.invEditor && state.invEditor.bild) URL.revokeObjectURL(state.invEditor.bild);
  state.invEditor = null;
}

function oeffneInvEditor(slot, item, extra = {}) {
  schliesseInvEditor();
  state.tab = 'inventar';
  state.dateienOpen = false;
  state.invEditor = Object.assign({
    draft: normalizeItem(structuredClone(item || leeresItem())), slot: slot || '', slotHint: slot || '',
    vorschlag: null, bild: '', status: '', laeuft: false, roh: '', implizitHinweis: '', neu: !item,
  }, extra);
  render();
  window.scrollTo(0, 0);
}

function konfHtml(k) {
  if (k == null) return '<span class="konf none" title="manuell">–</span>';
  const cls = k < 60 ? 'low' : k < 80 ? 'mid' : 'high';
  return `<span class="konf ${cls}" title="Erkennungs-Konfidenz">${k} %</span>`;
}

function viewInvEditor() {
  const ed = state.invEditor;
  const d = ed.draft;
  const vs = ed.vorschlag;
  const seltOpt = state.wissen.seltenheitSynonyme.map(s =>
    `<option value="${esc(s.id)}" ${selKanon(d.seltenheit) === s.id ? 'selected' : ''}>${esc(bi(s.name_de, s.name_en))}</option>`).join('');
  const slotOpt = SLOTS.map(s => `<option value="${s.key}" ${ed.slot === s.key ? 'selected' : ''}>${esc(s.de)}${vs && vs.key === s.key ? ' ← Vorschlag' : ''}</option>`).join('');
  const bestehend = ed.slot && state.profil.inventar[ed.slot];

  return `
    <h2>${ed.neu ? 'Item erfassen' : 'Item bearbeiten'}</h2>
    ${ed.status ? `<div class="msg ${ed.fehler ? 'err' : 'info'}" id="ocr-status">${esc(ed.status)}</div>` : '<div id="ocr-status"></div>'}
    ${ed.bild ? `<details class="slot" open><summary>Screenshot</summary><img class="shot" src="${ed.bild}" alt="Tooltip-Screenshot"></details>` : ''}
    <div class="msg warn">Die Analyse nutzt nur, was du hier bestätigst – nie den rohen Erkennungstext.
      Erst „Übernehmen“ schreibt ins Inventar.</div>
    <form id="inv-form" autocomplete="off">
      <label class="f">Slot
        <select name="slot" required><option value="">– bitte wählen –</option>${slotOpt}</select></label>
      ${vs && vs.key ? `<p class="small muted">Vorschlag: <b>${esc(SLOT_BY_KEY[vs.key].de)}</b> (${esc(vs.warum)})${ed.slotHint && ed.slotHint !== vs.key ? ` – eingefügt hast du bei <b>${esc(SLOT_BY_KEY[ed.slotHint].de)}</b>.` : ''}</p>` : ''}
      ${bestehend && ed.neu ? `<p class="small warn-text">Im gewählten Slot liegt schon „${esc(bestehend.name)}“ – Übernehmen ersetzt es.</p>` : ''}
      <div class="grid2">
        <label class="f">Name<input type="text" name="name" value="${esc(d.name)}"></label>
        <label class="f">Slug (für katalog.json)<input type="text" name="slug" value="${esc(d.slug)}"></label>
        <label class="f">Seltenheit<select name="seltenheit"><option value="">–</option>${seltOpt}</select></label>
        <label class="f">Item-Typ<input type="text" name="itemTyp" value="${esc(d.itemTyp)}"></label>
        <label class="f">Gegenstandsmacht<input type="text" inputmode="numeric" name="gegenstandsmacht" value="${esc(d.gegenstandsmacht)}"></label>
        <label class="f">Geprägter Aspekt<input type="text" name="aspekt" list="dl-names" value="${esc(d.aspekt)}"></label>
      </div>
      <label class="check-inline"><input type="checkbox" name="vermacht" ${d.vermacht ? 'checked' : ''}> vermacht (Ancestral)</label>

      <h3>Affixe <span class="small muted">– der unzuverlässigste Teil der Erkennung, bitte Zeile für Zeile prüfen</span></h3>
      ${ed.implizitHinweis ? `<div class="msg info small">${esc(ed.implizitHinweis)}</div>` : ''}
      <div class="affix-rows">
        ${d.affixe.map((a, i) => `<div class="affix-row${a.konfidenz != null && a.konfidenz < 60 ? ' unsicher' : ''}">
          <div class="affix-main">
            ${konfHtml(a.konfidenz)}
            <input type="text" name="a.${i}.wert" value="${esc(a.wert)}" placeholder="Wert" class="wert">
            <input type="text" name="a.${i}.text" value="${esc(a.text)}" placeholder="Affix">
            <button type="button" class="icon-btn" data-act="inv-del-affix" data-i="${i}" aria-label="Zeile löschen">×</button>
          </div>
          <div class="affix-flags">
            <label><input type="checkbox" name="a.${i}.implizit" ${a.implizit ? 'checked' : ''}> implizit</label>
            <label><input type="checkbox" name="a.${i}.gross" ${a.gross ? 'checked' : ''}> groß</label>
            <label><input type="checkbox" name="a.${i}.verzaubert" ${a.verzaubert ? 'checked' : ''}> verzaubert</label>
            <label><input type="checkbox" name="a.${i}.schwach" ${a.schwach ? 'checked' : ''}> Wert schwach</label>
            ${a.lang ? '<span class="small warn-text">lange Zeile – vermutlich Effekttext, kein Affix?</span>' : ''}
          </div>
        </div>`).join('') || '<p class="small muted">Keine Affixe.</p>'}
      </div>
      <button type="button" class="btn" data-act="inv-add-affix">+ Affix</button>

      <h3>Sockel</h3>
      ${d.sockel.map((s, i) => `<div class="add-row">
        <label class="check-inline"><input type="checkbox" name="s.${i}.gefuellt" ${s.gefuellt ? 'checked' : ''}> gefüllt</label>
        <input type="text" name="s.${i}.inhalt" value="${esc(s.inhalt)}" placeholder="Inhalt, z. B. Edelstein">
        <button type="button" class="icon-btn" data-act="inv-del-sockel" data-i="${i}" aria-label="Sockel löschen">×</button>
      </div>`).join('') || '<p class="small muted">Kein Sockel.</p>'}
      <button type="button" class="btn" data-act="inv-add-sockel">+ Sockel</button>

      <h3>Härtungen &amp; Vollendung</h3>
      <div class="grid2">
        <label class="f">Härtungen genutzt<input type="text" inputmode="numeric" name="h.genutzt" value="${esc(d.haertungen.genutzt)}"></label>
        <label class="f">Härtungen max<input type="text" inputmode="numeric" name="h.max" value="${esc(d.haertungen.max)}"></label>
        <label class="f">Härtungs-Affix<input type="text" name="h.affix" value="${esc(d.haertungen.affix)}"></label>
        <label class="f">Vollendung Stufe<input type="text" inputmode="numeric" name="v.stufe" value="${esc(d.vollendung.stufe)}"></label>
        <label class="f">Vollendung max<input type="text" inputmode="numeric" name="v.max" value="${esc(d.vollendung.max)}"></label>
        <label class="f">Stand<input type="date" name="stand" value="${esc(d.stand || today())}"></label>
        <label class="f">Quelle<select name="quelle">
          <option value="ocr" ${d.quelle === 'ocr' ? 'selected' : ''}>ocr</option>
          <option value="manuell" ${d.quelle !== 'ocr' ? 'selected' : ''}>manuell</option></select></label>
      </div>
      ${ed.roh ? `<details class="slot"><summary>Roh-Text der Erkennung (nur zum Vergleich)</summary><pre class="json">${esc(ed.roh)}</pre></details>` : ''}
      ${namenDatalist()}
      <div class="btn-row" style="margin-top:14px">
        <button type="submit" class="btn primary" ${ed.laeuft ? 'disabled' : ''}>Übernehmen</button>
        <button type="button" class="btn" data-act="inv-cancel">Verwerfen</button>
      </div>
    </form>`;
}

/** Liest das Formular in den Entwurf zurück (vor jeder Strukturänderung und beim Übernehmen). */
function leseInvForm() {
  const f = $('#inv-form');
  const ed = state.invEditor;
  if (!f || !ed) return;
  const fd = new FormData(f);
  const d = ed.draft;
  const g = k => String(fd.get(k) ?? '').trim();
  ed.slot = g('slot');
  for (const k of ['name', 'slug', 'seltenheit', 'itemTyp', 'aspekt', 'stand', 'quelle']) d[k] = g(k);
  d.gegenstandsmacht = g('gegenstandsmacht') === '' ? '' : Number(g('gegenstandsmacht')) || g('gegenstandsmacht');
  d.vermacht = fd.get('vermacht') === 'on';
  d.affixe = d.affixe.map((a, i) => ({
    ...a, text: g(`a.${i}.text`), wert: g(`a.${i}.wert`),
    implizit: fd.get(`a.${i}.implizit`) === 'on', gross: fd.get(`a.${i}.gross`) === 'on',
    verzaubert: fd.get(`a.${i}.verzaubert`) === 'on', schwach: fd.get(`a.${i}.schwach`) === 'on',
  }));
  d.sockel = d.sockel.map((s, i) => ({ gefuellt: fd.get(`s.${i}.gefuellt`) === 'on', inhalt: g(`s.${i}.inhalt`) }));
  d.haertungen = { genutzt: g('h.genutzt'), max: g('h.max'), affix: g('h.affix') };
  d.vollendung = { stufe: g('v.stufe'), max: g('v.max') };
}

function uebernehmeInvItem() {
  leseInvForm();
  const ed = state.invEditor;
  if (!ed.slot) { alert('Bitte einen Slot wählen.'); return; }
  const d = ed.draft;
  if (d.affixe.filter(a => a.verzaubert).length > 1) {
    alert('Pro Item ist nur EIN Affix verzauberbar – bitte nur eine Zeile als „verzaubert“ markieren.');
    return;
  }
  d.affixe = d.affixe.filter(a => a.text || a.wert);
  const alt = state.profil.inventar[ed.slot];
  if (alt && ed.neu && !confirm(`Im Slot ${SLOT_BY_KEY[ed.slot].de} liegt „${alt.name}“. Ersetzen?`)) return;
  const item = normalizeItem(d);
  if (!item.stand) item.stand = today();
  if (!item.slug && item.name) item.slug = slugify(item.name);
  // Ursprünglicher Slot beim Bearbeiten verschoben → alten leeren
  if (!ed.neu && ed.slotHint && ed.slotHint !== ed.slot) state.profil.inventar[ed.slotHint] = null;
  state.profil.inventar[ed.slot] = item;
  saveProfil();
  const slot = ed.slot;
  schliesseInvEditor();
  render();
  document.querySelector(`.inv-card[data-slot="${slot}"]`)?.scrollIntoView({ block: 'start' });
}

/* ---------------- Screenshot-Erkennung ---------------- */

let tessLaden = null, tessWorker = null;

function ladeTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (!tessLaden) {
    tessLaden = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = TESSERACT_URL;
      s.onload = res;
      s.onerror = () => { tessLaden = null; rej(new Error('Texterkennung konnte nicht geladen werden (offline?)')); };
      document.head.appendChild(s);
    });
  }
  return tessLaden;
}

function setOcrStatus(text) {
  if (state.invEditor) state.invEditor.status = text;
  const el = document.getElementById('ocr-status');
  if (el) { el.className = 'msg info'; el.textContent = text; }
}

async function holeWorker() {
  if (tessWorker) return tessWorker;
  await ladeTesseract();
  const sprache = state.profil.einstellungen.ocrSprache || 'eng';
  tessWorker = await window.Tesseract.createWorker(sprache, 1, {
    logger: m => {
      if (!m || !m.status) return;
      const pct = m.progress != null ? ` ${Math.round(m.progress * 100)} %` : '';
      const was = /recogniz/.test(m.status) ? 'Erkenne Text' : 'Lade Texterkennung';
      setOcrStatus(`${was} …${pct}`);
    },
  });
  return tessWorker;
}

/** Tooltip vorbereiten: vergrößern, Graustufen, bei dunklem Hintergrund invertieren. */
async function vorbereiten(blob) {
  const bmp = await createImageBitmap(blob);
  const faktor = bmp.width < 1000 ? Math.min(3, 1400 / bmp.width) : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * faktor);
  c.height = Math.round(bmp.height * faktor);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const px = img.data;
  let summe = 0;
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    px[i] = px[i + 1] = px[i + 2] = g;
    summe += g;
  }
  const dunkel = summe / (px.length / 4) < 128;
  if (dunkel) for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = 255 - px[i];
  ctx.putImageData(img, 0, 0);
  return c;
}

async function starteOcr(blob, slotHint) {
  const bild = URL.createObjectURL(blob);
  oeffneInvEditor(slotHint, null, { bild, status: 'Lade Texterkennung …', laeuft: true });
  state.invEditor.draft.quelle = 'ocr';
  const ed = state.invEditor;
  try {
    const canvas = await vorbereiten(blob);
    const worker = await holeWorker();
    setOcrStatus('Erkenne Text …');
    const { data } = await worker.recognize(canvas);
    if (state.invEditor !== ed) return;   // inzwischen verworfen
    const lines = (data.lines || []).map(l => ({ text: l.text, confidence: l.confidence }));
    const r = parseTooltip(lines, { wissen: state.wissen, katalog: state.katalog, inventar: state.profil.inventar });
    ed.draft = r.item;
    ed.vorschlag = r.slot;
    ed.roh = r.roh;
    ed.implizitHinweis = r.implizitHinweis;
    ed.slot = slotHint || r.slot.key || '';
    ed.status = lines.length
      ? 'Erkannt – bitte jedes Feld prüfen und korrigieren, dann „Übernehmen“.'
      : 'Kein Text erkannt – bitte die Felder von Hand ausfüllen.';
  } catch (err) {
    if (state.invEditor !== ed) return;
    console.error(err);
    ed.fehler = true;
    ed.status = `Erkennung fehlgeschlagen: ${err.message}. Du kannst die Felder von Hand ausfüllen.`;
  }
  ed.laeuft = false;
  if (state.invEditor === ed && state.tab === 'inventar') render();
}

function bildAus(dataTransfer) {
  if (!dataTransfer) return null;
  for (const it of dataTransfer.items || []) {
    if (it.kind === 'file' && it.type.startsWith('image/')) return it.getAsFile();
  }
  for (const f of dataTransfer.files || []) if (f.type.startsWith('image/')) return f;
  return null;
}

let letzterSlot = '';

/* ---------------- Ansicht: Nächster Schritt ---------------- */

function viewNaechster() {
  const eintraege = new Map();
  let itemsErfasst = 0;
  SLOTS.forEach((s, si) => {
    if (state.profil.inventar[s.key]) itemsErfasst++;
    for (const { rolle, r } of analysenFuerSlot(s.key)) {
      for (const a of r.aktionen) {
        const key = `${s.key}|${a.kategorie}|${a.text}`;
        const vorh = eintraege.get(key);
        if (vorh) { if (vorh.rolle !== rolle) vorh.rolle = 'beide'; continue; }
        eintraege.set(key, { a, s, si, rolle });
      }
    }
  });
  const alle = [...eintraege.values()].sort((x, y) =>
    PRIO_RANG[x.a.prio] - PRIO_RANG[y.a.prio] || x.si - y.si);
  const gruppe = g => alle.filter(x => x.a.gruppe === g);
  const liste = xs => xs.length ? `<ul class="aktionen">${xs.map(({ a, s, rolle }) => aktionHtml(a,
    ` <span class="tag">${esc(s.de)}</span>${rolle === 'aktiv' ? '<span class="badge aktiv">aktiv</span>' : rolle === 'ziel' ? '<span class="badge ziel">Ziel</span>' : rolle === 'beide' ? '<span class="badge both">beide</span>' : ''} `)).join('')}</ul>`
    : '<p class="small muted">Nichts offen.</p>';

  const eng = engpassListe(state.wissen);
  const zb = zielBuild();
  const auf = state.profil.offeneAufgaben;

  return `
    ${GRENZEN_HTML}
    ${itemsErfasst === 0 ? '<div class="msg info">Noch keine Items im Inventar – unter „Inventar“ Screenshots einfügen. Bis dahin steht hier nur, was du besorgen musst.</div>' : ''}
    <h2>Kostet nur Gold</h2>
    <p class="small muted">Aspekt überprägen, verzaubern, sockeln</p>
    <div class="card">${liste(gruppe('gold'))}</div>
    <h2>Braucht knappe Materialien</h2>
    <div class="card">${liste(gruppe('material'))}</div>
    <h2>Beschaffen / ersetzen</h2>
    <div class="card">${liste(gruppe('beschaffen'))}</div>

    <h3>Engpässe</h3>
    <p class="small">${eng.liste.length ? esc(eng.liste.join(' · ')) : '<span class="muted">Keine hinterlegt.</span>'}
      <span class="muted">${eng.abgeleitet ? '– abgeleitet aus Einträgen mit typ „material“ (wissen.engpaesse fehlt)' : '– aus wissen.engpaesse'}</span></p>

    <h2>Wechselkriterien Ziel-Build${zb ? `: ${esc(zb.name)}` : ''}</h2>
    ${!zb ? '<p class="small muted">Kein Ziel-Build gesetzt.</p>' : zb.wechselkriterien.length
      ? `<div class="card">${zb.wechselkriterien.map((w, i) => `<label class="check${w.erledigt ? ' done' : ''}">
          <input type="checkbox" data-act="wk" data-id="${esc(zb.id)}" data-i="${i}" ${w.erledigt ? 'checked' : ''}>
          <span class="ct">${esc(w.text)}</span></label>`).join('')}</div>`
      : '<p class="small muted">Keine Kriterien eingetragen.</p>'}

    <h2>Offene Aufgaben</h2>
    ${auf.length ? `<div class="card">${auf.map((a, i) => `<div class="check${a.erledigt ? ' done' : ''}">
      <input type="checkbox" data-act="aufgabe" data-i="${i}" ${a.erledigt ? 'checked' : ''} aria-label="erledigt">
      <span class="ct">${esc(a.text)}</span></div>`).join('')}</div>` : '<p class="small muted">Keine.</p>'}`;
}

/* ---------------- Events ---------------- */

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const slot = el.dataset.slot;
  const p = state.profil;
  switch (act) {
    case 'goto-tab': e.preventDefault(); setTab(el.dataset.tab); break;
    case 'goto-notiz': {
      e.preventDefault();
      setTab('wissen');
      const d = document.getElementById(`notiz-${el.dataset.i}`);
      if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); }
      break;
    }
    case 'open-dateien': e.preventDefault(); state.dateienOpen = true; render(); window.scrollTo(0, 0); break;
    case 'inv-manuell': oeffneInvEditor(slot, null); break;
    case 'inv-edit': oeffneInvEditor(slot, p.inventar[slot], { neu: false }); break;
    case 'inv-del':
      if (!confirm(`„${p.inventar[slot].name}“ aus dem Inventar entfernen?`)) return;
      p.inventar[slot] = null; saveProfil(); render(); break;
    case 'inv-cancel':
      if (!confirm('Entwurf verwerfen? Nichts wird ins Inventar geschrieben.')) return;
      schliesseInvEditor(); render(); break;
    case 'inv-add-affix':
      leseInvForm();
      state.invEditor.draft.affixe.push({ text: '', wert: '', gross: false, implizit: false, verzaubert: false, schwach: false, konfidenz: null });
      render(); break;
    case 'inv-del-affix':
      leseInvForm(); state.invEditor.draft.affixe.splice(+el.dataset.i, 1); render(); break;
    case 'inv-add-sockel':
      leseInvForm(); state.invEditor.draft.sockel.push({ gefuellt: false, inhalt: '' }); render(); break;
    case 'inv-del-sockel':
      leseInvForm(); state.invEditor.draft.sockel.splice(+el.dataset.i, 1); render(); break;
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.matches && el.matches('input[data-inv-file]')) {
    const f = el.files && el.files[0];
    if (f) starteOcr(f, el.dataset.invFile || '');
    el.value = '';
  }
});

document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'inv-form') { e.preventDefault(); uebernehmeInvItem(); return; }
  if (f.id === 'bestand-form') {
    e.preventDefault();
    const fd = new FormData(f);
    const b = {};
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith('b.')) continue;
      const t = String(v).trim();
      if (t !== '') b[k.slice(2)] = Number(t) || 0;
    }
    const nn = String(fd.get('neu-name') || '').trim(), nw = String(fd.get('neu-wert') || '').trim();
    if (nn) b[nn] = Number(nw) || 0;
    state.profil.bestand = b;
    saveProfil(); render();
  }
});

// Einfügen: Strg+V im Inventar. Slot = fokussierte/zuletzt angetippte Karte, sonst Vorschlag.
document.addEventListener('focusin', e => {
  const c = e.target.closest && e.target.closest('.inv-card');
  if (c) letzterSlot = c.dataset.slot;
});
document.addEventListener('pointerdown', e => {
  const c = e.target.closest && e.target.closest('.inv-card');
  letzterSlot = c ? c.dataset.slot : (e.target.closest && e.target.closest('#main') ? '' : letzterSlot);
});
document.addEventListener('paste', e => {
  if (state.tab !== 'inventar' || state.dateienOpen) return;
  const f = bildAus(e.clipboardData);
  if (!f) return;
  e.preventDefault();
  const slot = state.invEditor ? (state.invEditor.slot || state.invEditor.slotHint) : letzterSlot;
  starteOcr(f, slot || '');
});
document.addEventListener('dragover', e => {
  if (state.tab === 'inventar' && e.target.closest && e.target.closest('.inv-card, .inv-top')) e.preventDefault();
});
document.addEventListener('drop', e => {
  if (state.tab !== 'inventar') return;
  const c = e.target.closest && e.target.closest('.inv-card, .inv-top');
  if (!c) return;
  const f = bildAus(e.dataTransfer);
  if (!f) return;
  e.preventDefault();
  starteOcr(f, c.dataset.slot || '');
});
