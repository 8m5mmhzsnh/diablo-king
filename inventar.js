'use strict';

/* ================================================================
   Inventar, Slot-Analyse, „Nächster Schritt“ und Screenshot-Erkennung.
   Die Logik (analysiereSlot, parseTooltip) steht in lib.js.
   ================================================================ */

/* Texterkennung liegt im Repo (vendor/tesseract) – zur Laufzeit wird nichts von einem CDN geladen. */
const TESS_BASIS = 'vendor/tesseract/';
const TESS = {
  script: TESS_BASIS + 'tesseract.min.js',
  workerPath: TESS_BASIS + 'worker.min.js',
  corePath: TESS_BASIS + 'core',       // Verzeichnis: der Worker wählt SIMD- oder Standard-Kern selbst
  langPath: TESS_BASIS + 'lang',       // enthält eng.traineddata.gz
};

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
    katalog: state.katalog, uebersetzung: state.uebersetzung,
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
  const hat = m.bestand == null
    ? '<span class="warn-text">Bestand unbekannt</span>'
    : `du hast <b>${esc(m.bestand)}</b>`;
  return `<div class="small">braucht ${m.menge ? esc(m.menge) + ' ' : ''}${esc(bi(m.de, m.en))}, ${hat}
    ${eng ? ' <span class="tag warn">Engpass</span>' : ''}
    ${m.imWissen ? '' : ` <span class="muted">(„${esc(m.schluessel)}“ fehlt in wissen.json)</span>`}
    <a href="#" data-act="goto-tab" data-tab="bestand">Bestand</a></div>`;
}

function aktionQuellenHtml(a) {
  if (!a.quellen) return '';
  if (!a.quellen.length) return '<div class="small muted">Quelle: – (in wissen.json unter eintraege[].quelle oder farmziele ergänzen)</div>';
  return `<div class="small">Quelle: ${a.quellen.map(q => q.farm
    ? `<a href="#" data-act="goto-tab" data-tab="farmziele">${esc(q.text)}</a>
       ${q.farm.kosten ? `<span class="muted"> – Kosten: ${esc(q.farm.kosten)}</span>` : ''}
       ${q.farm.belohnungen ? `<br><span class="muted">Belohnungen: ${esc(q.farm.belohnungen)}</span>` : ''}`
    : esc(q.text)).join('<br>')}</div>`;
}

function aktionHtml(a, extra = '') {
  const rez = a.rezept
    ? `<div class="small">${a.rezept.fehlt ? 'Rezept „reroll-affixwerte“ fehlt in wissen.json → rezepte.' : `<a href="#" data-act="goto-tab" data-tab="rezepte">Rezept ansehen: ${esc(bi(a.rezept.name_de || a.rezept.id, a.rezept.name_en))}</a>`}</div>` : '';
  const eng = a.material && istEngpass(state.wissen, a.material);
  return `<li class="aktion${a.blockiert ? ' blockiert' : ''}${eng ? ' engpass' : ''}">
    <span class="prio ${a.prio}">${esc(a.prio)}</span>${a.blockiert ? '<span class="tag warn">blockiert – Bestand reicht nicht</span> ' : ''}${extra}
    <b>${esc(a.text)}</b>
    ${a.grund ? `<div class="small muted">${esc(a.grund)}</div>` : ''}
    ${a.kandidaten && a.kandidaten.length > 1 ? `<div class="small muted">Umrollbare Zeilen, schlechteste zuerst: ${esc(a.kandidaten.join(' · '))}</div>` : ''}
    ${materialHtml(a.material)}${aktionQuellenHtml(a)}${rez}
    ${a.warnung ? `<div class="hinweis warn">⚠ ${esc(a.warnung)}</div>` : ''}
    ${a.zusatz ? `<div class="small muted">${esc(a.zusatz)}</div>` : ''}
  </li>`;
}

function analyseHtml({ rolle, build, r }) {
  const titel = rolle === 'aktiv' ? `Aktueller Build „${esc(build.name)}“` : rolle === 'ziel' ? `Ziel-Build „${esc(build.name)}“` : 'Kein Build';
  const li = i => `<li class="hinweis ${i.art}">${INFO_ICON[i.art] || 'ℹ'} ${esc(i.text)}</li>`;
  // Warnungen immer sichtbar, reine Infos und Unsicherheiten eingeklappt
  const warn = r.infos.filter(i => i.art === 'warn').map(li).join('');
  const rest = r.infos.filter(i => i.art !== 'warn');
  let rf = '';
  if (r.reihenfolge.length) {
    const n = reihenfolgeNotiz(state.wissen);
    rf = `<div class="reihenfolge"><b>Reihenfolge:</b>
      <ol>${r.reihenfolge.map(a => `<li>${esc(KATEGORIE_LABEL[a.kategorie] || a.kategorie)}: ${esc(a.text)}</li>`).join('')}</ol>
      ${n.index >= 0 ? `<a href="#" data-act="goto-notiz" data-i="${n.index}">Warum diese Reihenfolge? → Notiz</a>`
        : '<span class="small muted">Notiz „In welcher Reihenfolge bearbeite ich ein Item?“ fehlt in wissen.json.</span>'}</div>`;
  }
  const inhalt = `${r.aktionen.length ? `<ul class="aktionen">${r.aktionen.map(a => aktionHtml(a)).join('')}</ul>` : '<p class="small muted">Keine Aktion nötig.</p>'}
    ${rf}
    ${warn ? `<ul class="hinweise">${warn}</ul>` : ''}
    ${rest.length ? `<details class="mehr-hinweise"><summary>Weitere Hinweise (${rest.length})</summary><ul class="hinweise">${rest.map(li).join('')}</ul></details>` : ''}`;
  const badge = rolle === 'ziel' ? '<span class="badge ziel">Ziel</span>' : rolle === 'aktiv' ? '<span class="badge aktiv">Aktiv</span>' : '';
  if (rolle === 'ziel') {
    return `<details class="analyse ziel"><summary class="analyse-titel">${badge} ${titel} – ${r.aktionen.length} Aktion${r.aktionen.length === 1 ? '' : 'en'}</summary>${inhalt}</details>`;
  }
  return `<div class="analyse ${rolle}"><div class="analyse-titel">${badge} ${titel}</div>${inhalt}</div>`;
}

