'use strict';

/* ================================================================
   Reiter „Was fehlt“ – Beschaffung: aktiver und Ziel-Build gegen Besitz.
   Anders als „Nächster Schritt“ (Aktionen an vorhandenen Items) funktioniert
   er auch mit leerem Inventar. Logik: wasFehlt() in lib.js.
   ================================================================ */

state.fehltAnsicht = 'quelle';     // quelle | prio
state.fehltZeigeAus = false;
state.farmzielForm = null;         // { belohnung } – Formular „Farmziel ergänzen“

const ART_LABEL = { item: 'Item', profil: 'Slot-Profil', aspekt: 'Aspekt', sockel: 'Sockel', rune: 'Rune', material: 'Material' };

function fehltDaten() {
  return wasFehlt({ profil: state.profil, wissen: state.wissen, katalog: state.katalog, uebersetzung: state.uebersetzung });
}

function aspektNotizLink() {
  const i = state.wissen.notizen.findIndex(n => /fehlende aspekte/i.test(n.frage || ''));
  return i >= 0 ? `<a href="#" data-act="goto-notiz" data-i="${i}">Notiz: Wie komme ich an fehlende Aspekte?</a>` : '';
}

function rollenHtml(x) {
  return x.rollen.map(r => r === 'aktiv' ? '<span class="badge aktiv">aktiv</span>' : '<span class="badge ziel">Ziel</span>').join(' ');
}

function postenHtml(x, { sonstiges } = {}) {
  const suche = x.art === 'profil' ? x.aspekt : x.name;
  return `<div class="posten art-${x.art}${x.blockiert ? ' blockierer' : ''}">
    <div class="posten-kopf">
      <span class="posten-art">${ART_LABEL[x.art] || x.art}</span>
      <a href="#" class="posten-titel" data-act="fehlt-suche" data-q="${esc(suche)}">${esc(x.titel)}</a>
      ${x.blockiert ? `<span class="tag warn">blockiert ${x.blockiert} Aktion${x.blockiert > 1 ? 'en' : ''}</span>` : ''}
      ${x.engpass ? '<span class="tag warn">Engpass</span>' : ''}
    </div>
    <div class="small">${rollenHtml(x)} ${x.slots.length ? `<span class="muted">${esc(x.slots.join(', '))}</span>` : ''}</div>
    ${x.art === 'profil' ? `<div class="small">
        <div><span class="k">gesucht:</span> ${esc(x.gesucht.join(', ') || '–')}</div>
        <div><span class="k">Aspekt:</span> ${esc(x.aspekt)}</div>
        <div><span class="k">Route:</span><ol class="route">${x.route.map(r => `<li>${esc(r)}</li>`).join('')}</ol></div>
        ${aspektNotizLink()}
      </div>` : ''}
    ${x.detail.map(d => `<div class="small muted">${esc(d)}</div>`).join('')}
    ${x.zusatz.map(z => `<div class="small">${esc(z)}</div>`).join('')}
    ${x.art === 'aspekt' ? `<div class="small">${aspektNotizLink()}</div>` : ''}
    ${sonstiges ? `<div class="small"><span class="warn-text">Quelle nicht zugeordnet</span>${x.quelleFrei ? ` – laut Wissen: ${esc(x.quelleFrei)}` : ' – keine Quelle in wissen.json'}</div>` : ''}
    <div class="btn-row">
      <button class="btn" data-act="fehlt-sammel" data-id="${esc(x.id)}">In die Sammelliste</button>
      <button class="btn" data-act="fehlt-aus" data-id="${esc(x.id)}">Ausblenden</button>
      ${sonstiges ? `<button class="btn" data-act="farmziel-neu" data-name="${esc(x.art === 'profil' ? '' : x.name)}">Farmziel ergänzen</button>` : ''}
    </div>
  </div>`;
}

function gruppeHtml(g) {
  const f = g.farmziel;
  return `<section class="d4-panel fehlt-gruppe">
    <header class="d4-titel">
      <div><div class="char-name">${esc(g.titel)}</div>
        ${f && f.kosten ? `<div class="char-sub">Kosten: ${esc(listText(f.kosten))}</div>` : ''}</div>
      <div class="char-werte"><span><b>${g.posten.length}</b> offen</span></div>
    </header>
    ${f && f.notiz ? `<p class="small muted">${esc(f.notiz)}</p>` : ''}
    ${g.posten.map(x => postenHtml(x, { sonstiges: !f })).join('')}
  </section>`;
}