/* ---------- Seltenheit → Farbe (Diablo-Farben) ---------- */
const RARITAET = { 'gewöhnlich': 'common', 'magisch': 'magic', 'selten': 'rare', 'legendär': 'legendary', 'einzigartig': 'unique', 'mythisch': 'mythic' };
const raritaet = it => (it ? RARITAET[selKanon(it.seltenheit)] || 'none' : 'leer');
const SLOT_KUERZEL = { kopf: 'Hm', brust: 'Br', handschuhe: 'Hd', hose: 'Hs', stiefel: 'St', amulett: 'Am', ring1: 'R1', ring2: 'R2', waffe: 'Wf', fokus: 'Fk' };

function itemKurzHtml(it) {
  const tags = [
    it.vermacht && '<span class="tag warn">vermacht</span>',
    it.gegenstandsmacht && `<span class="tag">${esc(it.gegenstandsmacht)} GM</span>`,
    `<span class="tag">${it.quelle === 'ocr' ? 'OCR, bestätigt' : 'manuell'}</span>`,
  ].filter(Boolean).join('');
  const aff = it.affixe.map(a => `<li class="${a.gross ? 'gross' : ''}${a.verzaubert ? ' verz' : ''}">${a.wert ? `<b>${esc(a.wert)}</b> ` : ''}${esc(a.text)}
    ${a.implizit ? '<span class="mini">impl.</span>' : ''}${a.gross ? '<span class="mini gross">groß</span>' : ''}${a.verzaubert ? '<span class="mini verz">verz.</span>' : ''}${a.schwach ? '<span class="mini">schwach</span>' : ''}</li>`).join('');
  const sock = it.sockel.length ? it.sockel.map(s => s.gefuellt && s.inhalt ? esc(s.inhalt) : '<i>leer</i>').join(', ') : 'keiner';
  return `<div class="item-kopf r-${raritaet(it)}">
      <div class="item-name">${esc(it.name || '(ohne Namen)')} ${it.stand ? staleIcon(it.stand) : ''}</div>
      <div class="item-typ">${esc([seltenheitAnzeige(selKanon(it.seltenheit)), it.itemTyp].filter(Boolean).join(' · '))}</div>
    </div>
    <div>${tags}</div>
    ${it.aspekt ? `<div class="item-aspekt">★ ${esc(it.aspekt)}</div>` : ''}
    ${aff ? `<ul class="affixe">${aff}</ul>` : '<p class="small muted">Keine Affixe erfasst.</p>'}
    <div class="kv small">
      <span class="k">Sockel:</span> ${sock} ·
      <span class="k">Härtung:</span> ${it.haertungen.max ? `${it.haertungen.genutzt}/${it.haertungen.max}` : '–'}${it.haertungen.affix ? ` (${esc(it.haertungen.affix)})` : ''} ·
      <span class="k">Vollendung:</span> ${it.vollendung.stufe}/${it.vollendung.max}
      ${it.stand ? `<br><span class="k">Stand:</span> ${esc(it.stand)}` : ''}
    </div>`;
}

/* ---------------- Ansicht: Inventar (Charakterbogen) ---------------- */

const LINKS = ['kopf', 'brust', 'handschuhe', 'hose', 'stiefel', 'waffe'];
const RECHTS = ['amulett', 'ring1', 'ring2', 'fokus'];
state.offen = state.offen || new Set();   // aufgeklappte Slots/Truhen-Items, bleibt beim Neuzeichnen erhalten

function slotKarte(key) {
  const p = state.profil;
  const s = SLOT_BY_KEY[key];
  const it = p.inventar[key];
  const ab = aktivBuild();
  const sl = ab && ab.slots[key];
  const ziel = sl ? [sl.zielItem, sl.zielAspekt && `Aspekt: ${sl.zielAspekt}`].filter(Boolean).join(' · ') : '';
  const analysen = analysenFuerSlot(key);
  const aktionen = analysen.flatMap(x => x.r.aktionen);
  const hoch = aktionen.filter(a => a.prio === 'hoch').length;
  const zaehler = aktionen.length
    ? `<span class="slot-zaehler${hoch ? ' hoch' : ''}" title="${aktionen.length} offene Aktionen">${aktionen.length}</span>` : '';
  return `<details class="d4-slot r-${raritaet(it)}" data-slot="${key}" data-offen="slot:${key}" ${state.offen.has('slot:' + key) ? 'open' : ''}>
    <summary>
      <span class="slot-icon">${SLOT_KUERZEL[key]}</span>
      <span class="slot-text">
        <span class="slot-label">${esc(s.de)}</span>
        <span class="slot-item">${it ? esc(it.name || '(ohne Namen)') : '<i>leer</i>'}</span>
        ${it ? `<span class="slot-sub">${esc([it.itemTyp, it.gegenstandsmacht && it.gegenstandsmacht + ' GM', it.vermacht && 'vermacht'].filter(Boolean).join(' · '))}</span>` : ''}
      </span>
      ${zaehler}
    </summary>
    <div class="slot-body inv-card" data-slot="${key}" tabindex="0">
      ${ziel ? `<div class="small muted">Ziel (aktiv): ${esc(ziel)}</div>` : ''}
      ${it ? `${itemKurzHtml(it)}
        <div class="btn-row">
          <button class="btn" data-act="inv-edit" data-slot="${key}">Bearbeiten</button>
          <label class="btn">Neuer Screenshot<input type="file" accept="image/*" hidden data-inv-file="${key}"></label>
          <button class="btn" data-act="inv-in-truhe" data-slot="${key}">In die Truhe</button>
          <button class="btn danger" data-act="inv-del" data-slot="${key}">Entfernen</button>
        </div>`
      : `<label class="drop" data-slot="${key}">
          <input type="file" accept="image/*" hidden data-inv-file="${key}">
          <b>Screenshot hier einfügen</b>
          <span class="small muted">tippen zum Auswählen · Strg+V · hineinziehen</span>
        </label>
        <button class="btn" data-act="inv-manuell" data-slot="${key}">Manuell erfassen</button>`}
      ${analysen.map(analyseHtml).join('')}
    </div>
  </details>`;
}

function viewInventar() {
  const p = state.profil;
  const c = p.charakter;
  const ab = aktivBuild(), zb = zielBuild();
  const belegt = SLOTS.filter(s => p.inventar[s.key]).length;
  return `
    <section class="d4-panel charsheet">
      <header class="d4-titel">
        <div>
          <div class="char-name">${esc(c.name || 'Charakter')}</div>
          <div class="char-sub">${esc([c.klasse, c.stufe && `Stufe ${c.stufe}`].filter(Boolean).join(' · '))}</div>
        </div>
        <div class="char-werte">
          <span><b>${esc(c.qualstufe || '–')}</b> Qual</span>
          <span><b>${esc(c.paragon || '–')}</b> Paragon</span>
          <a href="#" data-act="open-dateien" title="Charakter bearbeiten">✎</a>
        </div>
      </header>
      <div class="char-builds small">Aktiv: <b>${esc(ab ? ab.name : '–')}</b> · Ziel: <b>${esc(zb ? zb.name : '–')}</b> · ${belegt}/10 Slots erfasst</div>
      <div class="inv-top">
        <label class="btn primary">📷 Screenshot<input type="file" accept="image/*" hidden data-inv-file=""></label>
        <button class="btn" data-act="alle-auf">Alle aufklappen</button>
        <button class="btn" data-act="alle-zu">Alle zuklappen</button>
        <span class="small muted">Strg+V fügt überall ein – der Slot wird vorgeschlagen.</span>
      </div>
      <div class="charsheet-grid">
        <div class="charsheet-col">${LINKS.map(slotKarte).join('')}</div>
        <div class="charsheet-col">${RECHTS.map(slotKarte).join('')}</div>
      </div>
    </section>
    ${viewTruhe()}
    ${GRENZEN_HTML}`;
}

/* ---------------- Truhe (Stash) ---------------- */

function besterPlatz(b) {
  const z = b.passend.find(x => x.art === 'zielitem');
  if (z) return `${z.slot} · ${z.build}: ${z.hatSchon ? 'Zielitem (schon getragen)' : 'Zielitem'}`;
  const pr = [...b.passend].filter(x => x.art === 'profil').sort((x, y) => y.treffer - x.treffer)[0];
  return pr ? `${pr.slot} · ${pr.build}: ${pr.text}` : '';
}

function viewTruhe() {
  const liste = state.profil.stash;
  const karten = liste.map(it => {
    const b = bewerteItem({ item: it, profil: state.profil, wissen: state.wissen, katalog: state.katalog, uebersetzung: { affixe: state.uebersetzung, itemTypen: state.uebersetzungItemTypen } });
    const slots = b.slots.length ? b.slots : SLOTS.map(s => s.key);
    const platz = besterPlatz(b);
    return `<details class="d4-slot r-${raritaet(it)}" data-offen="stash:${esc(it.id)}" ${state.offen.has('stash:' + it.id) ? 'open' : ''}>
      <summary>
        <span class="slot-icon">${b.slots[0] ? SLOT_KUERZEL[b.slots[0]] : '?'}</span>
        <span class="slot-text">
          <span class="slot-item">${esc(it.name || '(ohne Namen)')}</span>
          <span class="slot-sub">${esc([it.itemTyp, it.gegenstandsmacht && it.gegenstandsmacht + ' GM', it.vermacht && 'vermacht'].filter(Boolean).join(' · '))}</span>
          ${platz ? `<span class="slot-passt">${esc(platz)}</span>` : ''}
        </span>
        ${b.verdikt ? verdiktHtml(b.verdikt) : ''}
      </summary>
      <div class="slot-body">
        ${itemKurzHtml(it)}
        ${it.notiz ? `<p class="small">${esc(it.notiz)}</p>` : ''}
        ${bewertungHtml(b, true)}
        <div class="btn-row">
          <select data-stash-slot="${esc(it.id)}" aria-label="Ziel-Slot">${slots.map(k => `<option value="${k}">${esc(SLOT_BY_KEY[k].de)}</option>`).join('')}</select>
          <button class="btn primary" data-act="stash-anlegen" data-id="${esc(it.id)}">Anlegen</button>
          <button class="btn" data-act="stash-edit" data-id="${esc(it.id)}">Bearbeiten</button>
          <button class="btn danger" data-act="stash-del" data-id="${esc(it.id)}">Löschen</button>
        </div>
      </div>
    </details>`;
  }).join('');
  return `
    <section class="d4-panel truhe">
      <header class="d4-titel"><div class="char-name">Truhe</div><div class="char-sub">${liste.length} Items, nicht angelegt</div></header>
      <p class="small muted">Items aus deinem Stash, die du theoretisch nutzen könntest. Jede Karte zeigt, wo das Item in deine Builds passt.</p>
      <div class="inv-top">
        <label class="btn primary">📷 Screenshot → Truhe<input type="file" accept="image/*" hidden data-truhe-file></label>
        <button class="btn" data-act="stash-manuell">Manuell erfassen</button>
      </div>
      <div class="truhe-grid">${karten || '<p class="small muted">Noch leer.</p>'}</div>
    </section>`;
}

/* ---------------- Bewertung (Item prüfen / Truhe) ---------------- */

function bewertungHtml(b, kompakt) {
  const rolle = r => r === 'aktiv' ? '<span class="badge aktiv">aktiv</span>' : '<span class="badge ziel">Ziel</span>';
  const weitere = b.regeln.slice(b.quelle === 'regel' ? 1 : 0);
  return `<div class="bewertung">
    ${kompakt ? '' : `<div class="res-head">${verdiktHtml(b.verdikt, true)}
      <span class="small muted">${{ build: 'aus deinen Builds', eintrag: 'aus dem Eintrag in wissen.json', regel: `laut Regel ${esc(b.regeln[0] ? b.regeln[0].id : '')}` }[b.quelle] || 'keine passende Regel'}</span></div>`}
    ${b.gruende.map(g => `<p class="res-reason">${esc(g)}</p>`).join('')}
    ${b.passend.length ? `<div class="small"><b>Passt in:</b><ul class="affixe">${b.passend.map(x => `<li>${rolle(x.rolle)} ${esc(x.slot)} · ${esc(x.build)}: ${esc(x.text)}${x.art === 'profil' && x.besser ? ' <span class="tag warn">Upgrade</span>' : ''}</li>`).join('')}</ul></div>`
      : '<p class="small muted">Passt in keinen Slot deiner beiden Builds.</p>'}
    ${b.kodexHinweis ? `<p class="small">${esc(b.kodexHinweis)} <a href="#" data-act="goto-tab" data-tab="bestand">Kodex</a></p>` : ''}
    ${weitere.length ? `<p class="small muted">Weitere passende Regeln: ${weitere.map(r => `${esc(r.id)} (${esc(r.verdikt || '–')})`).join(', ')}</p>` : ''}
  </div>`;
}