function farmzielFormHtml() {
  const ff = state.farmzielForm;
  if (!ff) return '';
  return `<form id="farmziel-form" class="d4-panel" autocomplete="off">
    <h3>Farmziel ergänzen</h3>
    <p class="small muted">Wird in der Arbeitskopie von wissen.json gespeichert (⚙ Dateien → exportieren, damit es bleibt).</p>
    <div class="grid2">
      <label class="f">Quelle deutsch<input type="text" name="quelle_de" required></label>
      <label class="f">Quelle englisch<input type="text" name="quelle_en"></label>
      <label class="f">Typ<input type="text" name="typ" placeholder="Boss, Aktivität …"></label>
      <label class="f">Kosten<input type="text" name="kosten" placeholder="z. B. 1x Unterschlupfschlüssel"></label>
    </div>
    <label class="f">Belohnungen (mit Komma)<input type="text" name="belohnungen" value="${esc(ff.belohnung || '')}"></label>
    <label class="f">Notiz<input type="text" name="notiz"></label>
    <div class="btn-row"><button class="btn primary" type="submit">Speichern</button><button class="btn" type="button" data-act="farmziel-abbrechen">Abbrechen</button></div>
  </form>`;
}

function viewFehlt() {
  const d = fehltDaten();
  const blockiert = d.posten.filter(x => x.blockiert > 0).length;
  const umschalter = `<div class="umschalter">
    <button class="btn${state.fehltAnsicht === 'quelle' ? ' primary' : ''}" data-act="fehlt-ansicht" data-v="quelle">Nach Quelle</button>
    <button class="btn${state.fehltAnsicht === 'prio' ? ' primary' : ''}" data-act="fehlt-ansicht" data-v="prio">Nach Priorität</button>
    <button class="btn" data-act="fehlt-kopieren">Als Text kopieren</button>
  </div>`;
  let inhalt;
  if (!d.gesamt) {
    inhalt = '<div class="msg info">Nichts offen – oder noch kein aktiver/Ziel-Build gesetzt.</div>';
  } else if (state.fehltAnsicht === 'quelle') {
    inhalt = gruppiereNachQuelle(state.wissen, d.posten).map(gruppeHtml).join('');
  } else {
    inhalt = prioHtml(d.posten);
  }
  const aus = asArray(state.profil.ausgeblendet);
  return `
    <section class="d4-panel">
      <header class="d4-titel"><div><div class="char-name">Was fehlt</div><div class="char-sub">Was besorge ich – und wo?</div></div></header>
      <p class="kopfzeile"><b>${d.posten.length}</b> Posten offen, davon <b>${blockiert}</b> blockiert${d.ausgeblendet ? ` · ${d.ausgeblendet} ausgeblendet <a href="#" data-act="fehlt-zeige-aus">${state.fehltZeigeAus ? 'verbergen' : 'anzeigen'}</a>` : ''}</p>
      ${umschalter}
      ${state.fehltZeigeAus && aus.length ? `<div class="small">Ausgeblendet: ${aus.map(id => `<span class="tag">${esc(id.replace(/^[a-z]+:/, ''))} <a href="#" data-act="fehlt-ein" data-id="${esc(id)}">einblenden</a></span>`).join(' ')}</div>` : ''}
      <details class="grenzen"><summary>Grenzen dieser Liste</summary><ul>
        <li>Die Quellen sind Freitext aus wissen.json. Findet die App kein passendes Farmziel, landet ein Posten unter „Sonstiges“ – das ist kein Fehler, sondern eine Lücke in den Daten.</li>
        <li>Keine Wahrscheinlichkeiten, keine Zeitschätzungen, keine Aussage darüber, wie lange etwas dauert – dafür gibt es keine Daten.</li>
        <li>Aspekte gelten als vorhanden, wenn sie im Kodex (Reiter Bestand) einen Rang haben; Runen, wenn der Bestand reicht.</li>
      </ul></details>
    </section>
    ${farmzielFormHtml()}
    ${inhalt}`;
}

function prioHtml(posten) {
  const sortiert = sortiereNachPrioritaet(posten);
  const teil = (titel, xs) => xs.length ? `<section class="d4-panel fehlt-gruppe"><header class="d4-titel"><div class="char-name">${titel}</div>
    <div class="char-werte"><span><b>${xs.length}</b></span></div></header>${xs.map(x => postenHtml(x, { sonstiges: !x.farmziele.length })).join('')}</section>` : '';
  const block = sortiert.filter(x => x.blockiert > 0);
  const aktiv = sortiert.filter(x => !x.blockiert && x.rollen.includes('aktiv'));
  const ziel = sortiert.filter(x => !x.blockiert && !x.rollen.includes('aktiv') && x.rollen.includes('ziel'));
  const zb = zielBuild();
  const wk = zb ? zb.wechselkriterien.filter(w => !w.erledigt) : [];
  const auf = state.profil.offeneAufgaben.filter(a => !a.erledigt);
  return teil('Blockierer', block) + teil('Aktueller Build', aktiv) + teil('Ziel-Build', ziel) +
    (wk.length ? `<section class="d4-panel"><header class="d4-titel"><div class="char-name">Wechselkriterien ${esc(zb.name)}</div></header>
      <ul class="affixe">${wk.map(w => `<li>${esc(w.text)}</li>`).join('')}</ul></section>` : '') +
    (auf.length ? `<section class="d4-panel"><header class="d4-titel"><div class="char-name">Offene Aufgaben</div></header>
      <ul class="affixe">${auf.map(a => `<li>${esc(a.text)}</li>`).join('')}</ul></section>` : '');
}

/** Kompakte Textfassung für die Zwischenablage, gruppiert wie die Ansicht. */
function fehltAlsText() {
  const d = fehltDaten();
  const zeile = x => `- ${x.titel}${x.slots.length ? ` [${x.slots.join(', ')}]` : ''} (${x.rollen.join('+') || '–'})${x.blockiert ? ` – blockiert ${x.blockiert}` : ''}${x.zusatz.length ? ` – ${x.zusatz[0]}` : ''}`;
  const kopf = `Was fehlt – ${d.posten.length} Posten, ${d.posten.filter(x => x.blockiert).length} blockiert (${today()})`;
  if (state.fehltAnsicht === 'quelle') {
    return [kopf, ...gruppiereNachQuelle(state.wissen, d.posten).map(g =>
      `\n== ${g.titel}${g.farmziel && g.farmziel.kosten ? ` – Kosten: ${listText(g.farmziel.kosten)}` : ''}\n${g.posten.map(zeile).join('\n')}`)].join('\n');
  }
  return [kopf, '', ...sortiereNachPrioritaet(d.posten).map(zeile)].join('\n');
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const p = state.profil;
  switch (el.dataset.act) {
    case 'fehlt-ansicht': state.fehltAnsicht = el.dataset.v; render(); break;
    case 'fehlt-zeige-aus': e.preventDefault(); state.fehltZeigeAus = !state.fehltZeigeAus; render(); break;
    case 'fehlt-suche': e.preventDefault(); state.query = el.dataset.q; setTab('suche'); break;
    case 'fehlt-aus':
      if (!p.ausgeblendet.includes(el.dataset.id)) p.ausgeblendet.push(el.dataset.id);
      saveProfil(); render(); break;
    case 'fehlt-ein':
      e.preventDefault(); p.ausgeblendet = p.ausgeblendet.filter(x => x !== el.dataset.id); saveProfil(); render(); break;
    case 'fehlt-sammel': {
      const x = fehltDaten().posten.find(y => y.id === el.dataset.id);
      if (!x) return;
      const name = x.art === 'profil' ? x.titel : x.titel;
      if (!p.sammelliste.some(s => norm(itemText(s)) === norm(name))) {
        p.sammelliste.push({ name_de: name, name_en: '', notiz: `aus „Was fehlt“${x.slots.length ? ` (${x.slots.join(', ')})` : ''}`, erledigt: false });
        saveProfil(); buildIndex();
      }
      el.textContent = 'In der Sammelliste ✓';
      break;
    }
    case 'fehlt-kopieren': {
      const text = fehltAlsText();
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
        .then(() => { el.textContent = 'Kopiert ✓'; })
        .catch(() => { window.prompt('Kopieren nicht möglich – hier markieren und kopieren:', text); });
      break;
    }
    case 'farmziel-neu': state.farmzielForm = { belohnung: el.dataset.name }; render(); window.scrollTo(0, 0); break;
    case 'farmziel-abbrechen': state.farmzielForm = null; render(); break;
  }
});

document.addEventListener('submit', e => {
  if (e.target.id !== 'farmziel-form') return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const g = k => String(fd.get(k) || '').trim();
  state.wissen.farmziele.push({
    quelle_de: g('quelle_de'), quelle_en: g('quelle_en'), typ: g('typ'), kosten: g('kosten'),
    belohnungen: g('belohnungen').split(',').map(x => x.trim()).filter(Boolean), notiz: g('notiz'), stand: today(),
  });
  saveWissen(true);
  state.farmzielForm = null;
  render();
});