/* ---------------- Ansicht: Item prüfen ---------------- */

function viewPruefen() {
  return `
    <section class="d4-panel">
      <header class="d4-titel"><div class="char-name">Item prüfen</div><div class="char-sub">Screenshot rein – Verdikt raus</div></header>
      <p class="small muted">Für Items, die du gerade gefunden hast: behalten, zum Legendary umbauen, in den Würfel oder zerlegen?
        Bewertet wird gegen deine beiden Builds (Slot, Aspekt, Zielaffixe), das getragene Item und die Regeln aus wissen.json.</p>
      <label class="drop gross-drop" data-pruefen>
        <input type="file" accept="image/*" hidden data-pruefen-file>
        <b>Screenshot hier einfügen</b>
        <span class="small muted">tippen zum Auswählen · Strg+V · hineinziehen</span>
      </label>
      <div class="btn-row"><button class="btn" data-act="pruefen-manuell">Werte von Hand eingeben</button></div>
    </section>
    ${GRENZEN_HTML}`;
}

/* ---------------- Ansicht: Bestand ---------------- */

function viewBestand() {
  const b = state.profil.bestand;
  const mats = materialEintraege(state.wissen);
  const schluessel = mats.map(e => e.bestandsschluessel);
  const runen = runenListe();
  const extra = Object.keys(b).filter(k => !schluessel.includes(k) && !runen.some(r => norm(r) === norm(k)));
  const zeile = (key, label, e) => {
    const v = b[key];
    return `<div class="bestand-row${e && e.engpass ? ' engpass' : ''}">
      <label for="best-${esc(key)}">${label}${e && e.engpass ? ' <span class="tag warn">Engpass</span>' : ''}
        <br><span class="small muted">${esc(key)}</span></label>
      <input id="best-${esc(key)}" type="text" inputmode="numeric" name="b.${esc(key)}" value="${v == null ? '' : esc(v)}" placeholder="unbekannt">
    </div>`;
  };
  return `
    <h2>Material-Bestand</h2>
    <p class="small muted">Mengen aus deinem Spiel. Leer = <b>unbekannt</b> – dann erscheinen Warnungen.
      Bei 0 werden Aktionen, die das Material brauchen, als blockiert markiert. Gespeichert in profil.json → bestand.
      Die Namen kommen aus wissen.json (Einträge mit bestandsschluessel).</p>
    <form id="bestand-form" class="card" autocomplete="off">
      ${mats.map(e => zeile(e.bestandsschluessel, esc(bi(e.name_de || e.name, e.name_en)), e)).join('') || '<p class="small muted">In wissen.json sind keine Materialien mit bestandsschluessel hinterlegt.</p>'}
      ${extra.length ? `<h3>Weitere Schlüssel im Profil</h3><p class="small muted">Stehen in profil.bestand, aber ohne Material in wissen.json.</p>
        ${extra.map(k => zeile(k, esc(k), null)).join('')}` : ''}
      <div class="bestand-row"><input type="text" name="neu-name" placeholder="weiterer Schlüssel"><input type="text" inputmode="numeric" name="neu-wert" placeholder="Anzahl"></div>

      <h3>Runen</h3>
      <p class="small muted">Schlüssel = Runenname. Leer = unbekannt. Aus Regel-Ausnahmen, wissen.runen und den Sockeln deiner Builds.</p>
      ${runenListe().map(r => zeile(r, esc(r), null)).join('') || '<p class="small muted">Keine Runen bekannt.</p>'}

      <h3>Kodex der Macht</h3>
      <p class="small muted">Rang eintragen. Leer = unbekannt, „-“ = nicht im Kodex. Gespeichert in profil.json → kodex.</p>
      ${kodexListe().map((k, i) => {
        const v = state.profil.kodex[k.key];
        const wert = k.key in state.profil.kodex ? (v == null ? '-' : v) : '';
        return `<div class="bestand-row"><label for="kod-${i}">${esc(k.label)}<br><span class="small muted">${esc(k.key)}</span></label>
          <input id="kod-${i}" type="text" name="k.${esc(k.key)}" value="${esc(wert)}" placeholder="unbekannt"></div>`;
      }).join('')}
      <button class="btn primary" type="submit">Speichern</button>
    </form>`;
}

/** Runen für den Bestand: bekannte Namen plus alle Runen aus den Sockeln beider Builds. */
function runenListe() {
  const namen = new Set(runenNamen(state.wissen));
  for (const b of state.profil.builds) for (const s of SLOTS) splitParts((b.slots[s.key] || {}).sockel).forEach(x => { if (istRune(state.wissen, x)) namen.add(x); });
  return [...namen];
}
/** Aspekte für den Kodex: alle Aspekte aus wissen.json plus die Zielaspekte der Builds. Schlüssel = englischer Name. */
function kodexListe() {
  const out = new Map();
  for (const e of state.wissen.eintraege.filter(e => norm(e.typ) === 'aspekt')) out.set(e.name_en || e.name_de, bi(e.name_de, e.name_en));
  for (const b of state.profil.builds) for (const s of SLOTS) {
    const a = (b.slots[s.key] || {}).zielAspekt;
    if (!a) continue;
    const e = eintragZu(state.wissen, a);
    const key = e ? (e.name_en || e.name_de) : a;
    if (!out.has(key)) out.set(key, a);
  }
  Object.keys(state.profil.kodex).forEach(k => { if (!out.has(k)) out.set(k, k); });
  return [...out].map(([key, label]) => ({ key, label }));
}

/* ---------------- Ansicht: Item-Editor ---------------- */

function schliesseInvEditor() {
  if (state.invEditor && state.invEditor.bild) URL.revokeObjectURL(state.invEditor.bild);
  state.invEditor = null;
}

function oeffneInvEditor(slot, item, extra = {}) {
  schliesseInvEditor();
  state.tab = extra.modus === 'pruefen' ? 'pruefen' : 'inventar';
  state.dateienOpen = false;
  state.invEditor = Object.assign({
    draft: normalizeItem(structuredClone(item || leeresItem())), slot: slot || '', slotHint: slot || '',
    vorschlag: null, bild: '', status: '', laeuft: false, roh: '', implizitHinweis: '', neu: !item,
    modus: 'inventar',   // inventar | truhe | pruefen
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
  const bestehend = ed.modus === 'inventar' && ed.slot && state.profil.inventar[ed.slot];
  const titel = { inventar: ed.neu ? 'Item erfassen' : 'Item bearbeiten', truhe: ed.neu ? 'Item für die Truhe' : 'Truhen-Item bearbeiten', pruefen: 'Item prüfen' }[ed.modus];
  const bewertung = ed.modus === 'pruefen' && !ed.laeuft
    ? bewerteItem({ item: normalizeItem(d), profil: state.profil, wissen: state.wissen, katalog: state.katalog, uebersetzung: { affixe: state.uebersetzung, itemTypen: state.uebersetzungItemTypen } }) : null;

  return `
    <h2>${titel}</h2>
    ${bewertung ? `<div class="d4-panel verdikt-panel">${bewertungHtml(bewertung)}
      <div class="btn-row">
        <button class="btn" data-act="pruefen-neu">Nach Korrektur neu bewerten</button>
        <button class="btn primary" data-act="pruefen-truhe">In die Truhe legen</button>
        <button class="btn" data-act="pruefen-inventar">Ins Inventar übernehmen</button>
      </div></div>` : ''}
    ${ed.status ? `<div class="msg ${ed.fehler ? 'err' : 'info'}" id="ocr-status">${esc(ed.status)}</div>` : '<div id="ocr-status"></div>'}
    ${ed.bild ? `<details class="slot" open><summary>Screenshot</summary><img class="shot" src="${ed.bild}" alt="Tooltip-Screenshot"></details>` : ''}
    <div class="msg warn">${ed.modus === 'pruefen'
      ? 'Das Verdikt nutzt die Werte unten. Weicht etwas vom Tooltip ab: korrigieren und „neu bewerten“.'
      : 'Die Analyse nutzt nur, was du hier bestätigst – nie den rohen Erkennungstext. Erst „Übernehmen“ speichert.'}</div>
    <form id="inv-form" autocomplete="off">
      <label class="f">Slot${ed.modus === 'inventar' ? '' : ' <span class="muted">(optional)</span>'}
        <select name="slot" ${ed.modus === 'inventar' ? 'required' : ''}><option value="">– bitte wählen –</option>${slotOpt}</select></label>
      ${vs && vs.key ? `<p class="small muted">Vorschlag: <b>${esc(SLOT_BY_KEY[vs.key].de)}</b> (${esc(vs.warum)})${ed.slotHint && ed.slotHint !== vs.key ? ` – eingefügt hast du bei <b>${esc(SLOT_BY_KEY[ed.slotHint].de)}</b>.` : ''}</p>` : ''}
      ${bestehend && ed.neu ? `<p class="small warn-text">Im gewählten Slot liegt schon „${esc(bestehend.name)}“ – Übernehmen ersetzt es.</p>` : ''}
      <div class="grid2">
        <label class="f">Name<input type="text" name="name" list="dl-kat-uniques" value="${esc(d.name)}"></label>
        <label class="f">Slug (für katalog.json)<input type="text" name="slug" value="${esc(d.slug)}"></label>
        <label class="f">Seltenheit<select name="seltenheit"><option value="">–</option>${seltOpt}</select></label>
        <label class="f">Item-Typ<input type="text" name="itemTyp" list="dl-kat-itemTypen" value="${esc(d.itemTyp)}"></label>
        <label class="f">Gegenstandsmacht<input type="text" inputmode="numeric" name="gegenstandsmacht" value="${esc(d.gegenstandsmacht)}"></label>
        <label class="f">Geprägter Aspekt<input type="text" name="aspekt" list="dl-kat-aspekte" value="${esc(d.aspekt)}"></label>
      </div>
      <label class="check-inline"><input type="checkbox" name="vermacht" ${d.vermacht ? 'checked' : ''}> vermacht (Ancestral)</label>
      ${ed.modus === 'truhe' ? `<label class="f">Notiz<input type="text" name="notiz" value="${esc(d.notiz || '')}" placeholder="z. B. liegt in Truhe 3"></label>` : ''}

      <h3>Affixe <span class="small muted">– der unzuverlässigste Teil der Erkennung, bitte Zeile für Zeile prüfen</span></h3>
      ${ed.implizitHinweis ? `<div class="msg info small">${esc(ed.implizitHinweis)}</div>` : ''}
      ${(ed.hinweise || []).map(h => `<div class="msg info small">${esc(h)}</div>`).join('')}
      <div class="affix-rows">
        ${d.affixe.map((a, i) => `<div class="affix-row${a.konfidenz != null && a.konfidenz < 60 ? ' unsicher' : ''}">
          <div class="affix-main">
            ${konfHtml(a.konfidenz)}
            <input type="text" name="a.${i}.wert" value="${esc(a.wert)}" placeholder="Wert" class="wert">
            <input type="text" name="a.${i}.text" value="${esc(a.text)}" placeholder="Affix" list="dl-kat-affixe">
            <button type="button" class="icon-btn" data-act="inv-del-affix" data-i="${i}" aria-label="Zeile löschen">×</button>
          </div>
          <div class="affix-flags">
            <label><input type="checkbox" name="a.${i}.implizit" ${a.implizit ? 'checked' : ''}> implizit</label>
            <label><input type="checkbox" name="a.${i}.gross" ${a.gross ? 'checked' : ''}> groß</label>
            <label><input type="checkbox" name="a.${i}.verzaubert" ${a.verzaubert ? 'checked' : ''}> verzaubert</label>
            <label><input type="checkbox" name="a.${i}.schwach" ${a.schwach ? 'checked' : ''}> Wert schwach</label>
            ${a.lang ? '<span class="small warn-text">lange Zeile – vermutlich Effekttext, kein Affix?</span>' : ''}
            ${a.korrigiertAus ? `<span class="small warn-text">aus „${esc(a.korrigiertAus)}“ korrigiert (Katalog)</span>` : affixKatalogHinweis(a.text, i)}
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
      ${katalogDatalists()}
      <div class="btn-row" style="margin-top:14px">
        ${ed.modus === 'pruefen'
          ? `<button type="button" class="btn primary" data-act="pruefen-neu" ${ed.laeuft ? 'disabled' : ''}>Neu bewerten</button>`
          : `<button type="submit" class="btn primary" ${ed.laeuft ? 'disabled' : ''}>${ed.modus === 'truhe' ? 'In die Truhe' : 'Übernehmen'}</button>`}
        <button type="button" class="btn" data-act="inv-cancel">Verwerfen</button>
      </div>
    </form>`;
}

/* ---------- Katalog: Vorschlagslisten und Prüfung ---------- */

let KAT_CACHE = null;
function katalogNamen(kategorie) {
  if (!KAT_CACHE || KAT_CACHE.quelle !== state.katalog) KAT_CACHE = { quelle: state.katalog };
  if (!KAT_CACHE[kategorie]) {
    const namen = katalogListe(state.katalog, kategorie).map(x => x.name_en || x.name_de || x.name || x.slug).filter(Boolean);
    KAT_CACHE[kategorie] = { namen, set: new Set(namen.map(norm)) };
  }
  return KAT_CACHE[kategorie];
}
function katalogDatalists() {
  // Einträge aus wissen.json zuerst (korrigierte Namen), dann der Katalog
  const wissenNamen = typ => state.wissen.eintraege.filter(e => norm(e.typ) === typ).flatMap(e => [e.name_en, e.name_de]).filter(Boolean);
  const dl = (id, list) => `<datalist id="${id}">${[...new Set(list)].map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;
  return dl('dl-kat-uniques', [...wissenNamen('unique'), ...katalogNamen('uniques').namen]) +
    dl('dl-kat-aspekte', [...wissenNamen('aspekt'), ...katalogNamen('aspekte').namen]) +
    dl('dl-kat-itemTypen', katalogNamen('itemTypen').namen) +
    dl('dl-kat-affixe', katalogNamen('affixe').namen);
}
/** Affix nicht im Katalog? Ähnlichsten Namen vorschlagen – nur als Hinweis. */
function affixKatalogHinweis(text, i) {
  const k = katalogNamen('affixe');
  if (!text || !k.namen.length || k.set.has(norm(text))) return '';
  const t = new Set(tokens(text));
  let best = null, bestScore = 0;
  for (const n of k.namen) {
    const nt = tokens(n);
    const treffer = nt.filter(x => t.has(x)).length;
    const score = treffer / Math.max(nt.length, t.size);
    if (score > bestScore) { bestScore = score; best = n; }
  }
  return best && bestScore >= 0.5
    ? `<span class="small">nicht im Katalog – meintest du <a href="#" data-act="inv-affix-vorschlag" data-i="${i}" data-wert="${esc(best)}">${esc(best)}</a>?</span>`
    : '<span class="small muted">nicht im Katalog</span>';
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
  if (fd.has('notiz')) d.notiz = g('notiz');
  d.gegenstandsmacht = g('gegenstandsmacht') === '' ? '' : Number(g('gegenstandsmacht')) || g('gegenstandsmacht');
  d.vermacht = fd.get('vermacht') === 'on';
  d.affixe = d.affixe.map((a, i) => ({
    ...a, text: g(`a.${i}.text`), wert: g(`a.${i}.wert`),
    korrigiertAus: g(`a.${i}.text`) === a.text ? a.korrigiertAus : undefined,
    implizit: fd.get(`a.${i}.implizit`) === 'on', gross: fd.get(`a.${i}.gross`) === 'on',
    verzaubert: fd.get(`a.${i}.verzaubert`) === 'on', schwach: fd.get(`a.${i}.schwach`) === 'on',
  }));
  d.sockel = d.sockel.map((s, i) => ({ gefuellt: fd.get(`s.${i}.gefuellt`) === 'on', inhalt: g(`s.${i}.inhalt`) }));
  d.haertungen = { genutzt: g('h.genutzt'), max: g('h.max'), affix: g('h.affix') };
  d.vollendung = { stufe: g('v.stufe'), max: g('v.max') };
}

/** Aktuellen Entwurf als fertiges Item (ohne OCR-Hilfsfelder). */
function entwurfAlsItem() {
  const d = state.invEditor.draft;
  d.affixe = d.affixe.filter(a => a.text || a.wert);
  const item = normalizeItem(d);
  if (!item.stand) item.stand = today();
  if (!item.slug && item.name) item.slug = slugify(item.name);
  if (d.notiz) item.notiz = d.notiz;
  return item;
}

function inTruheLegen() {
  leseInvForm();
  const ed = state.invEditor;
  if (ed.draft.affixe.filter(a => a.verzaubert).length > 1) { alert('Pro Item ist nur EIN Affix verzauberbar – bitte nur eine Zeile als „verzaubert“ markieren.'); return; }
  const item = entwurfAlsItem();
  const liste = state.profil.stash;
  const i = ed.stashId ? liste.findIndex(x => x.id === ed.stashId) : -1;
  item.id = ed.stashId || ('s' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
  if (i >= 0) liste[i] = item; else liste.push(item);
  saveProfil();
  schliesseInvEditor();
  state.tab = 'inventar';
  state.offen.add('stash:' + item.id);
  render();
  document.querySelector('.truhe')?.scrollIntoView({ block: 'start' });
}

function uebernehmeInvItem() {
  leseInvForm();
  const ed = state.invEditor;
  if (ed.modus === 'truhe') { inTruheLegen(); return; }
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
  state.offen.add('slot:' + slot);
  render();
  document.querySelector(`.d4-slot[data-slot="${slot}"]`)?.scrollIntoView({ block: 'start' });
}

/* ---------------- Screenshot-Erkennung ---------------- */

let tessLaden = null, tessWorker = null;

function ladeTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (!tessLaden) {
    tessLaden = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = TESS.script;
      s.onload = res;
      s.onerror = () => { tessLaden = null; rej(new Error(`Texterkennung nicht gefunden (${TESS.script})`)); };
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
    workerPath: TESS.workerPath,
    corePath: TESS.corePath,
    langPath: TESS.langPath,
    workerBlobURL: false,
    gzip: true,
    logger: m => {
      if (!m || !m.status) return;
      const pct = m.progress != null ? ` ${Math.round(m.progress * 100)} %` : '';
      const was = /recogniz/.test(m.status) ? 'Erkenne Text' : 'Lade Texterkennung';
      setOcrStatus(`${was} …${pct}`);
    },
  });
  // Seitenlayout automatisch erkennen (PSM 3). Der Standard von Tesseract.js (ein einzelner Block)
  // vermischt Item-Bild, Rahmen und Text und liefert bei D4-Tooltips deutlich schlechtere Zeilen.
  await tessWorker.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' });
  return tessWorker;
}

/**
 * Symbol vor einer Zeile anhand der Farbe erkennen: Das Verzauberungs-Symbol (Kreispfeile) ist blau,
 * die normale Raute grau. Geprüft wird der Bereich links vom Zeilenanfang im Originalbild.
 * @returns {'verzaubert'|null}
 */
function symbolAusFarbe(farbe, bbox) {
  if (!farbe || !bbox) return null;
  const { x0, y0, y1 } = bbox;
  const h = y1 - y0;
  if (h <= 0) return null;
  const xa = Math.max(0, Math.round(x0 - 1.6 * h)), xb = Math.min(farbe.width, Math.round(x0 + 0.6 * h));
  const ya = Math.max(0, Math.round(y0 + 0.1 * h)), yb = Math.min(farbe.height, Math.round(y1 - 0.1 * h));
  let blau = 0, bunt = 0;
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      const i = (y * farbe.width + x) * 4;
      const r = farbe.data[i] / 255, g = farbe.data[i + 1] / 255, b = farbe.data[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx < 0.45 || (mx - mn) / mx < 0.35) continue;
      bunt++;
      let hue;
      if (mx === r) hue = 60 * (((g - b) / (mx - mn)) % 6);
      else if (mx === g) hue = 60 * ((b - r) / (mx - mn) + 2);
      else hue = 60 * ((r - g) / (mx - mn) + 4);
      if (hue < 0) hue += 360;
      if (hue >= 170 && hue <= 260) blau++;
    }
  }
  return blau >= 60 && blau >= 0.25 * bunt ? 'verzaubert' : null;
}

/**
 * Tooltip für die Texterkennung vorbereiten.
 * D4-Tooltips haben hellen, farbigen Text (weiß, grau, orange, blau) auf dunklem, verlaufendem Grund.
 * Pro Pixel zählt der hellste Farbkanal – so bleibt auch orangefarbener Text hell –, dann trennt ein
 * Schwellwert nach Otsu Text und Hintergrund. Ergebnis: schwarzer Text auf weißem Grund.
 */
async function vorbereiten(blob) {
  const bmp = await createImageBitmap(blob);
  const faktor = bmp.width < 1200 ? Math.min(3, 1600 / bmp.width) : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * faktor);
  c.height = Math.round(bmp.height * faktor);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  c.farbe = new ImageData(new Uint8ClampedArray(img.data), c.width, c.height);   // Originalfarben für die Symbol-Erkennung
  const px = img.data, n = px.length / 4;
  const hell = new Uint8Array(n), hist = new Array(256).fill(0);
  for (let i = 0; i < n; i++) {
    const v = Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    hell[i] = v; hist[v]++;
  }
  // Otsu-Schwellwert
  let summe = 0;
  for (let t = 0; t < 256; t++) summe += t * hist[t];
  let sB = 0, wB = 0, best = -1, schwelle = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = n - wB; if (!wF) break;
    sB += t * hist[t];
    const d = wB * wF * (sB / wB - (summe - sB) / wF) ** 2;
    if (d > best) { best = d; schwelle = t; }
  }
  // Überwiegend heller Grund (z. B. Foto eines hellen Bildschirms)? Dann ist der Text dunkel.
  let ueber = 0;
  for (let i = 0; i < n; i++) if (hell[i] > schwelle) ueber++;
  const textHell = ueber < n / 2;
  for (let i = 0; i < n; i++) {
    const istText = textHell ? hell[i] > schwelle : hell[i] <= schwelle;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = istText ? 0 : 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

async function starteOcr(blob, slotHint, modus = 'inventar') {
  const bild = URL.createObjectURL(blob);
  oeffneInvEditor(slotHint, null, { bild, status: 'Lade Texterkennung …', laeuft: true, modus });
  state.invEditor.draft.quelle = 'ocr';
  const ed = state.invEditor;
  try {
    if (location.protocol === 'file:') {
      throw new Error('Die App ist per Doppelklick geöffnet (file://). Dort verbieten Browser die Web-Worker, die die Texterkennung braucht. ' +
        'Öffne sie über https://8m5mmhzsnh.github.io/diablo-king/ oder starte „start.bat“ im App-Ordner');
    }
    const canvas = await vorbereiten(blob);
    const worker = await holeWorker();
    setOcrStatus('Erkenne Text …');
    const { data } = await worker.recognize(canvas);
    if (state.invEditor !== ed) return;   // inzwischen verworfen
    const lines = (data.lines || []).map(l => ({ text: l.text, confidence: l.confidence, symbol: symbolAusFarbe(canvas.farbe, l.bbox) }));
    const r = parseTooltip(lines, { wissen: state.wissen, katalog: state.katalog, inventar: state.profil.inventar });
    ed.draft = r.item;
    ed.vorschlag = r.slot;
    ed.roh = r.roh;
    ed.implizitHinweis = r.implizitHinweis;
    ed.hinweise = r.hinweise || [];
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
  if (state.invEditor === ed && (state.tab === 'inventar' || state.tab === 'pruefen')) render();
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
    Number(!!x.a.blockiert) - Number(!!y.a.blockiert) || PRIO_RANG[x.a.prio] - PRIO_RANG[y.a.prio] || x.si - y.si);
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
      <span class="muted">${{ engpaesse: '– aus wissen.engpaesse', engpass: '– Materialien mit engpass: true', material: '– abgeleitet aus Einträgen mit typ „material“' }[eng.herkunft]}</span>
      <a href="#" data-act="goto-tab" data-tab="bestand">Bestand bearbeiten</a></p>

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
      if (state.invEditor.modus !== 'pruefen' && !confirm('Entwurf verwerfen? Nichts wird gespeichert.')) return;
      schliesseInvEditor(); render(); break;
    case 'alle-auf':
    case 'alle-zu':
      document.querySelectorAll('details.d4-slot').forEach(d => { d.open = act === 'alle-auf'; });
      break;
    case 'inv-in-truhe': {
      const it = p.inventar[slot];
      if (!confirm(`„${it.name}“ ablegen und in die Truhe legen?`)) return;
      p.stash.push(Object.assign({}, it, { id: 's' + Date.now().toString(36) }));
      p.inventar[slot] = null; saveProfil(); render(); break;
    }
    /* Truhe */
    case 'stash-manuell': oeffneInvEditor('', null, { modus: 'truhe' }); break;
    case 'stash-edit': {
      const it = p.stash.find(x => x.id === el.dataset.id);
      oeffneInvEditor('', it, { modus: 'truhe', neu: false, stashId: it.id });
      break;
    }
    case 'stash-del': {
      const i = p.stash.findIndex(x => x.id === el.dataset.id);
      if (i < 0 || !confirm(`„${p.stash[i].name}“ aus der Truhe löschen?`)) return;
      p.stash.splice(i, 1); saveProfil(); render(); break;
    }
    case 'stash-anlegen': {
      const i = p.stash.findIndex(x => x.id === el.dataset.id);
      const ziel = document.querySelector(`[data-stash-slot="${el.dataset.id}"]`).value;
      const neu = p.stash[i], alt = p.inventar[ziel];
      if (!confirm(`„${neu.name}“ in ${SLOT_BY_KEY[ziel].de} anlegen?${alt ? ` „${alt.name}“ wandert in die Truhe.` : ''}`)) return;
      const { id, notiz, ...item } = neu;
      p.inventar[ziel] = normalizeItem(item);
      p.stash.splice(i, 1);
      if (alt) p.stash.push(Object.assign({}, alt, { id: 's' + Date.now().toString(36) }));
      saveProfil(); state.offen.add('slot:' + ziel); render(); break;
    }
    /* Item prüfen */
    case 'pruefen-manuell': oeffneInvEditor('', null, { modus: 'pruefen' }); break;
    case 'pruefen-neu': leseInvForm(); render(); break;
    case 'pruefen-truhe': state.invEditor.modus = 'truhe'; inTruheLegen(); break;
    case 'pruefen-inventar': {
      leseInvForm();
      const ed = state.invEditor;
      if (!ed.slot) {
        const k = kandidatenSlots(normalizeItem(ed.draft), { katalog: state.katalog, wissen: state.wissen });
        ed.slot = k[0] || '';
      }
      if (!ed.slot) { alert('Bitte oben einen Slot wählen.'); return; }
      ed.modus = 'inventar'; ed.neu = true;
      uebernehmeInvItem();
      break;
    }
    case 'inv-add-affix':
      leseInvForm();
      state.invEditor.draft.affixe.push({ text: '', wert: '', gross: false, implizit: false, verzaubert: false, schwach: false, konfidenz: null });
      render(); break;
    case 'inv-del-affix':
      leseInvForm(); state.invEditor.draft.affixe.splice(+el.dataset.i, 1); render(); break;
    case 'inv-affix-vorschlag':
      e.preventDefault();
      leseInvForm(); state.invEditor.draft.affixe[+el.dataset.i].text = el.dataset.wert; render(); break;
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
    const kodex = {};
    for (const [k, v] of fd.entries()) {
      const t = String(v).trim();
      if (k.startsWith('b.')) b[k.slice(2)] = t === '' ? null : (Number(t) || 0);   // leer = unbekannt
      if (k.startsWith('k.') && t !== '') kodex[k.slice(2)] = t === '-' ? null : (Number(t) || 0);   // leer = unbekannt, „-“ = nicht im Kodex
    }
    state.profil.kodex = kodex;
    const nn = String(fd.get('neu-name') || '').trim(), nw = String(fd.get('neu-wert') || '').trim();
    if (nn) b[nn] = Number(nw) || 0;
    state.profil.bestand = b;
    saveProfil(); render();
  }
});

// Einfügen: Strg+V im Inventar. Slot = fokussierte/zuletzt angetippte Karte, sonst Vorschlag.
// Auf-/Zuklappen merken (toggle blubbert nicht → Capture)
document.addEventListener('toggle', e => {
  const d = e.target;
  if (!d.dataset || !d.dataset.offen) return;
  if (d.open) state.offen.add(d.dataset.offen); else state.offen.delete(d.dataset.offen);
}, true);

document.addEventListener('change', e => {
  const el = e.target;
  if (el.matches && el.matches('input[data-truhe-file]')) {
    const f = el.files && el.files[0]; if (f) starteOcr(f, '', 'truhe'); el.value = '';
  }
  if (el.matches && el.matches('input[data-pruefen-file]')) {
    const f = el.files && el.files[0]; if (f) starteOcr(f, '', 'pruefen'); el.value = '';
  }
});

// Einfügen: Strg+V im Inventar (Slot = zuletzt angetippter Slot), in der Truhe und bei „Item prüfen“.
document.addEventListener('focusin', e => {
  const c = e.target.closest && e.target.closest('[data-slot]');
  if (c) letzterSlot = c.dataset.slot;
});
document.addEventListener('pointerdown', e => {
  if (!e.target.closest) return;
  const c = e.target.closest('[data-slot]');
  letzterSlot = c ? c.dataset.slot : e.target.closest('.truhe') ? 'truhe' : e.target.closest('#main') ? '' : letzterSlot;
});
document.addEventListener('paste', e => {
  if (!['inventar', 'pruefen'].includes(state.tab) || state.dateienOpen) return;
  const f = bildAus(e.clipboardData);
  if (!f) return;
  e.preventDefault();
  if (state.tab === 'pruefen') { starteOcr(f, '', 'pruefen'); return; }
  if (state.invEditor) { starteOcr(f, state.invEditor.slot || state.invEditor.slotHint || '', state.invEditor.modus); return; }
  if (letzterSlot === 'truhe') { starteOcr(f, '', 'truhe'); return; }
  starteOcr(f, letzterSlot || '');
});
document.addEventListener('dragover', e => {
  if (['inventar', 'pruefen'].includes(state.tab) && e.target.closest && e.target.closest('[data-slot], .inv-top, .truhe, [data-pruefen]')) e.preventDefault();
});
document.addEventListener('drop', e => {
  if (!['inventar', 'pruefen'].includes(state.tab) || !e.target.closest) return;
  const c = e.target.closest('[data-slot], .inv-top, .truhe, [data-pruefen]');
  if (!c) return;
  const f = bildAus(e.dataTransfer);
  if (!f) return;
  e.preventDefault();
  if (state.tab === 'pruefen') starteOcr(f, '', 'pruefen');
  else if (c.closest('.truhe')) starteOcr(f, '', 'truhe');
  else starteOcr(f, c.dataset.slot || '');
});
