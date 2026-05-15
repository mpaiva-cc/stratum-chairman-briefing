/* ============================================================
   Stratum · Console — application logic
   ------------------------------------------------------------
   Single-page app. No build step. Pure vanilla.

   Architecture:
     loadData() → state.people / state.orgs
     bindUI()   → tabs, ask, palette, drawer, filters
     handlers   → question handlers (Ask) and chart renderers (Insights)
     people     → filter / sort / paginate / drawer

   The keystone is `answerQuestion()`: 6 fully-implemented handlers
   computed in-browser from people.json, plus a graceful refusal.
   ============================================================ */

'use strict';

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────
const state = {
  people: [],
  orgs: null,
  byId: new Map(),
  // ASK view
  saved: [],            // session-only
  currentAnswer: null,  // {question, ...}
  // PEOPLE view
  filtered: [],
  pageSize: 80,
  pageRendered: 0,
  // Drawer
  drawerEmpId: null,
  // Active view
  activeView: 'ask',
  // HIRING view
  requisitions: [],
  candidates: [],
  atsMeta: null,
  byReqId: new Map(),
  reqFiltered: [],
  reqPageSize: 200,
  reqPageRendered: 0,
  hiringSub: 'pipeline',  // pipeline | requisitions | sources
};

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
const EXAMPLE_QUESTIONS = [
  "Show me our pay equity gap in EMEA at senior IC and M3 levels",
  "Who's at flight risk in engineering with comp below band?",
  "What's the median tenure for senior engineers globally?",
  "How does manager span of control look across teams?",
  "Show me underpaid high performers",
  "What's our retention story for new joiners in NA?",
];

const PLACEHOLDER_CYCLE = [
  "Show me our pay equity gap in EMEA at senior IC and M3 levels…",
  "Who's at flight risk in engineering with comp below band?",
  "What's the median tenure for senior engineers globally?",
  "Show me underpaid high performers across the company",
  "What's our retention story for new joiners in NA?",
];

const DEPT_COLORS = {
  "Engineering":      "#4a5d3a",
  "Sales":            "#b8651f",
  "Operations":       "#6b3a4a",
  "Customer Success": "#8a4711",
  "Product":          "#2a3344",
  "Marketing":        "#b94a3d",
  "Design":           "#6b3a4a",
  "Finance":          "#364528",
  "IT/Security":      "#4b5365",
  "People":           "#b8651f",
  "Legal":            "#0e1626",
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const $  = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

const fmt = {
  money: n => "$" + Math.round(n).toLocaleString("en-US"),
  moneyShort: n => {
    if (n >= 1e6) return "$" + (n/1e6).toFixed(1).replace(/\.0$/,'') + "M";
    if (n >= 1e3) return "$" + Math.round(n/1e3) + "K";
    return "$" + Math.round(n);
  },
  pct: (n, d=1) => (n*100).toFixed(d) + "%",
  pctRaw: n => (Math.round(n*10)/10) + "%",
  num: n => Math.round(n).toLocaleString("en-US"),
  date: iso => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {year:"numeric", month:"short", day:"numeric"});
  },
  clockNow: () => {
    const d = new Date();
    return d.toLocaleTimeString("en-US", {hour:"2-digit", minute:"2-digit", timeZoneName:"short"});
  },
};

function initialsOf(name) {
  return name.split(/\s+/).slice(0,2).map(p => p[0]||'').join('').toUpperCase();
}

function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a,b) => a-b);
  const m = Math.floor(s.length/2);
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a,b) => a-b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function el(tag, attrs={}, children=[]) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'on') {
      for (const [evt, fn] of Object.entries(v)) node.addEventListener(evt, fn);
    } else if (k.startsWith('data-') || k === 'role' || k.startsWith('aria-')) {
      node.setAttribute(k, v);
    } else {
      node[k] = v;
    }
  }
  for (const c of (Array.isArray(children) ? children : [children])) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

// ─────────────────────────────────────────────────────────────
// DATA LOAD
// ─────────────────────────────────────────────────────────────
async function loadData() {
  const bar = $('#loadbar');
  bar.style.width = '15%';
  try {
    const [people, orgs, reqs, cands, meta] = await Promise.all([
      fetch('data/people.json').then(r => r.json()),
      fetch('data/orgs.json').then(r => r.json()),
      // ATS files — soft-fail (if missing, hiring tab simply shows empty)
      fetch('data/requisitions.json').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('data/candidates.json').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('data/ats_meta.json').then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    bar.style.width = '75%';
    state.people = people;
    state.orgs = orgs;
    state.byId = new Map(people.map(p => [p.id, p]));
    state.requisitions = reqs || [];
    state.candidates = cands || [];
    state.atsMeta = meta;
    state.byReqId = new Map((reqs || []).map(r => [r.id, r]));
    bar.style.width = '100%';
    setTimeout(() => bar.classList.add('is-done'), 250);
  } catch (e) {
    console.error('Failed to load data', e);
    bar.style.background = '#b94a3d';
    document.body.innerHTML = `
      <div style="padding:4rem 2rem; text-align:center; font-family:var(--serif);">
        <h2 style="font-family:var(--display); font-size:2rem;">Couldn't load the graph.</h2>
        <p>Try serving this directory over a local web server:</p>
        <pre style="background:#ebe1c9; padding:1rem; display:inline-block;">cd console &amp;&amp; python3 -m http.server 8000</pre>
      </div>`;
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────────────────────
function switchView(name) {
  state.activeView = name;
  $$('.tab').forEach(t => {
    const sel = t.dataset.view === name;
    t.setAttribute('aria-selected', sel ? 'true' : 'false');
  });
  $$('.mobile-tab').forEach(t => {
    const sel = t.dataset.view === name;
    t.setAttribute('aria-selected', sel ? 'true' : 'false');
  });
  $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));

  if (name === 'people' && !state.filtered.length) {
    applyFilters();
  }
  if (name === 'insights') {
    renderInsights();
  }
  if (name === 'hiring') {
    renderHiring();
  }
  // scroll to top of stage
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindTabs() {
  $$('.tab, .mobile-tab').forEach(t => {
    t.addEventListener('click', () => switchView(t.dataset.view));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const tabs = $$('.tab');
        const idx = tabs.indexOf(t);
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const next = tabs[(idx + dir + tabs.length) % tabs.length];
        next.focus();
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────
// ASK VIEW
// ─────────────────────────────────────────────────────────────
function bindAskView() {
  // Example chips
  const chipMount = $('#ask-chips');
  EXAMPLE_QUESTIONS.forEach(q => {
    chipMount.appendChild(el('button', {
      class: 'chip', type: 'button',
      on: { click: () => submitQuestion(q) },
      html: `${escapeHtml(q)}<span class="arr">→</span>`,
    }));
  });

  // Placeholder cycling
  let cycleIdx = 0;
  const input = $('#ask-input');
  setInterval(() => {
    if (document.activeElement === input || input.value) return;
    cycleIdx = (cycleIdx + 1) % PLACEHOLDER_CYCLE.length;
    input.setAttribute('placeholder', PLACEHOLDER_CYCLE[cycleIdx]);
  }, 4200);

  // Form submit
  $('#ask-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (v) submitQuestion(v);
  });

  // Insight "Ask about this" buttons
  $$('.insight-ask').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView('ask');
      setTimeout(() => submitQuestion(btn.dataset.q), 80);
    });
  });
}

function submitQuestion(q) {
  $('#ask-input').value = q;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => {
    // Route to the live LLM agent when an API key is configured.
    if (LLM && LLM.settings.apiKey) {
      renderAnswerLive(q);
    } else {
      renderAnswer(q);
    }
  }, 100);
}

// ─────────────────────────────────────────────────────────────
// ANSWER RENDERING
// ─────────────────────────────────────────────────────────────
function renderAnswer(question) {
  const result = answerQuestion(question);
  state.currentAnswer = result;

  const mount = $('#answer-mount');
  mount.innerHTML = '';

  if (!result.matched) {
    // Refusal card
    const refusal = el('div', { class: 'refusal' });
    refusal.innerHTML = `
      <h3>We're a <em>prototype</em>.</h3>
      <p>This question doesn't yet map to one of the canonical handlers in this build.
      In the production console, the copilot would route this to the people-graph
      retrieval pipeline. For the demo, try one of these:</p>
      <div class="ask-chips" style="margin-top:1rem;">
        ${EXAMPLE_QUESTIONS.map(q =>
          `<button class="chip" type="button" data-q="${escapeHtml(q)}">${escapeHtml(q)}<span class="arr">→</span></button>`
        ).join('')}
      </div>
    `;
    refusal.querySelectorAll('.chip').forEach(c => {
      c.addEventListener('click', () => submitQuestion(c.dataset.q));
    });
    mount.appendChild(refusal);
    return;
  }

  // Build the structured answer card
  const card = el('div', { class: 'answer-card', role: 'article' });

  // Question pill (ASK)
  const q = el('div', { class: 'answer-q' });
  q.innerHTML = `
    <span class="answer-q-label">§ Ask</span>
    <span class="answer-q-text">${escapeHtml(result.question)}</span>
  `;
  card.appendChild(q);

  // 1. ASK section — cohort filter
  const askSec = el('div', { class: 'answer-section' });
  askSec.innerHTML = `
    <div class="section-label"><span class="sigil">§1</span>Ask · interpreted as</div>
    <div class="cohort-filter">${result.cohortFilter}</div>
  `;
  card.appendChild(askSec);

  // 2. ANSWER section
  const ansSec = el('div', { class: 'answer-section' });
  ansSec.innerHTML = `
    <div class="section-label"><span class="sigil">§2</span>Answer</div>
    <p class="answer-headline">${result.headline}</p>
  `;
  card.appendChild(ansSec);

  // 3. INSPECT section — chart + table
  const inspSec = el('div', { class: 'answer-section' });
  inspSec.innerHTML = `
    <div class="section-label"><span class="sigil">§3</span>Inspect · chart and cohort</div>
    <div class="inspect-row">
      <div class="inspect-chart">
        <div class="ch-title">${escapeHtml(result.chartTitle)}</div>
        <div id="inspect-chart-mount"></div>
      </div>
      <div>
        ${result.tableHtml || ''}
      </div>
    </div>
  `;
  card.appendChild(inspSec);

  // 4. CITE section
  const citeSec = el('div', { class: 'answer-section' });
  citeSec.innerHTML = `
    <div class="section-label"><span class="sigil">§4</span>Cite · methodology and provenance</div>
    <div class="cite-grid">
      ${result.citations.map(c => `
        <div class="cite-chip">
          <span class="lbl">${escapeHtml(c.label)}</span>
          <span class="v">${c.value}</span>
        </div>
      `).join('')}
    </div>
  `;
  card.appendChild(citeSec);

  // Actions
  const actions = el('div', { class: 'answer-actions' });
  actions.innerHTML = `
    <button class="btn btn-ochre" id="act-save">Save to my workspace</button>
    <button class="btn btn-ghost" id="act-new">New question</button>
    <span style="flex:1"></span>
    <span style="font-family:var(--mono); font-size:10.5px; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-mute);">
      Confidence · <span style="color:${result.confidence === 'high' ? 'var(--moss)' : 'var(--ochre)'}; font-weight:700;">${result.confidence}</span>
    </span>
  `;
  card.appendChild(actions);

  mount.appendChild(card);

  // Render the chart now that we have a DOM node
  if (result.renderChart) {
    result.renderChart($('#inspect-chart-mount'));
  }

  // Wire actions
  $('#act-save').addEventListener('click', () => saveToWorkspace(result));
  $('#act-new').addEventListener('click', () => {
    mount.innerHTML = '';
    $('#ask-input').value = '';
    $('#ask-input').focus();
  });
}

function saveToWorkspace(result) {
  if (state.saved.find(s => s.question === result.question)) {
    showToast('Already saved — pinned at the top.');
    return;
  }
  state.saved.unshift({
    question: result.question,
    when: fmt.clockNow(),
  });
  if (state.saved.length > 8) state.saved.length = 8;
  renderSavedRail();
  showToast(`Saved to workspace at ${fmt.clockNow()}`);
}

function renderSavedRail() {
  const rail = $('#saved-rail');
  const list = $('#saved-list');
  if (!state.saved.length) {
    rail.hidden = true;
    return;
  }
  rail.hidden = false;
  list.innerHTML = '';
  state.saved.forEach(s => {
    const item = el('div', {
      class: 'saved-item',
      on: { click: () => submitQuestion(s.question) },
    });
    item.innerHTML = `<span class="ts">Saved · ${s.when}</span>${escapeHtml(s.question)}`;
    list.appendChild(item);
  });
}

function showToast(msg) {
  const t = $('#toast');
  t.innerHTML = `<span class="ok">✓</span>${escapeHtml(msg)}`;
  t.classList.add('is-show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('is-show'), 2400);
}

// ─────────────────────────────────────────────────────────────
// QUESTION HANDLERS (the keystone)
//   Each handler returns:
//   { matched: true,
//     question, cohortFilter, headline,
//     chartTitle, renderChart(mountEl), tableHtml,
//     citations: [{label, value}],
//     confidence: 'high'|'moderate' }
// ─────────────────────────────────────────────────────────────
function answerQuestion(rawQ) {
  const q = (rawQ || '').toLowerCase();
  const orig = rawQ;

  // Route by keyword matching
  if (/pay\s*equity|pay\s*gap|gender\s*gap|equity\s*gap|equity.*emea/.test(q)) {
    return Q_payEquity(orig);
  }
  if (/flight\s*risk|attrition|leaving|leave|quit/.test(q) && /eng|engineer|comp|below|band/.test(q)) {
    return Q_flightRiskEngineering(orig);
  }
  if (/flight\s*risk|at\s*risk|attrition/.test(q)) {
    return Q_flightRiskEngineering(orig);
  }
  if (/(median|average)\s*tenure|tenure.*engineer|senior\s*engineer.*tenure|tenure.*senior/.test(q)) {
    return Q_tenureSeniorEngineers(orig);
  }
  if (/span\s*of\s*control|manager\s*span|spans|too\s*many\s*direct/.test(q)) {
    return Q_spanOfControl(orig);
  }
  if (/underpaid.*(high\s*performer|top\s*performer)|high\s*performer.*underpaid|below\s*band.*high\s*perform/.test(q)) {
    return Q_underpaidHighPerformers(orig);
  }
  if (/retention|new\s*joiner|new\s*hire|first\s*year|na\s*retention|retention.*na|north\s*america.*retention/.test(q)) {
    return Q_retentionNewJoinersNA(orig);
  }
  if (/headcount.*department|department.*headcount|headcount\s*by\s*dept/.test(q)) {
    // Special: redirect to insights, but offer a fallback answer here
    return Q_headcountByDept(orig);
  }

  return { matched: false, question: orig };
}

// ─── Q1: Pay equity in EMEA at senior IC + M3 ─────────────
function Q_payEquity(orig) {
  const cohort = state.people.filter(p =>
    p.region === 'EMEA' &&
    (p.level === 'IC5' || p.level === 'IC6' || p.level === 'M3')
  );
  const women = cohort.filter(p => p.gender === 'woman');
  const men   = cohort.filter(p => p.gender === 'man');
  const nb    = cohort.filter(p => p.gender === 'nonbinary');

  const medW = median(women.map(p => p.comp_total));
  const medM = median(men.map(p => p.comp_total));
  const gap = (medM - medW) / medM * 100;

  // Per-level breakdown
  const levels = ['IC5','IC6','M3'];
  const byLevel = levels.map(L => {
    const ws = cohort.filter(p => p.level === L && p.gender === 'woman').map(p => p.comp_total);
    const ms = cohort.filter(p => p.level === L && p.gender === 'man').map(p => p.comp_total);
    const mw = median(ws), mm = median(ms);
    return {
      level: L,
      women_n: ws.length, men_n: ms.length,
      women_median: mw, men_median: mm,
      gap_pct: mm > 0 ? (mm - mw) / mm * 100 : 0,
    };
  });

  return {
    matched: true,
    question: orig,
    cohortFilter:
      `<span class="k">WHERE</span> region = <span class="v">'EMEA'</span> ` +
      `<span class="k">AND</span> level <span class="k">IN</span> (<span class="v">'IC5','IC6','M3'</span>) ` +
      `<span class="k">GROUP BY</span> <span class="v">gender</span>`,
    headline:
      `<span class="big">${gap.toFixed(1)}%</span> &mdash; the median pay gap between ` +
      `women (n=${women.length}) and men (n=${men.length}) in <em>EMEA</em> at senior IC and M3 levels. ` +
      `Concentrated in <em>IC5</em> and <em>M3</em>, where the gap exceeds 5%.`,
    chartTitle: 'Median comp · women vs men · by level',
    renderChart: (mount) => renderGroupedBars(mount, byLevel.map(b => ({
      group: b.level,
      bars: [
        { label: 'Women', value: b.women_median, color: 'var(--plum)' },
        { label: 'Men',   value: b.men_median,   color: 'var(--ink-2)' },
      ],
      annotation: (b.gap_pct > 0 ? '−' : '+') + Math.abs(b.gap_pct).toFixed(1) + '%',
    }))),
    tableHtml: `
      <table class="inspect-table">
        <thead>
          <tr><th>Level</th><th class="num">Women</th><th class="num">Men</th><th class="num">Gap</th></tr>
        </thead>
        <tbody>
          ${byLevel.map(b => `
            <tr>
              <td><strong>${b.level}</strong></td>
              <td class="num">${fmt.moneyShort(b.women_median)}<br><span style="color:var(--ink-mute); font-size:10px;">n=${b.women_n}</span></td>
              <td class="num">${fmt.moneyShort(b.men_median)}<br><span style="color:var(--ink-mute); font-size:10px;">n=${b.men_n}</span></td>
              <td class="num" style="color:${b.gap_pct > 3 ? 'var(--risk-high)' : (b.gap_pct > 0 ? 'var(--ochre)' : 'var(--moss)')}; font-weight:700;">
                ${(b.gap_pct > 0 ? '−' : '+')}${Math.abs(b.gap_pct).toFixed(1)}%
              </td>
            </tr>
          `).join('')}
          <tr style="background:var(--paper-deep);">
            <td><strong>All</strong></td>
            <td class="num">${fmt.moneyShort(medW)}<br><span style="color:var(--ink-mute); font-size:10px;">n=${women.length}</span></td>
            <td class="num">${fmt.moneyShort(medM)}<br><span style="color:var(--ink-mute); font-size:10px;">n=${men.length}</span></td>
            <td class="num" style="color:var(--risk-high); font-weight:700;">−${gap.toFixed(1)}%</td>
          </tr>
        </tbody>
      </table>
      <p style="font-family:var(--mono); font-size:10.5px; color:var(--ink-mute); margin:.6rem 0 0; letter-spacing:.04em;">
        Nonbinary employees (n=${nb.length}) excluded from binary gap analysis;
        full report available on request.
      </p>
    `,
    citations: [
      { label: 'Source',     value: 'People Graph · 2,000 records' },
      { label: 'As of',      value: '2026-05-12' },
      { label: 'Cohort',     value: `${cohort.length} employees · EMEA · IC5/IC6/M3` },
      { label: 'Method',     value: 'Median comp_total by gender, within level' },
      { label: 'Confidence', value: 'High · n > 30 per cell' },
      { label: 'Methodology',value: 'Comparison adjusts for level + region; does not control for tenure or sub-team' },
    ],
    confidence: 'high',
  };
}

// ─── Q2: Flight risk in Engineering with comp below band ─
function Q_flightRiskEngineering(orig) {
  const cohort = state.people.filter(p =>
    p.department === 'Engineering' &&
    p.comp_ratio < 0.95 &&
    p.flight_risk_band !== 'low'
  ).sort((a,b) => b.flight_risk - a.flight_risk);

  const high = cohort.filter(p => p.flight_risk_band === 'high');

  // For chart: group by manager (top 6)
  const byMgr = new Map();
  high.forEach(p => {
    const mid = p.manager_id;
    if (!mid) return;
    if (!byMgr.has(mid)) byMgr.set(mid, []);
    byMgr.get(mid).push(p);
  });
  const mgrRows = Array.from(byMgr.entries())
    .map(([mid, list]) => ({
      manager: state.byId.get(mid),
      list,
    }))
    .filter(r => r.manager)
    .sort((a,b) => b.list.length - a.list.length)
    .slice(0, 6);

  const top10 = cohort.slice(0, 10);

  return {
    matched: true,
    question: orig,
    cohortFilter:
      `<span class="k">WHERE</span> department = <span class="v">'Engineering'</span> ` +
      `<span class="k">AND</span> comp_ratio &lt; <span class="v">0.95</span> ` +
      `<span class="k">AND</span> flight_risk_band <span class="k">IN</span> (<span class="v">'high','moderate'</span>) ` +
      `<span class="k">ORDER BY</span> flight_risk <span class="k">DESC</span>`,
    headline:
      `<span class="big">${high.length}</span> engineers at <em>high</em> flight risk with comp below band P50 ` +
      `(plus ${cohort.length - high.length} moderate). ` +
      `Median comp gap to P50 is <strong>−${((1 - median(cohort.map(p=>p.comp_ratio))) * 100).toFixed(0)}%</strong>; ` +
      `median tenure ${median(cohort.map(p=>p.tenure_years)).toFixed(1)} yrs.`,
    chartTitle: 'High-risk engineers · by manager (top 6)',
    renderChart: (mount) => renderHorizontalBars(mount, mgrRows.map(r => ({
      label: r.manager.display_name + ' · ' + r.manager.level,
      value: r.list.length,
      sub: r.manager.team,
    })), { suffix: ' eng', color: 'var(--risk-high)' }),
    tableHtml: `
      <table class="inspect-table">
        <thead>
          <tr><th>Engineer</th><th>Level</th><th class="num">Comp Δ</th><th class="num">Risk</th></tr>
        </thead>
        <tbody>
          ${top10.map(p => `
            <tr style="cursor:pointer;" onclick="window.__openDrawer('${p.id}')">
              <td><strong>${escapeHtml(p.display_name)}</strong><br>
                <span style="color:var(--ink-mute); font-size:10.5px;">${escapeHtml(p.location)} · ${escapeHtml(p.team)}</span>
              </td>
              <td>${escapeHtml(p.level)}</td>
              <td class="num" style="color:${p.comp_ratio < 0.85 ? 'var(--risk-high)' : 'var(--ochre)'};">
                ${(p.comp_ratio < 1 ? '−' : '+')}${Math.abs((1 - p.comp_ratio) * 100).toFixed(0)}%
              </td>
              <td class="num">
                <span class="risk-dot ${p.flight_risk_band}" style="display:inline-block; vertical-align:middle; margin-right:4px;"></span>${p.flight_risk.toFixed(2)}
              </td>
            </tr>
          `).join('')}
          ${cohort.length > 10 ? `<tr><td colspan="4" style="text-align:center; color:var(--ink-mute); font-style:italic;">+ ${cohort.length - 10} more · open the People view to see all</td></tr>` : ''}
        </tbody>
      </table>
    `,
    citations: [
      { label: 'Source',     value: 'People Graph · 2,000 records' },
      { label: 'As of',      value: '2026-05-12' },
      { label: 'Cohort',     value: `${cohort.length} engineers below band, at risk` },
      { label: 'Method',     value: 'attrition_v1 · weighted blend of tenure, comp, review, promotion signals' },
      { label: 'Confidence', value: 'Moderate · backtested 0.78 on 2025 leavers' },
      { label: 'Refusal',    value: 'Will not write back to Workday without CHRO approval' },
    ],
    confidence: 'moderate',
  };
}

// ─── Q3: Median tenure for senior engineers ───────────────
function Q_tenureSeniorEngineers(orig) {
  // "Senior" = IC4 and up, plus M-level
  const cohort = state.people.filter(p =>
    p.department === 'Engineering' &&
    (['IC4','IC5','IC6','IC7','M1','M2','M3','M4'].includes(p.level))
  );
  const allEng = state.people.filter(p => p.department === 'Engineering');

  const medCohort = median(cohort.map(p => p.tenure_years));
  const medAll = median(allEng.map(p => p.tenure_years));

  // Tenure histogram by level
  const levels = ['IC4','IC5','IC6','IC7','M1','M2','M3','M4'];
  const byLevel = levels.map(L => {
    const xs = cohort.filter(p => p.level === L).map(p => p.tenure_years);
    return {
      level: L,
      n: xs.length,
      median: median(xs),
      p25: percentile(xs, 0.25),
      p75: percentile(xs, 0.75),
    };
  }).filter(r => r.n > 0);

  return {
    matched: true,
    question: orig,
    cohortFilter:
      `<span class="k">WHERE</span> department = <span class="v">'Engineering'</span> ` +
      `<span class="k">AND</span> level <span class="k">IN</span> (<span class="v">'IC4','IC5','IC6','IC7','M1+'</span>) ` +
      `<span class="k">GROUP BY</span> <span class="v">level</span>`,
    headline:
      `<span class="big">${medCohort.toFixed(1)} yrs</span> &mdash; median tenure for ` +
      `senior engineers globally (n=${cohort.length}). ` +
      `Across <em>all</em> engineering: ${medAll.toFixed(1)} yrs (n=${allEng.length}). ` +
      `Tenure climbs steadily through IC ranks.`,
    chartTitle: 'Median tenure by level (yrs)',
    renderChart: (mount) => renderHorizontalBars(mount, byLevel.map(b => ({
      label: b.level,
      value: b.median,
      sub: 'n=' + b.n,
    })), { suffix: ' yrs', color: 'var(--moss)', valueFmt: v => v.toFixed(1) }),
    tableHtml: `
      <table class="inspect-table">
        <thead>
          <tr><th>Level</th><th class="num">N</th><th class="num">P25</th><th class="num">Median</th><th class="num">P75</th></tr>
        </thead>
        <tbody>
          ${byLevel.map(b => `
            <tr>
              <td><strong>${b.level}</strong></td>
              <td class="num">${b.n}</td>
              <td class="num">${b.p25.toFixed(1)}</td>
              <td class="num" style="color:var(--ochre); font-weight:700;">${b.median.toFixed(1)}</td>
              <td class="num">${b.p75.toFixed(1)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `,
    citations: [
      { label: 'Source',     value: 'People Graph · 2,000 records' },
      { label: 'As of',      value: '2026-05-12' },
      { label: 'Cohort',     value: `${cohort.length} senior engineers (IC4+, M1+)` },
      { label: 'Method',     value: '(today − hire_date) / 365.25' },
      { label: 'Confidence', value: 'High · n > 50 per level above IC1' },
    ],
    confidence: 'high',
  };
}

// ─── Q4: Manager span of control ──────────────────────────
function Q_spanOfControl(orig) {
  const mgrs = state.people.filter(p => p.is_manager && p.span_of_control > 0);

  // By team-level (sub-team within department)
  const byTeam = new Map();
  mgrs.forEach(m => {
    const key = m.department + ' / ' + m.team;
    if (!byTeam.has(key)) byTeam.set(key, []);
    byTeam.get(key).push(m.span_of_control);
  });
  const teamRows = Array.from(byTeam.entries())
    .map(([k, vs]) => ({
      team: k,
      n_mgrs: vs.length,
      median: median(vs),
      max: Math.max(...vs),
    }))
    .sort((a,b) => b.median - a.median)
    .slice(0, 8);

  const highSpan = mgrs.filter(m => m.span_of_control > 12);
  const lowSpan  = mgrs.filter(m => m.span_of_control < 4);

  return {
    matched: true,
    question: orig,
    cohortFilter:
      `<span class="k">WHERE</span> is_manager = <span class="v">true</span> ` +
      `<span class="k">AND</span> span_of_control &gt; <span class="v">0</span> ` +
      `<span class="k">GROUP BY</span> <span class="v">department, team</span>`,
    headline:
      `<span class="big">${median(mgrs.map(m=>m.span_of_control)).toFixed(0)}</span> direct reports &mdash; ` +
      `median span across <em>${mgrs.length}</em> managers. ` +
      `<strong>${highSpan.length}</strong> managers exceed 12 reports (over-extended); ` +
      `<strong>${lowSpan.length}</strong> have fewer than 4 (under-utilized).`,
    chartTitle: 'Median span by team (top 8)',
    renderChart: (mount) => renderHorizontalBars(mount, teamRows.map(t => ({
      label: t.team,
      value: t.median,
      sub: t.n_mgrs + ' mgrs',
    })), { suffix: ' reports', color: 'var(--ink)', valueFmt: v => v.toFixed(0) }),
    tableHtml: `
      <table class="inspect-table">
        <thead>
          <tr><th>Team</th><th class="num">Mgrs</th><th class="num">Median</th><th class="num">Max</th></tr>
        </thead>
        <tbody>
          ${teamRows.map(t => `
            <tr>
              <td><strong>${escapeHtml(t.team)}</strong></td>
              <td class="num">${t.n_mgrs}</td>
              <td class="num" style="color:${t.median > 10 ? 'var(--ochre)' : 'var(--ink)'}; font-weight:700;">${t.median.toFixed(0)}</td>
              <td class="num" style="color:${t.max > 12 ? 'var(--risk-high)' : 'var(--ink-mute)'};">${t.max}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `,
    citations: [
      { label: 'Source',     value: 'People Graph · manager_id edges' },
      { label: 'As of',      value: '2026-05-12' },
      { label: 'Cohort',     value: `${mgrs.length} managers across ${byTeam.size} teams` },
      { label: 'Method',     value: 'Direct-report count from manager_id graph' },
      { label: 'Guidance',   value: 'Healthy span = 5–9; >12 signals capacity risk' },
      { label: 'Confidence', value: 'High · structural; not modeled' },
    ],
    confidence: 'high',
  };
}

// ─── Q5: Underpaid high performers ────────────────────────
function Q_underpaidHighPerformers(orig) {
  const cohort = state.people.filter(p =>
    p.performance_score >= 4.0 &&
    p.comp_ratio < 0.85
  ).sort((a,b) => a.comp_ratio - b.comp_ratio);

  // By dept
  const byDept = new Map();
  cohort.forEach(p => {
    if (!byDept.has(p.department)) byDept.set(p.department, []);
    byDept.get(p.department).push(p);
  });
  const deptRows = Array.from(byDept.entries())
    .map(([d, list]) => ({ dept: d, list }))
    .sort((a,b) => b.list.length - a.list.length);

  const top10 = cohort.slice(0, 10);
  const totalCost = cohort.reduce((s, p) => s + (p.comp_band_p50 * 0.95 - p.comp_total), 0);

  return {
    matched: true,
    question: orig,
    cohortFilter:
      `<span class="k">WHERE</span> performance_score &gt;= <span class="v">4.0</span> ` +
      `<span class="k">AND</span> comp_ratio &lt; <span class="v">0.85</span> ` +
      `<span class="k">ORDER BY</span> comp_ratio <span class="k">ASC</span>`,
    headline:
      `<span class="big">${cohort.length}</span> high performers paid below 85% of band &mdash; ` +
      `the cohort most likely to leave. Estimated true-up cost to <em>95%</em> of band: ` +
      `<strong>${fmt.moneyShort(totalCost)}</strong> annualized.`,
    chartTitle: 'Underpaid high performers · by department',
    renderChart: (mount) => renderHorizontalBars(mount, deptRows.map(r => ({
      label: r.dept,
      value: r.list.length,
      sub: '',
    })), { suffix: ' people', color: 'var(--ochre)' }),
    tableHtml: `
      <table class="inspect-table">
        <thead>
          <tr><th>Name</th><th>Dept</th><th class="num">Comp ratio</th><th class="num">Score</th></tr>
        </thead>
        <tbody>
          ${top10.map(p => `
            <tr style="cursor:pointer;" onclick="window.__openDrawer('${p.id}')">
              <td><strong>${escapeHtml(p.display_name)}</strong><br>
                <span style="color:var(--ink-mute); font-size:10.5px;">${escapeHtml(p.title)}</span>
              </td>
              <td>${escapeHtml(p.department.replace('Customer Success','CS').replace('IT/Security','IT'))}</td>
              <td class="num" style="color:var(--risk-high); font-weight:700;">${(p.comp_ratio*100).toFixed(0)}%</td>
              <td class="num">${p.performance_score.toFixed(1)}</td>
            </tr>
          `).join('')}
          ${cohort.length > 10 ? `<tr><td colspan="4" style="text-align:center; color:var(--ink-mute); font-style:italic;">+ ${cohort.length - 10} more</td></tr>` : ''}
        </tbody>
      </table>
    `,
    citations: [
      { label: 'Source',     value: 'People Graph · perf + comp join' },
      { label: 'As of',      value: '2026-05-12' },
      { label: 'Cohort',     value: `${cohort.length} employees · perf ≥ 4 · comp ratio < 0.85` },
      { label: 'Method',     value: 'True-up cost = (band_p50 × 0.95 − comp_total), summed' },
      { label: 'Action',     value: 'Recommend routing as DEC-* through compensation workflow' },
      { label: 'Confidence', value: 'High · deterministic over the graph' },
    ],
    confidence: 'high',
  };
}

// ─── Q6: Retention story for new joiners in NA ────────────
function Q_retentionNewJoinersNA(orig) {
  const cohort = state.people.filter(p =>
    p.region === 'NA' &&
    p.tenure_years < 1.5
  );
  const highRisk = cohort.filter(p => p.flight_risk_band === 'high');

  // Distribution by month-of-tenure (rounded)
  const buckets = [0,3,6,9,12,18].map((m, i, arr) => {
    const next = arr[i+1] !== undefined ? arr[i+1] : 24;
    const inBucket = cohort.filter(p => {
      const months = p.tenure_years * 12;
      return months >= m && months < next;
    });
    return {
      label: `${m}-${next}mo`,
      n: inBucket.length,
      high: inBucket.filter(p => p.flight_risk_band === 'high').length,
    };
  });

  const byDept = new Map();
  cohort.forEach(p => {
    if (!byDept.has(p.department)) byDept.set(p.department, { n: 0, high: 0 });
    const e = byDept.get(p.department);
    e.n++; if (p.flight_risk_band === 'high') e.high++;
  });
  const deptRows = Array.from(byDept.entries())
    .map(([d, v]) => ({ dept: d, n: v.n, high: v.high, rate: v.n ? v.high / v.n : 0 }))
    .filter(r => r.n >= 5)
    .sort((a,b) => b.rate - a.rate)
    .slice(0, 8);

  const meets = cohort.filter(p => p.last_review === 'meets' || p.last_review === 'exceeds').length;
  const reviewedPct = cohort.length ? (meets / cohort.length * 100) : 0;

  return {
    matched: true,
    question: orig,
    cohortFilter:
      `<span class="k">WHERE</span> region = <span class="v">'NA'</span> ` +
      `<span class="k">AND</span> tenure_years &lt; <span class="v">1.5</span> ` +
      `<span class="k">GROUP BY</span> <span class="v">tenure_bucket, department</span>`,
    headline:
      `<span class="big">${(highRisk.length/cohort.length*100).toFixed(0)}%</span> of new NA joiners ` +
      `(n=${cohort.length}) are already in the <em>high flight-risk</em> band &mdash; ` +
      `${highRisk.length} people. Concentration is in the <strong>3–9 month</strong> window. ` +
      `${reviewedPct.toFixed(0)}% have a "meets" or "exceeds" review on file.`,
    chartTitle: 'New joiners (NA) · count by tenure bucket',
    renderChart: (mount) => renderStackedBars(mount, buckets),
    tableHtml: `
      <table class="inspect-table">
        <thead>
          <tr><th>Department</th><th class="num">New (NA)</th><th class="num">High risk</th><th class="num">Rate</th></tr>
        </thead>
        <tbody>
          ${deptRows.map(r => `
            <tr>
              <td><strong>${escapeHtml(r.dept)}</strong></td>
              <td class="num">${r.n}</td>
              <td class="num">${r.high}</td>
              <td class="num" style="color:${r.rate > 0.20 ? 'var(--risk-high)' : (r.rate > 0.10 ? 'var(--ochre)' : 'var(--moss)')}; font-weight:700;">
                ${(r.rate*100).toFixed(0)}%
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `,
    citations: [
      { label: 'Source',     value: 'People Graph · tenure + attrition signal' },
      { label: 'As of',      value: '2026-05-12' },
      { label: 'Cohort',     value: `${cohort.length} NA hires with tenure < 18mo` },
      { label: 'Method',     value: 'Bucketed by tenure_months, joined with flight_risk_band' },
      { label: 'Recommend',  value: 'Trigger 30/60/90 check-in program for the 3-9mo window' },
      { label: 'Confidence', value: 'Moderate · signal correlates with leaving but is not causal' },
    ],
    confidence: 'moderate',
  };
}

// ─── Q7: Headcount by department (fallback insight question) ─
function Q_headcountByDept(orig) {
  const m = new Map();
  state.people.forEach(p => m.set(p.department, (m.get(p.department) || 0) + 1));
  const rows = Array.from(m.entries())
    .map(([d, n]) => ({ dept: d, n }))
    .sort((a,b) => b.n - a.n);

  return {
    matched: true,
    question: orig,
    cohortFilter:
      `<span class="k">SELECT</span> department, <span class="v">COUNT(*)</span> ` +
      `<span class="k">FROM</span> people <span class="k">GROUP BY</span> department`,
    headline:
      `<span class="big">${state.people.length.toLocaleString()}</span> total &mdash; ` +
      `<em>${rows[0].dept}</em> is the largest at ${rows[0].n} (${(rows[0].n/state.people.length*100).toFixed(0)}%). ` +
      `Smallest function: <em>${rows[rows.length-1].dept}</em> at ${rows[rows.length-1].n}.`,
    chartTitle: 'Headcount by department',
    renderChart: (mount) => renderHorizontalBars(mount, rows.map(r => ({
      label: r.dept, value: r.n,
    })), { suffix: ' people', color: 'var(--ochre)' }),
    tableHtml: `
      <table class="inspect-table">
        <thead><tr><th>Department</th><th class="num">N</th><th class="num">Share</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${escapeHtml(r.dept)}</strong></td>
              <td class="num">${r.n}</td>
              <td class="num">${(r.n/state.people.length*100).toFixed(1)}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `,
    citations: [
      { label: 'Source', value: 'People Graph · 2,000 records' },
      { label: 'As of',  value: '2026-05-12' },
      { label: 'Method', value: 'GROUP BY department, COUNT(*)' },
      { label: 'Confidence', value: 'High · structural' },
    ],
    confidence: 'high',
  };
}

// ─────────────────────────────────────────────────────────────
// SVG CHART RENDERERS
// ─────────────────────────────────────────────────────────────
function svgNs(tag, attrs={}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function renderHorizontalBars(mount, rows, opts={}) {
  const w = mount.clientWidth || 540;
  const rowH = 28;
  const labelW = 130;
  const valueW = 60;
  const padL = labelW + 8;
  const padR = valueW + 8;
  const h = rows.length * rowH + 18;
  const max = Math.max(...rows.map(r => r.value), 1);
  const valueFmt = opts.valueFmt || (v => Math.round(v).toLocaleString());

  const svg = svgNs('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' });

  rows.forEach((r, i) => {
    const y = 10 + i * rowH;
    const barW = (w - padL - padR) * (r.value / max);

    // label
    const label = svgNs('text', { x: labelW, y: y + rowH/2 + 4, 'text-anchor': 'end', class: 'label-strong' });
    label.textContent = r.label;
    svg.appendChild(label);
    if (r.sub) {
      const sub = svgNs('text', { x: labelW, y: y + rowH/2 + 16, 'text-anchor': 'end' });
      sub.setAttribute('fill', 'var(--ink-mute)');
      sub.setAttribute('font-size', '9.5');
      sub.textContent = r.sub;
      svg.appendChild(sub);
    }

    // bar
    const rect = svgNs('rect', {
      x: padL, y: y + 4, width: Math.max(barW, 1), height: rowH - 12,
      rx: 1, ry: 1,
    });
    rect.setAttribute('fill', opts.color || 'var(--ochre)');
    svg.appendChild(rect);

    // hover tooltip via <title>
    const title = svgNs('title');
    title.textContent = `${r.label}: ${valueFmt(r.value)}${opts.suffix || ''}`;
    rect.appendChild(title);

    // value
    const valText = svgNs('text', { x: w - 4, y: y + rowH/2 + 4, class: 'label-num' });
    valText.textContent = valueFmt(r.value) + (opts.suffix || '');
    svg.appendChild(valText);
  });

  mount.innerHTML = '';
  mount.appendChild(svg);
}

function renderGroupedBars(mount, groups, opts={}) {
  // groups: [{group, bars:[{label,value,color}], annotation}, ...]
  const w = mount.clientWidth || 540;
  const groupCount = groups.length;
  const groupW = (w - 80) / groupCount;
  const h = 260;
  const baseY = h - 40;
  const max = Math.max(...groups.flatMap(g => g.bars.map(b => b.value)), 1);

  const svg = svgNs('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' });

  // Y gridlines
  for (let i = 0; i <= 4; i++) {
    const y = 20 + (baseY - 20) * (i/4);
    const line = svgNs('line', { x1: 60, x2: w - 12, y1: y, y2: y, class: 'gridline' });
    svg.appendChild(line);
    const lbl = svgNs('text', { x: 56, y: y + 4, 'text-anchor': 'end' });
    lbl.textContent = fmt.moneyShort(max * (1 - i/4));
    svg.appendChild(lbl);
  }

  groups.forEach((g, gi) => {
    const gx = 60 + gi * groupW + 16;
    const barW = (groupW - 32) / g.bars.length;
    g.bars.forEach((b, bi) => {
      const barH = ((baseY - 20) * (b.value / max));
      const x = gx + bi * barW;
      const y = baseY - barH;
      const rect = svgNs('rect', {
        x: x + 2, y, width: Math.max(barW - 4, 1), height: barH,
        rx: 1, ry: 1,
      });
      rect.setAttribute('fill', b.color || 'var(--ochre)');
      const title = svgNs('title');
      title.textContent = `${g.group} · ${b.label}: ${fmt.moneyShort(b.value)}`;
      rect.appendChild(title);
      svg.appendChild(rect);

      // bar label
      const lbl = svgNs('text', { x: x + barW/2, y: baseY + 14, 'text-anchor': 'middle' });
      lbl.setAttribute('font-size', '9.5');
      lbl.textContent = b.label;
      svg.appendChild(lbl);
    });

    // group label
    const grp = svgNs('text', { x: gx + (groupW - 32)/2, y: baseY + 30, 'text-anchor': 'middle', class: 'label-strong' });
    grp.textContent = g.group;
    svg.appendChild(grp);

    // annotation
    if (g.annotation) {
      const ann = svgNs('text', { x: gx + (groupW - 32)/2, y: 14, 'text-anchor': 'middle' });
      ann.setAttribute('fill', 'var(--risk-high)');
      ann.setAttribute('font-weight', '700');
      ann.setAttribute('font-size', '11');
      ann.textContent = g.annotation;
      svg.appendChild(ann);
    }
  });

  mount.innerHTML = '';
  mount.appendChild(svg);
}

function renderStackedBars(mount, buckets) {
  const w = mount.clientWidth || 540;
  const h = 260;
  const padL = 40, padR = 12, padT = 20, padB = 40;
  const max = Math.max(...buckets.map(b => b.n), 1);
  const barW = (w - padL - padR) / buckets.length;

  const svg = svgNs('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' });

  // Y-axis (4 lines)
  for (let i = 0; i <= 4; i++) {
    const y = padT + (h - padT - padB) * (i/4);
    const line = svgNs('line', { x1: padL, x2: w - padR, y1: y, y2: y, class: 'gridline' });
    svg.appendChild(line);
    const lbl = svgNs('text', { x: padL - 4, y: y + 4, 'text-anchor': 'end' });
    lbl.textContent = Math.round(max * (1 - i/4));
    svg.appendChild(lbl);
  }

  buckets.forEach((b, i) => {
    const x = padL + i * barW + 4;
    const fullH = ((h - padT - padB) * (b.n / max));
    const riskH = ((h - padT - padB) * (b.high / max));
    const rectAll = svgNs('rect', {
      x, y: padT + (h - padT - padB) - fullH,
      width: barW - 8,
      height: fullH,
      rx: 1, ry: 1,
    });
    rectAll.setAttribute('fill', 'var(--ink-2)');
    svg.appendChild(rectAll);
    const titleA = svgNs('title');
    titleA.textContent = `${b.label}: ${b.n} joiners (${b.high} high-risk)`;
    rectAll.appendChild(titleA);

    if (riskH > 0) {
      const rectRisk = svgNs('rect', {
        x, y: padT + (h - padT - padB) - riskH,
        width: barW - 8,
        height: riskH,
        rx: 1, ry: 1,
      });
      rectRisk.setAttribute('fill', 'var(--risk-high)');
      svg.appendChild(rectRisk);
    }

    const lbl = svgNs('text', { x: x + (barW - 8)/2, y: h - padB + 16, 'text-anchor': 'middle', class: 'label-strong' });
    lbl.textContent = b.label;
    svg.appendChild(lbl);

    const cnt = svgNs('text', { x: x + (barW - 8)/2, y: h - padB + 30, 'text-anchor': 'middle' });
    cnt.setAttribute('font-size', '9.5');
    cnt.textContent = `n=${b.n}`;
    svg.appendChild(cnt);
  });

  // Legend
  const lg1 = svgNs('rect', { x: padL, y: 4, width: 10, height: 10 });
  lg1.setAttribute('fill', 'var(--ink-2)');
  svg.appendChild(lg1);
  const lg1t = svgNs('text', { x: padL + 14, y: 13 });
  lg1t.textContent = 'All';
  svg.appendChild(lg1t);
  const lg2 = svgNs('rect', { x: padL + 40, y: 4, width: 10, height: 10 });
  lg2.setAttribute('fill', 'var(--risk-high)');
  svg.appendChild(lg2);
  const lg2t = svgNs('text', { x: padL + 54, y: 13 });
  lg2t.textContent = 'High-risk subset';
  svg.appendChild(lg2t);

  mount.innerHTML = '';
  mount.appendChild(svg);
}

// ─────────────────────────────────────────────────────────────
// PEOPLE VIEW
// ─────────────────────────────────────────────────────────────
function populateFilters() {
  // Regions
  const regions = Array.from(new Set(state.people.map(p => p.region))).sort();
  regions.forEach(r => $('#f-region').appendChild(new Option(r, r)));

  // Departments
  const depts = Array.from(new Set(state.people.map(p => p.department))).sort();
  depts.forEach(d => $('#f-dept').appendChild(new Option(d, d)));

  // Levels
  const levels = Array.from(new Set(state.people.map(p => p.level))).sort();
  levels.forEach(l => $('#f-level').appendChild(new Option(l, l)));
}

function bindPeopleFilters() {
  ['f-region','f-dept','f-level','f-risk','f-review','f-sort'].forEach(id => {
    $('#' + id).addEventListener('change', applyFilters);
  });
  let searchTimer;
  $('#f-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 180);
  });
  $('#f-clear').addEventListener('click', () => {
    ['f-region','f-dept','f-level','f-risk','f-review'].forEach(id => $('#' + id).value = '');
    $('#f-sort').value = 'name';
    $('#f-search').value = '';
    applyFilters();
  });
}

function applyFilters() {
  const region = $('#f-region').value;
  const dept   = $('#f-dept').value;
  const level  = $('#f-level').value;
  const risk   = $('#f-risk').value;
  const review = $('#f-review').value;
  const sort   = $('#f-sort').value;
  const search = $('#f-search').value.trim().toLowerCase();

  let filt = state.people.filter(p => {
    if (region && p.region !== region) return false;
    if (dept && p.department !== dept) return false;
    if (level && p.level !== level) return false;
    if (risk && p.flight_risk_band !== risk) return false;
    if (review && p.last_review !== review) return false;
    if (search) {
      const hay = `${p.display_name} ${p.title} ${p.team} ${p.location} ${p.email}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const sortFns = {
    'name':         (a,b) => a.display_name.localeCompare(b.display_name),
    'tenure-desc':  (a,b) => b.tenure_years - a.tenure_years,
    'tenure-asc':   (a,b) => a.tenure_years - b.tenure_years,
    'comp-desc':    (a,b) => b.comp_total - a.comp_total,
    'comp-asc':     (a,b) => a.comp_total - b.comp_total,
    'risk-desc':    (a,b) => b.flight_risk - a.flight_risk,
  };
  filt.sort(sortFns[sort] || sortFns.name);

  state.filtered = filt;
  state.pageRendered = 0;
  $('#people-count-n').textContent = filt.length.toLocaleString();
  $('#people-count-total').textContent = state.people.length.toLocaleString();
  $('#people-list').innerHTML = '';
  renderMorePeople();
}

function renderMorePeople() {
  const list = $('#people-list');
  const frag = document.createDocumentFragment();
  const end = Math.min(state.pageRendered + state.pageSize, state.filtered.length);
  for (let i = state.pageRendered; i < end; i++) {
    frag.appendChild(buildPersonRow(state.filtered[i]));
  }
  list.appendChild(frag);
  state.pageRendered = end;

  // Load more button
  const lm = $('#load-more-wrap');
  lm.innerHTML = '';
  if (state.pageRendered < state.filtered.length) {
    const btn = el('button', {
      class: 'btn btn-ghost', type: 'button',
      on: { click: renderMorePeople },
    }, [`Load ${Math.min(state.pageSize, state.filtered.length - state.pageRendered)} more · ${state.filtered.length - state.pageRendered} remaining`]);
    lm.appendChild(btn);
  } else if (state.filtered.length === 0) {
    lm.innerHTML = `<div style="padding:1.5rem; color:var(--ink-mute); font-style:italic; text-align:center;">No employees match the current filters.</div>`;
  }
}

function buildPersonRow(p) {
  const row = el('div', {
    class: 'row', role: 'listitem', tabindex: '0',
    'data-id': p.id,
    on: {
      click: () => openDrawer(p.id),
      keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(p.id); } },
    },
  });
  const ratio = Math.max(0.4, Math.min(1.4, p.comp_ratio));
  // Bar fills 0 → 100% of width when comp_ratio = 1.0; show beyond at 1.4
  const fillPct = Math.min(100, ratio / 1.4 * 100);
  const tickPct = (1.0 / 1.4) * 100;

  row.innerHTML = `
    <div class="row-avatar" style="background:${DEPT_COLORS[p.department] || 'var(--ink-2)'};">${initialsOf(p.display_name)}</div>
    <div class="row-name">${escapeHtml(p.display_name)}</div>
    <div class="row-title">${escapeHtml(p.title)}</div>
    <div class="row-level">${escapeHtml(p.level)}</div>
    <div class="row-loc">${escapeHtml(p.location)}</div>
    <div class="row-comp">
      <div class="comp-bar" title="Comp ratio: ${(p.comp_ratio*100).toFixed(0)}% of band P50">
        <div class="comp-bar-fill" style="width:${fillPct}%; background:${p.comp_ratio < 0.85 ? 'var(--risk-high)' : (p.comp_ratio < 0.95 ? 'var(--ochre)' : 'var(--moss)')};"></div>
        <div class="comp-bar-tick" style="left:${tickPct}%;"></div>
      </div>
      <div class="comp-label">${fmt.moneyShort(p.comp_total)} · ${(p.comp_ratio*100).toFixed(0)}%</div>
    </div>
    <div class="row-risk" title="Flight risk: ${p.flight_risk.toFixed(2)} (${p.flight_risk_band})">
      <span class="risk-dot ${p.flight_risk_band}"></span>${p.flight_risk_band}
    </div>
    <div class="row-review ${p.last_review}">${p.last_review.replace(/_/g, ' ')}</div>
  `;
  return row;
}

// ─────────────────────────────────────────────────────────────
// DRAWER
// ─────────────────────────────────────────────────────────────
function openDrawer(empId) {
  const p = state.byId.get(empId);
  if (!p) return;
  state.drawerEmpId = empId;
  $('#drawer-id').textContent = p.id;
  $('#drawer-name').textContent = p.display_name;
  $('#drawer-role').textContent = `${p.title} · ${p.team} · ${p.location}`;

  const mgr = p.manager_id ? state.byId.get(p.manager_id) : null;
  const directs = state.people.filter(x => x.manager_id === p.id);

  $('#drawer-body').innerHTML = `
    <div class="drawer-grid">
      <div class="drawer-kv"><div class="lbl">Department</div><div class="v">${escapeHtml(p.department)}</div></div>
      <div class="drawer-kv"><div class="lbl">Team</div><div class="v">${escapeHtml(p.team)}</div></div>
      <div class="drawer-kv"><div class="lbl">Level</div><div class="v">${escapeHtml(p.level)}</div></div>
      <div class="drawer-kv"><div class="lbl">Employment</div><div class="v">${p.employment_type.replace(/_/g,' ')}</div></div>
      <div class="drawer-kv"><div class="lbl">Region · Country</div><div class="v">${p.region} · ${p.country}</div></div>
      <div class="drawer-kv"><div class="lbl">Hired</div><div class="v num">${fmt.date(p.hire_date)} · ${p.tenure_years.toFixed(1)} yrs</div></div>
      <div class="drawer-kv"><div class="lbl">Comp total</div><div class="v num">${fmt.money(p.comp_total)}</div></div>
      <div class="drawer-kv"><div class="lbl">Band P50</div><div class="v num">${fmt.money(p.comp_band_p50)} · ${(p.comp_ratio*100).toFixed(0)}%</div></div>
      <div class="drawer-kv"><div class="lbl">Last review</div><div class="v">${p.last_review.replace(/_/g,' ')} · score ${p.performance_score.toFixed(1)}</div></div>
      <div class="drawer-kv"><div class="lbl">Flight risk</div>
        <div class="v num"><span class="risk-dot ${p.flight_risk_band}" style="display:inline-block; vertical-align:middle; margin-right:4px;"></span>${p.flight_risk.toFixed(2)} · ${p.flight_risk_band}</div>
      </div>
      <div class="drawer-kv"><div class="lbl">Promotion eligible</div><div class="v">${p.promotion_eligible ? 'Yes' : 'No'}</div></div>
      <div class="drawer-kv"><div class="lbl">Last promotion</div><div class="v">${p.last_promotion ? fmt.date(p.last_promotion) : '—'}</div></div>
      ${p.is_manager ? `<div class="drawer-kv"><div class="lbl">Span of control</div><div class="v num">${p.span_of_control} direct reports</div></div>` : ''}
      <div class="drawer-kv"><div class="lbl">Email</div><div class="v" style="font-size:12px; word-break:break-all;">${escapeHtml(p.email)}</div></div>
    </div>

    <div class="drawer-sec-title">§ Org chart fragment</div>
    ${mgr ? `
      <div class="org-chart-node" data-id="${mgr.id}">
        <div class="row-avatar" style="background:${DEPT_COLORS[mgr.department]};">${initialsOf(mgr.display_name)}</div>
        <div>
          <div class="nm">${escapeHtml(mgr.display_name)} <span style="color:var(--ink-mute); font-size:11px;">· manager</span></div>
          <div class="tt">${escapeHtml(mgr.title)} · ${escapeHtml(mgr.location)}</div>
        </div>
      </div>
      <div class="org-chart-direct">
    ` : `<div>Top of tree · no manager</div><div class="org-chart-direct">`}
        <div class="org-chart-node self">
          <div class="row-avatar" style="background:${DEPT_COLORS[p.department]};">${initialsOf(p.display_name)}</div>
          <div>
            <div class="nm">${escapeHtml(p.display_name)} <span style="color:var(--ochre); font-size:11px;">· this person</span></div>
            <div class="tt">${escapeHtml(p.title)}</div>
          </div>
        </div>
        ${directs.length > 0 ? `
          <div class="org-chart-direct">
            ${directs.slice(0, 8).map(d => `
              <div class="org-chart-node" data-id="${d.id}">
                <div class="row-avatar" style="background:${DEPT_COLORS[d.department]};">${initialsOf(d.display_name)}</div>
                <div>
                  <div class="nm">${escapeHtml(d.display_name)}</div>
                  <div class="tt">${escapeHtml(d.title)} · ${escapeHtml(d.location)}</div>
                </div>
              </div>
            `).join('')}
            ${directs.length > 8 ? `<div style="font-family:var(--mono); font-size:11px; color:var(--ink-mute); padding:.4rem .8rem;">+ ${directs.length - 8} more reports</div>` : ''}
          </div>
        ` : ''}
      </div>
  `;

  // Wire org-chart-node clicks to navigate to another person
  $$('.org-chart-node[data-id]', $('#drawer-body')).forEach(n => {
    if (n.classList.contains('self')) return;
    n.addEventListener('click', () => openDrawer(n.dataset.id));
  });

  $('#drawer').classList.add('is-open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  $('#drawer-backdrop').classList.add('is-open');
  $('#drawer-close').focus();
}

function closeDrawer() {
  $('#drawer').classList.remove('is-open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $('#drawer-backdrop').classList.remove('is-open');
  state.drawerEmpId = null;
}

function bindDrawer() {
  $('#drawer-close').addEventListener('click', closeDrawer);
  $('#drawer-backdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.drawerEmpId) closeDrawer();
  });
  // Expose for inline onclick handlers from the answer-table rows
  window.__openDrawer = openDrawer;
}

// ─────────────────────────────────────────────────────────────
// INSIGHTS VIEW
// ─────────────────────────────────────────────────────────────
let insightsRendered = false;
function renderInsights() {
  if (insightsRendered) return;
  renderHeadcountChart();
  renderCompChart();
  renderTenureChart();
  renderFlightRiskHeatmap();
  insightsRendered = true;

  // Re-render on resize to recompute widths
  let rzt;
  window.addEventListener('resize', () => {
    clearTimeout(rzt);
    rzt = setTimeout(() => {
      renderHeadcountChart();
      renderCompChart();
      renderTenureChart();
      renderFlightRiskHeatmap();
    }, 220);
  });
}

function renderHeadcountChart() {
  const mount = $('#chart-hc');
  const m = new Map();
  state.people.forEach(p => m.set(p.department, (m.get(p.department) || 0) + 1));
  const rows = Array.from(m.entries())
    .map(([d, n]) => ({ label: d, value: n }))
    .sort((a,b) => b.value - a.value);
  renderHorizontalBars(mount, rows, { suffix: '', color: 'var(--ochre)' });
}

function renderCompChart() {
  const mount = $('#chart-comp');
  const levels = ['IC1','IC2','IC3','IC4','IC5','IC6','IC7','M1','M2','M3','M4'];
  const stats = levels.map(L => {
    const xs = state.people.filter(p => p.level === L).map(p => p.comp_total);
    if (!xs.length) return null;
    return {
      level: L,
      p10: percentile(xs, 0.1),
      p25: percentile(xs, 0.25),
      median: median(xs),
      p75: percentile(xs, 0.75),
      p90: percentile(xs, 0.9),
      n: xs.length,
    };
  }).filter(Boolean);

  const w = mount.clientWidth || 480;
  const h = 320;
  const padL = 60, padR = 14, padT = 18, padB = 38;
  const max = Math.max(...stats.map(s => s.p90));
  const colW = (w - padL - padR) / stats.length;

  const svg = svgNs('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' });

  // Gridlines
  for (let i = 0; i <= 4; i++) {
    const y = padT + (h - padT - padB) * (i/4);
    const line = svgNs('line', { x1: padL, x2: w - padR, y1: y, y2: y, class: 'gridline' });
    svg.appendChild(line);
    const lbl = svgNs('text', { x: padL - 4, y: y + 4, 'text-anchor': 'end' });
    lbl.textContent = fmt.moneyShort(max * (1 - i/4));
    svg.appendChild(lbl);
  }

  stats.forEach((s, i) => {
    const cx = padL + i * colW + colW/2;
    const scale = (v) => padT + (h - padT - padB) * (1 - v / max);

    // Whisker line (p10 → p90)
    const whisker = svgNs('line', {
      x1: cx, x2: cx, y1: scale(s.p10), y2: scale(s.p90),
    });
    whisker.setAttribute('stroke', 'var(--ink-mute)');
    whisker.setAttribute('stroke-width', '1');
    svg.appendChild(whisker);

    // IQR box (p25 → p75)
    const boxH = scale(s.p25) - scale(s.p75);
    const box = svgNs('rect', {
      x: cx - 11, y: scale(s.p75), width: 22, height: Math.max(boxH, 1),
      rx: 1, ry: 1,
    });
    box.setAttribute('fill', 'var(--ochre-soft)');
    box.setAttribute('stroke', 'var(--ochre-deep)');
    box.setAttribute('stroke-width', '1');
    const title = svgNs('title');
    title.textContent = `${s.level}: P25 ${fmt.moneyShort(s.p25)} · Median ${fmt.moneyShort(s.median)} · P75 ${fmt.moneyShort(s.p75)} · n=${s.n}`;
    box.appendChild(title);
    svg.appendChild(box);

    // Median line
    const medLine = svgNs('line', {
      x1: cx - 13, x2: cx + 13, y1: scale(s.median), y2: scale(s.median),
    });
    medLine.setAttribute('stroke', 'var(--ink)');
    medLine.setAttribute('stroke-width', '2');
    svg.appendChild(medLine);

    // Level label
    const lbl = svgNs('text', { x: cx, y: h - padB + 16, 'text-anchor': 'middle', class: 'label-strong' });
    lbl.textContent = s.level;
    svg.appendChild(lbl);

    const cnt = svgNs('text', { x: cx, y: h - padB + 28, 'text-anchor': 'middle' });
    cnt.setAttribute('font-size', '9');
    cnt.textContent = 'n=' + s.n;
    svg.appendChild(cnt);
  });

  mount.innerHTML = '';
  mount.appendChild(svg);
}

function renderTenureChart() {
  const mount = $('#chart-tenure');
  const buckets = [
    { label: '0-1', test: t => t < 1 },
    { label: '1-2', test: t => t >= 1 && t < 2 },
    { label: '2-3', test: t => t >= 2 && t < 3 },
    { label: '3-4', test: t => t >= 3 && t < 4 },
    { label: '4-5', test: t => t >= 4 && t < 5 },
    { label: '5+',  test: t => t >= 5 },
  ];
  const rows = buckets.map(b => ({
    label: b.label,
    value: state.people.filter(p => b.test(p.tenure_years)).length,
  }));

  const w = mount.clientWidth || 480;
  const h = 260;
  const padL = 36, padR = 14, padT = 20, padB = 36;
  const max = Math.max(...rows.map(r => r.value), 1);
  const barW = (w - padL - padR) / rows.length;

  const svg = svgNs('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' });

  for (let i = 0; i <= 4; i++) {
    const y = padT + (h - padT - padB) * (i/4);
    const line = svgNs('line', { x1: padL, x2: w - padR, y1: y, y2: y, class: 'gridline' });
    svg.appendChild(line);
    const lbl = svgNs('text', { x: padL - 4, y: y + 4, 'text-anchor': 'end' });
    lbl.textContent = Math.round(max * (1 - i/4));
    svg.appendChild(lbl);
  }

  rows.forEach((r, i) => {
    const x = padL + i * barW + 6;
    const fullH = (h - padT - padB) * (r.value / max);
    const rect = svgNs('rect', {
      x, y: padT + (h - padT - padB) - fullH,
      width: barW - 12,
      height: fullH,
      rx: 1, ry: 1,
    });
    rect.setAttribute('fill', i < 2 ? 'var(--ochre)' : 'var(--moss)');
    const title = svgNs('title');
    title.textContent = `${r.label} yrs: ${r.value} employees`;
    rect.appendChild(title);
    svg.appendChild(rect);

    const lbl = svgNs('text', { x: x + (barW - 12)/2, y: h - padB + 14, 'text-anchor': 'middle', class: 'label-strong' });
    lbl.textContent = r.label + ' yrs';
    svg.appendChild(lbl);

    const cnt = svgNs('text', { x: x + (barW - 12)/2, y: padT + (h - padT - padB) - fullH - 4, 'text-anchor': 'middle' });
    cnt.setAttribute('font-size', '10');
    cnt.setAttribute('fill', 'var(--ink-2)');
    cnt.textContent = r.value;
    svg.appendChild(cnt);
  });

  mount.innerHTML = '';
  mount.appendChild(svg);
}

function renderFlightRiskHeatmap() {
  const mount = $('#chart-risk');
  const depts = ['Engineering','Sales','Operations','Customer Success','Product','Marketing','Design','Finance','IT/Security','People','Legal'];
  const regions = ['NA','EMEA','APAC','LATAM'];

  // Build matrix: cell = % high-risk
  const data = depts.map(d => ({
    dept: d,
    cells: regions.map(r => {
      const cohort = state.people.filter(p => p.department === d && p.region === r);
      const high = cohort.filter(p => p.flight_risk_band === 'high').length;
      return {
        region: r,
        n: cohort.length,
        high,
        rate: cohort.length ? high / cohort.length : 0,
      };
    }),
  }));

  const w = mount.clientWidth || 480;
  const h = 280;
  const padL = 110, padR = 12, padT = 24, padB = 18;
  const cellW = (w - padL - padR) / regions.length;
  const cellH = (h - padT - padB) / depts.length;
  const maxRate = Math.max(...data.flatMap(d => d.cells.map(c => c.rate)), 0.01);

  const svg = svgNs('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' });

  // Column headers
  regions.forEach((r, i) => {
    const x = padL + i * cellW + cellW/2;
    const lbl = svgNs('text', { x, y: padT - 8, 'text-anchor': 'middle', class: 'label-strong' });
    lbl.textContent = r;
    svg.appendChild(lbl);
  });

  // Rows
  data.forEach((row, i) => {
    const y = padT + i * cellH;
    const rowLbl = svgNs('text', { x: padL - 6, y: y + cellH/2 + 4, 'text-anchor': 'end' });
    rowLbl.textContent = row.dept.replace('Customer Success','CS').replace('IT/Security','IT/Sec');
    svg.appendChild(rowLbl);

    row.cells.forEach((c, j) => {
      const x = padL + j * cellW;
      const t = maxRate ? Math.min(1, c.rate / maxRate) : 0;
      // Color blend: ochre-soft → risk-high
      const r = Math.round(244 - (244 - 185) * t);
      const g = Math.round(236 - (236 - 74) * t);
      const b = Math.round(218 - (218 - 61) * t);
      const color = `rgb(${r},${g},${b})`;
      const rect = svgNs('rect', {
        x: x + 2, y: y + 2,
        width: cellW - 4, height: cellH - 4,
        rx: 1, ry: 1,
      });
      rect.setAttribute('class', 'heat-cell');
      rect.setAttribute('fill', color);
      const title = svgNs('title');
      title.textContent = `${row.dept} · ${c.region}: ${(c.rate*100).toFixed(0)}% high-risk (n=${c.n})`;
      rect.appendChild(title);
      svg.appendChild(rect);

      if (c.n > 0) {
        const lbl = svgNs('text', { x: x + cellW/2, y: y + cellH/2 + 4, 'text-anchor': 'middle' });
        lbl.setAttribute('fill', t > 0.5 ? 'var(--paper)' : 'var(--ink)');
        lbl.setAttribute('font-weight', '700');
        lbl.setAttribute('font-size', '11');
        lbl.textContent = (c.rate * 100).toFixed(0) + '%';
        svg.appendChild(lbl);
      } else {
        const lbl = svgNs('text', { x: x + cellW/2, y: y + cellH/2 + 4, 'text-anchor': 'middle' });
        lbl.setAttribute('fill', 'var(--ink-faint)');
        lbl.setAttribute('font-size', '11');
        lbl.textContent = '—';
        svg.appendChild(lbl);
      }
    });
  });

  mount.innerHTML = '';
  mount.appendChild(svg);
}

// ═════════════════════════════════════════════════════════════
// ░░░░░░░░░░░░░░░░░░░░░  HIRING VIEW  ░░░░░░░░░░░░░░░░░░░░░░░░
// ═════════════════════════════════════════════════════════════
// Three sub-views switchable via the inline pills above:
//   pipeline     — funnel + stuck panel + 7-day movement ticker
//   requisitions — filterable list of all reqs, drawer on click
//   sources      — source mix bars + top referrers + conv table
// All values computed live from state.requisitions + state.candidates.
// ═════════════════════════════════════════════════════════════

function bindHiring() {
  // Sub-view pills
  $$('.hiring-pill').forEach(p => {
    p.addEventListener('click', () => switchHiringSub(p.dataset.sub));
  });

  // Requisition filters
  ['rq-dept','rq-status','rq-sla','rq-region','rq-priority','rq-level'].forEach(id => {
    const el = $('#' + id);
    if (el) el.addEventListener('change', applyReqFilters);
  });
  let searchTimer;
  $('#rq-search')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyReqFilters, 180);
  });
  $('#rq-clear')?.addEventListener('click', () => {
    ['rq-dept','rq-status','rq-sla','rq-region','rq-priority','rq-level'].forEach(id => {
      const el = $('#' + id); if (el) el.value = '';
    });
    $('#rq-search').value = '';
    applyReqFilters();
  });

  // Req drawer close
  $('#req-drawer-close')?.addEventListener('click', closeReqDrawer);
  $('#req-drawer-backdrop')?.addEventListener('click', closeReqDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#req-drawer')?.classList.contains('is-open')) closeReqDrawer();
  });
}

function switchHiringSub(name) {
  state.hiringSub = name;
  $$('.hiring-pill').forEach(p => p.setAttribute('aria-selected', p.dataset.sub === name ? 'true' : 'false'));
  $$('.hiring-sub').forEach(s => {
    const match = s.id === 'sub-' + name;
    s.classList.toggle('is-active', match);
    s.hidden = !match;
  });
  renderHiring();
}

function renderHiring() {
  if (!state.requisitions.length) {
    // Soft empty state
    $('#hiring-funnel-mount').innerHTML = '<div style="padding:1rem;color:var(--ink-mute);font-style:italic;font-family:var(--serif);">ATS data not loaded.</div>';
    return;
  }
  // Always populate filters once
  if (!$('#rq-dept').options.length || $('#rq-dept').options.length < 2) {
    populateReqFilters();
  }

  const sub = state.hiringSub;
  if (sub === 'pipeline')     renderHiringPipeline();
  if (sub === 'requisitions') renderHiringRequisitions();
  if (sub === 'sources')      renderHiringSources();
}

function populateReqFilters() {
  const reqs = state.requisitions;
  const depts = Array.from(new Set(reqs.map(r => r.department))).sort();
  const regs  = Array.from(new Set(reqs.map(r => r.region))).sort();
  const lvls  = Array.from(new Set(reqs.map(r => r.level))).sort();
  // clear existing (just the "All" placeholder remains)
  ['rq-dept','rq-region','rq-level'].forEach(id => {
    const el = $('#' + id);
    while (el.options.length > 1) el.remove(1);
  });
  depts.forEach(d => $('#rq-dept').appendChild(new Option(d, d)));
  regs.forEach(r => $('#rq-region').appendChild(new Option(r, r)));
  lvls.forEach(l => $('#rq-level').appendChild(new Option(l, l)));
}

// ── Pipeline sub-view ─────────────────────────────────────────
function renderHiringPipeline() {
  // Funnel: aggregate stage_counts across open requisitions
  const openReqs = state.requisitions.filter(r => r.status === 'open');
  const totals = { applied: 0, screen: 0, interview: 0, offer: 0, accepted: 0 };
  // We compute from the candidates dataset for accuracy of pipeline state
  state.candidates.forEach(c => {
    const req = state.byReqId.get(c.requisition_id);
    if (!req || req.status !== 'open') return;
    if (totals[c.stage] != null) totals[c.stage] += 1;
  });
  // Total applied should include reach-through (everyone who ever applied)
  // — i.e. people in any non-withdrew stage AND the rejected pool.
  // Simpler: applied = sum of all stages reached at "applied" level
  // by walking candidates: every candidate touched 'applied'.
  let totalApplied = 0;
  state.candidates.forEach(c => {
    const req = state.byReqId.get(c.requisition_id);
    if (!req || req.status !== 'open') return;
    totalApplied += 1;  // every candidate started here
  });
  // Reach-through counts (everyone who reached or passed this stage):
  const reach = {
    applied: totalApplied,
    screen: 0, interview: 0, offer: 0, accepted: 0,
  };
  state.candidates.forEach(c => {
    const req = state.byReqId.get(c.requisition_id);
    if (!req || req.status !== 'open') return;
    const order = ['applied','screen','interview','offer','accepted'];
    const idx = order.indexOf(c.stage);
    if (idx < 0) return;  // rejected / withdrew
    // Count this candidate as reaching every stage up to and including their current
    for (let i = 1; i <= idx; i++) {
      reach[order[i]] += 1;
    }
  });

  const stages = [
    { key: 'applied',   label: 'Applied' },
    { key: 'screen',    label: 'Screened' },
    { key: 'interview', label: 'Interviewed' },
    { key: 'offer',     label: 'Offered' },
    { key: 'accepted',  label: 'Accepted' },
  ];
  const maxN = Math.max(reach.applied, 1);

  const mount = $('#hiring-funnel-mount');
  let html = '';
  stages.forEach((s, i) => {
    const n = reach[s.key];
    const pct = n / maxN * 100;
    html += `
      <div class="funnel-row">
        <div class="funnel-label">${s.label}</div>
        <div class="funnel-bar"><div class="funnel-bar-fill s-${s.key}" style="width:${pct.toFixed(1)}%"></div></div>
        <div class="funnel-count">${n.toLocaleString()}</div>
      </div>
    `;
    if (i < stages.length - 1) {
      const next = reach[stages[i+1].key];
      const conv = n > 0 ? (next / n * 100) : 0;
      html += `<div class="funnel-conv">↓ ${conv.toFixed(1)}% · ${(n - next).toLocaleString()} drop</div>`;
    }
  });
  mount.innerHTML = html;

  // Stuck panel
  const stuck = state.requisitions
    .filter(r => r.sla_status === 'stuck' || r.sla_status === 'aging')
    .sort((a, b) => (b.days_open - a.days_open))
    .slice(0, 8);
  const stuckMount = $('#hiring-stuck-mount');
  stuckMount.innerHTML = stuck.length === 0
    ? '<div style="padding:.6rem 0;color:var(--ink-mute);font-style:italic;font-family:var(--serif);">No stuck or aging requisitions.</div>'
    : stuck.map(r => `
        <div class="stuck-row" data-req="${r.id}">
          <div>
            <div class="stuck-title">${escapeHtml(r.title)}</div>
            <div class="stuck-sub">${escapeHtml(r.department)} · ${escapeHtml(r.location)} · ${r.days_open}d open · <span class="req-chip ${r.sla_status}">${r.sla_status.replace('_',' ')}</span></div>
            ${renderMiniStageBar(r.stage_counts)}
          </div>
          <div class="stuck-days">${r.days_open}d</div>
        </div>
      `).join('');
  stuckMount.querySelectorAll('.stuck-row').forEach(row => {
    row.addEventListener('click', () => openReqDrawer(row.dataset.req));
  });

  // Movement ticker
  const movement = (state.atsMeta && state.atsMeta.movement_recent) || [];
  const movMount = $('#hiring-movement-mount');
  movMount.innerHTML = movement.length === 0
    ? '<div style="padding:.6rem 0;color:var(--ink-mute);font-style:italic;font-family:var(--serif);">No movement in the last 7 days.</div>'
    : `<div class="movement-ticker">
        ${movement.slice(0, 20).map(m => `
          <div class="movement-row">
            <span class="stage-tag ${m.stage}">→ ${escapeHtml(m.stage)}</span>
            <span class="who">${escapeHtml(m.display_name)}</span>
            · ${escapeHtml(m.requisition_title)}
            <span class="when">${m.days_ago}d ago</span>
          </div>
        `).join('')}
      </div>`;
}

// Helper: tiny 5-segment bar reflecting stage counts.
function renderMiniStageBar(stage_counts) {
  if (!stage_counts) return '';
  const stages = ['applied','screen','interview','offer','accepted'];
  return `<div class="stuck-mini">${stages.map(s => {
    const n = stage_counts[s] || 0;
    let cls = '';
    if (n > 0) cls = 'has';
    if (s === 'offer' && n > 0) cls = 'has-strong';
    if (s === 'accepted' && n > 0) cls = 'has-accept';
    return `<span class="${cls}" title="${s}: ${n}"></span>`;
  }).join('')}</div>`;
}

// ── Requisitions sub-view ────────────────────────────────────
function applyReqFilters() {
  const dept = $('#rq-dept')?.value || '';
  const status = $('#rq-status')?.value || '';
  const sla = $('#rq-sla')?.value || '';
  const region = $('#rq-region')?.value || '';
  const priority = $('#rq-priority')?.value || '';
  const level = $('#rq-level')?.value || '';
  const search = ($('#rq-search')?.value || '').trim().toLowerCase();

  state.reqFiltered = state.requisitions.filter(r => {
    if (dept && r.department !== dept) return false;
    if (status && r.status !== status) return false;
    if (sla && r.sla_status !== sla) return false;
    if (region && r.region !== region) return false;
    if (priority && r.priority !== priority) return false;
    if (level && r.level !== level) return false;
    if (search) {
      const hay = `${r.title} ${r.team} ${r.location} ${r.id}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
  state.reqPageRendered = 0;
  $('#rq-count-n').textContent = state.reqFiltered.length.toLocaleString();
  $('#rq-count-total').textContent = state.requisitions.length.toLocaleString();
  $('#req-list').innerHTML = '';
  renderMoreReqs();
}

function renderHiringRequisitions() {
  if (!state.reqFiltered.length) {
    applyReqFilters();
  } else {
    $('#rq-count-n').textContent = state.reqFiltered.length.toLocaleString();
    $('#rq-count-total').textContent = state.requisitions.length.toLocaleString();
  }
}

function renderMoreReqs() {
  const list = $('#req-list');
  const frag = document.createDocumentFragment();
  const end = Math.min(state.reqPageRendered + state.reqPageSize, state.reqFiltered.length);
  for (let i = state.reqPageRendered; i < end; i++) {
    frag.appendChild(buildReqRow(state.reqFiltered[i]));
  }
  list.appendChild(frag);
  state.reqPageRendered = end;

  // Note: rendering the full list at once is OK for 140 — but if filtered set ends here:
  if (state.reqFiltered.length === 0) {
    list.innerHTML = `<div style="padding:1.5rem; color:var(--ink-mute); font-style:italic; text-align:center;">No requisitions match the current filters.</div>`;
  }
}

function buildReqRow(r) {
  const row = el('div', {
    class: 'req-row', role: 'listitem', tabindex: '0',
    'data-id': r.id,
    on: {
      click: () => openReqDrawer(r.id),
      keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openReqDrawer(r.id); } },
    },
  });
  const sc = r.stage_counts || {};
  row.innerHTML = `
    <div class="req-id">${escapeHtml(r.id)}</div>
    <div class="req-title-wrap">
      <div class="req-title">${escapeHtml(r.title)}</div>
      <div class="req-sub">${escapeHtml(r.department)} · ${escapeHtml(r.team)} · ${escapeHtml(r.location)} · ${escapeHtml(r.remote.replace('_',' '))}</div>
    </div>
    <div class="req-cell">${escapeHtml(r.level)}</div>
    <div class="req-cell num">${r.days_open}d</div>
    <div class="req-cell"><span class="req-chip ${r.sla_status}">${r.sla_status.replace('_',' ')}</span></div>
    <div class="req-cell"><span class="req-chip priority-${r.priority}">${r.priority}</span> <span class="req-chip status-${r.status}">${r.status.replace('_',' ')}</span></div>
    <div class="req-cell">
      ${renderMiniStageBar(sc).replace('stuck-mini','req-stage-bar')}
      <div style="font-family:var(--mono); font-size:9.5px; color:var(--ink-mute); margin-top:3px; letter-spacing:.04em;">
        A ${sc.applied||0} · S ${sc.screen||0} · I ${sc.interview||0} · O ${sc.offer||0} · ✓ ${sc.accepted||0}
      </div>
    </div>
  `;
  return row;
}

function openReqDrawer(reqId) {
  const r = state.byReqId.get(reqId);
  if (!r) return;
  const hm = state.byId.get(r.hiring_manager_id);
  const rec = state.byId.get(r.recruiter_id);
  const cands = state.candidates.filter(c => c.requisition_id === reqId);
  const byStage = {};
  ['applied','screen','interview','offer','accepted','rejected','withdrew'].forEach(s => byStage[s] = []);
  cands.forEach(c => { if (byStage[c.stage]) byStage[c.stage].push(c); });

  $('#req-drawer-id').textContent = r.id;
  $('#req-drawer-name').textContent = r.title;
  $('#req-drawer-role').textContent = `${r.department} · ${r.team} · ${r.location} · ${r.level}`;

  $('#req-drawer-body').innerHTML = `
    <div class="drawer-grid">
      <div class="drawer-kv"><div class="lbl">Status</div><div class="v"><span class="req-chip status-${r.status}">${r.status.replace('_',' ')}</span></div></div>
      <div class="drawer-kv"><div class="lbl">Pipeline health</div><div class="v"><span class="req-chip ${r.sla_status}">${r.sla_status.replace('_',' ')}</span></div></div>
      <div class="drawer-kv"><div class="lbl">Priority</div><div class="v"><span class="req-chip priority-${r.priority}">${r.priority}</span></div></div>
      <div class="drawer-kv"><div class="lbl">Days open</div><div class="v num">${r.days_open} days</div></div>
      <div class="drawer-kv"><div class="lbl">Opened</div><div class="v num">${fmt.date(r.opened_date)}</div></div>
      <div class="drawer-kv"><div class="lbl">Target close</div><div class="v num">${fmt.date(r.target_close_date)}</div></div>
      <div class="drawer-kv"><div class="lbl">Region · Country</div><div class="v">${r.region}</div></div>
      <div class="drawer-kv"><div class="lbl">Remote</div><div class="v">${r.remote.replace('_',' ')}</div></div>
      <div class="drawer-kv"><div class="lbl">Comp band P50</div><div class="v num">${fmt.money(r.comp_band_p50)}</div></div>
      <div class="drawer-kv"><div class="lbl">Hiring manager</div><div class="v">${hm ? escapeHtml(hm.display_name) + ' · ' + escapeHtml(hm.title) : '—'}</div></div>
      <div class="drawer-kv"><div class="lbl">Recruiter</div><div class="v">${rec ? escapeHtml(rec.display_name) : '—'}</div></div>
      <div class="drawer-kv"><div class="lbl">Bar raisers</div><div class="v">${r.bar_raisers_required ? 'Required' : 'Optional'}</div></div>
    </div>

    <div class="drawer-sec-title">§ Candidates by stage · ${cands.length} total</div>
    ${['offer','interview','screen','applied','accepted','rejected','withdrew'].map(stage => {
      const list = byStage[stage];
      if (!list.length) return '';
      return `
        <div style="margin:.8rem 0 .4rem;">
          <div class="ch-title" style="margin-bottom:.4rem;">${stage} · ${list.length}</div>
          ${list.slice(0, 6).map(c => `
            <div style="display:flex; gap:8px; padding:.35rem 0; border-bottom:1px dashed var(--paper-rule); font-family:var(--mono); font-size:11.5px;">
              <span style="flex:1; color:var(--ink);">${escapeHtml(c.display_name)} <span style="color:var(--ink-mute);">· ${escapeHtml(c.source)}</span></span>
              <span style="color:var(--ink-mute);">${c.days_in_stage}d in stage</span>
              ${c.predicted_offer_acceptance_probability && (stage === 'offer' || stage === 'accepted') ? `<span style="color:var(--ochre-deep); font-weight:700;">p=${c.predicted_offer_acceptance_probability.toFixed(2)}</span>` : ''}
            </div>
          `).join('')}
          ${list.length > 6 ? `<div style="font-family:var(--mono); font-size:10.5px; color:var(--ink-mute); padding:.3rem 0;">+ ${list.length - 6} more</div>` : ''}
        </div>
      `;
    }).join('')}
  `;

  $('#req-drawer').classList.add('is-open');
  $('#req-drawer').setAttribute('aria-hidden', 'false');
  $('#req-drawer-backdrop').classList.add('is-open');
  $('#req-drawer-close').focus();
}

function closeReqDrawer() {
  $('#req-drawer')?.classList.remove('is-open');
  $('#req-drawer')?.setAttribute('aria-hidden', 'true');
  $('#req-drawer-backdrop')?.classList.remove('is-open');
}

// ── Sources sub-view ─────────────────────────────────────────
function renderHiringSources() {
  const sources = ['referral','inbound','outbound','agency','event'];

  // Grouped bars: counts of candidates by stage by source
  const groups = sources.map(src => {
    const list = state.candidates.filter(c => c.source === src);
    const counts = {
      applied:    list.length,
      screened:   list.filter(c => ['screen','interview','offer','accepted'].includes(c.stage)).length,
      interviewed:list.filter(c => ['interview','offer','accepted'].includes(c.stage)).length,
      offered:    list.filter(c => ['offer','accepted'].includes(c.stage)).length,
      accepted:   list.filter(c => c.stage === 'accepted').length,
    };
    const acceptedPct = counts.applied > 0 ? (counts.accepted / counts.applied * 100) : 0;
    return {
      group: src.charAt(0).toUpperCase() + src.slice(1),
      annotation: acceptedPct.toFixed(1) + '%',
      bars: [
        { label: 'Appl', value: counts.applied,     color: 'var(--ink-3)' },
        { label: 'Scr',  value: counts.screened,    color: 'var(--ink-2)' },
        { label: 'Int',  value: counts.interviewed, color: 'var(--ochre)' },
        { label: 'Off',  value: counts.offered,     color: 'var(--ochre-deep)' },
        { label: 'Acc',  value: counts.accepted,    color: 'var(--moss)' },
      ],
    };
  });
  renderGroupedBars($('#sources-bars-mount'), groups);

  // Top referrers
  const refMap = new Map();
  state.candidates.forEach(c => {
    if (!c.referrer_id) return;
    if (!refMap.has(c.referrer_id)) refMap.set(c.referrer_id, { id: c.referrer_id, total: 0, offered: 0, accepted: 0 });
    const r = refMap.get(c.referrer_id);
    r.total += 1;
    if (['offer','accepted'].includes(c.stage)) r.offered += 1;
    if (c.stage === 'accepted') r.accepted += 1;
  });
  const topRefs = Array.from(refMap.values())
    .sort((a,b) => b.accepted - a.accepted || b.offered - a.offered || b.total - a.total)
    .slice(0, 10);

  const refMount = $('#sources-referrers-mount');
  refMount.innerHTML = topRefs.length === 0
    ? '<div style="padding:.6rem 0;color:var(--ink-mute);font-style:italic;font-family:var(--serif);">No referrals yet.</div>'
    : topRefs.map(r => {
        const p = state.byId.get(r.id);
        const conv = r.total > 0 ? (r.accepted / r.total * 100).toFixed(1) : '0.0';
        return `
          <div class="referrer-row">
            <div class="row-avatar" style="background:${DEPT_COLORS[p?.department] || 'var(--ink-2)'};">${initialsOf(p?.display_name || '??')}</div>
            <div>
              <div class="nm">${escapeHtml(p?.display_name || r.id)}</div>
              <div class="sub">${escapeHtml(p?.department || '—')} · ${escapeHtml(p?.location || '—')}</div>
            </div>
            <div class="num" title="Accepted referrals">${r.accepted}<div class="sub" style="text-align:right;">acc</div></div>
            <div class="num" title="Total / conversion">${r.total}<div class="sub" style="text-align:right;">${conv}%</div></div>
          </div>
        `;
      }).join('');

  // Conversion table
  const rows = sources.map(src => {
    const list = state.candidates.filter(c => c.source === src);
    const n = list.length;
    const screened = list.filter(c => ['screen','interview','offer','accepted'].includes(c.stage)).length;
    const interviewed = list.filter(c => ['interview','offer','accepted'].includes(c.stage)).length;
    const offered = list.filter(c => ['offer','accepted'].includes(c.stage)).length;
    const accepted = list.filter(c => c.stage === 'accepted').length;
    const pct = (a, b) => b > 0 ? (a / b * 100).toFixed(1) + '%' : '—';
    return { src, n, screened, interviewed, offered, accepted, pct };
  });
  $('#sources-conversion-mount').innerHTML = `
    <table class="source-conv-table">
      <thead><tr>
        <th>Source</th><th class="num">N</th>
        <th class="num">Scr%</th><th class="num">Int%</th><th class="num">Offer%</th><th class="num">Acc%</th>
        <th class="num">App→Acc</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td><strong>${escapeHtml(r.src)}</strong></td>
            <td class="num">${r.n.toLocaleString()}</td>
            <td class="num">${r.pct(r.screened, r.n)}</td>
            <td class="num">${r.pct(r.interviewed, r.screened)}</td>
            <td class="num">${r.pct(r.offered, r.interviewed)}</td>
            <td class="num">${r.pct(r.accepted, r.offered)}</td>
            <td class="num" style="color:${r.accepted / Math.max(r.n,1) > 0.10 ? 'var(--moss-deep)' : 'var(--ochre-deep)'};">${r.pct(r.accepted, r.n)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ─────────────────────────────────────────────────────────────
// COMMAND PALETTE
// ─────────────────────────────────────────────────────────────
function openPalette() {
  const back = $('#palette-backdrop');
  back.classList.add('is-open');
  back.setAttribute('aria-hidden', 'false');
  $('#palette-input').value = '';
  renderPaletteHints('');
  setTimeout(() => $('#palette-input').focus(), 30);
}
function closePalette() {
  const back = $('#palette-backdrop');
  back.classList.remove('is-open');
  back.setAttribute('aria-hidden', 'true');
}
function renderPaletteHints(query) {
  const hints = $('#palette-hints');
  const q = query.toLowerCase();
  const matches = EXAMPLE_QUESTIONS.filter(qq => !q || qq.toLowerCase().includes(q)).slice(0, 6);
  hints.innerHTML = '';
  matches.forEach(qq => {
    const item = el('div', { class: 'palette-hint', on: { click: () => {
      closePalette();
      switchView('ask');
      submitQuestion(qq);
    }}});
    item.textContent = qq;
    hints.appendChild(item);
  });
}
function bindPalette() {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
    }
    if (e.key === 'Escape') {
      const back = $('#palette-backdrop');
      if (back.classList.contains('is-open')) closePalette();
    }
  });
  $('#palette-backdrop').addEventListener('click', (e) => {
    if (e.target === $('#palette-backdrop')) closePalette();
  });
  $('#palette-input').addEventListener('input', (e) => renderPaletteHints(e.target.value));
  $('#palette-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = e.target.value.trim();
      if (v) {
        closePalette();
        switchView('ask');
        submitQuestion(v);
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────
async function boot() {
  await loadData();
  bindTabs();
  bindAskView();
  populateFilters();
  bindPeopleFilters();
  bindDrawer();
  bindPalette();
  bindSettings();
  bindCsvUpload();
  bindHiring();
  restoreSavedFromStorage();
  refreshDemoBanner();
  bumpTopbarCost(0, true);

  // Pre-fill the People list count
  $('#people-count-total').textContent = state.people.length.toLocaleString();
  $('#people-count-n').textContent = state.people.length.toLocaleString();

  // Tool dispatcher self-test (gated by ?test=tools)
  maybeRunToolSelfTest();

  // First-run: prompt for API key (non-blocking — demo mode still works).
  // Suppress the auto-open when the visitor has asked for the demo gallery
  // explicitly via ?demo=1 / #demo — they don't want a modal in their face.
  const wantsDemo = /[?&]demo=1/.test(location.search) || location.hash === '#demo';
  if (!LLM.settings.apiKey && !sessionStorage.getItem('stratum_skipped_onboarding') && !wantsDemo) {
    setTimeout(() => openOnboarding(), 600);
  }
}

boot();

// ═════════════════════════════════════════════════════════════
// ░░░░░░░░░░░░░░░░░░░░  LLM CLIENT — REAL CLAUDE  ░░░░░░░░░░░░
// ═════════════════════════════════════════════════════════════
// Direct browser → api.anthropic.com calls with the
// `anthropic-dangerous-direct-browser-access: true` header.
// Streaming, tool use, prompt caching, extended thinking.
// ═════════════════════════════════════════════════════════════

const LLM = {
  API_URL: 'https://api.anthropic.com/v1/messages',
  VERSION: '2023-06-01',

  MODELS: {
    'claude-sonnet-4-6':           { label: 'Sonnet 4.6 · balanced',  inputPerM: 3,  outputPerM: 15, thinking: true },
    'claude-opus-4-7':             { label: 'Opus 4.7 · deepest',     inputPerM: 15, outputPerM: 75, thinking: true },
    'claude-haiku-4-5-20251001':   { label: 'Haiku 4.5 · fastest',    inputPerM: 1,  outputPerM: 5,  thinking: false },
  },

  // Session state
  session: {
    cost: 0,                 // accumulated $ this session
    inFlight: false,
    history: [],             // [{question, ts}]
    streamAbort: null,       // current AbortController
  },

  // ── Settings (persisted) ──
  settings: {
    get model()    { return localStorage.getItem('stratum_model')    || 'claude-sonnet-4-6'; },
    set model(v)   { localStorage.setItem('stratum_model', v); },
    get effort()   { return localStorage.getItem('stratum_effort')   || 'standard'; },
    set effort(v)  { localStorage.setItem('stratum_effort', v); },
    get apiKey()   { return localStorage.getItem('anthropic_api_key') || ''; },
    set apiKey(v)  { if (v) localStorage.setItem('anthropic_api_key', v); else localStorage.removeItem('anthropic_api_key'); },
    get dataSource() { return localStorage.getItem('stratum_data_source') || 'demo'; },
    set dataSource(v) { localStorage.setItem('stratum_data_source', v); },
    get thinkingBudget() {
      const e = this.effort;
      if (e === 'quick')    return 0;
      if (e === 'deep')     return 8000;
      return 2000;
    },
  },

  // ─────────────────────────────────────────────────────────
  // PRICING
  // ─────────────────────────────────────────────────────────
  computeCost(model, usage) {
    const m = LLM.MODELS[model] || LLM.MODELS['claude-sonnet-4-6'];
    const inp        = (usage.input_tokens || 0)               * m.inputPerM  / 1e6;
    const cacheW     = (usage.cache_creation_input_tokens || 0)* m.inputPerM * 1.25 / 1e6;
    const cacheR     = (usage.cache_read_input_tokens || 0)    * m.inputPerM * 0.1  / 1e6;
    const out        = (usage.output_tokens || 0)              * m.outputPerM / 1e6;
    return inp + cacheW + cacheR + out;
  },

  // ─────────────────────────────────────────────────────────
  // SYSTEM PROMPT
  // ─────────────────────────────────────────────────────────
  buildSystem() {
    const N = state.people.length;
    const asOf = (state.orgs && state.orgs.company && state.orgs.company.as_of) || '2026-05-13';
    return [
      {
        type: 'text',
        text:
`You are the Stratum Console — an AI-native human capital management copilot for Chief People Officers. You answer questions about a company's people data by calling tools. Never invent data; if a tool returns nothing or insufficient cell sizes, say so and offer to widen the cohort.

Style:
- Be precise. Lead with the headline number.
- Show your method. Mention what you filtered, what you grouped by, what controls you applied.
- Cite confidence honestly. Flag small cohorts (n < 30) explicitly.
- For pay-equity questions: control for level AND location before computing gaps; mention that you did so.
- Never display gender, salary, or performance for an individual employee in your text output. Aggregates only.
- Render exactly one chart per answer if it adds clarity; sometimes the answer is a number and a table.
- End every answer by calling the \`cite\` tool with the methodology.

Available fields on each employee row: id, display_name, given_name, family_name, title, level (IC1–IC7, M1–M4), department, team, location, country, region (NA, EMEA, APAC, LATAM), manager_id, hire_date, tenure_years, comp_total, comp_band_p50, comp_ratio, last_review (exceeds|meets|partially_meets|does_not_meet), performance_score (1–5), flight_risk (0–1), flight_risk_band (low|moderate|high), is_manager, span_of_control, employment_type, promotion_eligible, last_promotion, gender (woman|man|nonbinary — aggregate only).

You have access to a dataset of ${N} employees (as of ${asOf}).

The Console also has an ATS dataset attached:
  · ${state.requisitions.length} requisitions (Greenhouse-style records)
  · ${state.candidates.length} candidates across the hiring pipeline
  · stages: applied → screen → interview → offer → accepted / rejected / withdrew
  · sources: referral, inbound, outbound, agency, event

Requisition fields: id, title, department, team, level, location, region, remote, hiring_manager_id, recruiter_id, comp_band_p50, status (open|on_hold|filled|closed), opened_date, target_close_date, days_open, priority (critical|high|standard), stage_counts {applied, screen, interview, offer, accepted}, bar_raisers_required, sla_status (in_pace|aging|stuck).

Candidate fields: id, display_name, current_title, current_company, total_experience_years, highest_level_indicated, location_preference, country, source, source_detail, requisition_id, stage, stage_entered, days_in_stage, rejected_reason, scorecards, diversity_self_id (aggregate only), expected_comp, offered_comp, is_internal, is_referral, referrer_id, flight_risk_at_current_employer, predicted_offer_acceptance_probability.

ATS tools: \`query_requisitions\`, \`query_candidates\`, \`aggregate_pipeline\`.

Use tools — do not assume.`,
        cache_control: { type: 'ephemeral' },
      }
    ];
  },

  // ─────────────────────────────────────────────────────────
  // TOOLS  (definitions sent to Claude)
  // ─────────────────────────────────────────────────────────
  buildTools() {
    const filtersSchema = {
      type: 'object',
      properties: {
        department:        { type: 'string' },
        department_in:     { type: 'array', items: { type: 'string' } },
        region:            { type: 'string', enum: ['NA','EMEA','APAC','LATAM'] },
        region_in:         { type: 'array', items: { type: 'string' } },
        country:           { type: 'string' },
        location:          { type: 'string' },
        team:              { type: 'string' },
        level:             { type: 'string' },
        level_in:          { type: 'array', items: { type: 'string' } },
        employment_type:   { type: 'string' },
        flight_risk_band:  { type: 'string', enum: ['low','moderate','high'] },
        flight_risk_band_in: { type: 'array', items: { type: 'string' } },
        last_review:       { type: 'string' },
        gender:            { type: 'string', enum: ['woman','man','nonbinary'] },
        is_manager:        { type: 'boolean' },
        promotion_eligible:{ type: 'boolean' },
        comp_ratio_lt:     { type: 'number' },
        comp_ratio_gt:     { type: 'number' },
        comp_total_lt:     { type: 'number' },
        comp_total_gt:     { type: 'number' },
        performance_gte:   { type: 'number' },
        performance_lte:   { type: 'number' },
        tenure_lt:         { type: 'number' },
        tenure_gt:         { type: 'number' },
        span_gte:          { type: 'integer' },
        span_lte:          { type: 'integer' },
      }
    };

    return [
      {
        name: 'query_people',
        description: 'Filter the people graph and return up to N matching rows. When more than `limit` match, returns a representative sample with edge cases. Never returns individual gender/salary/perf in text; use this for cohort discovery and table rendering.',
        input_schema: {
          type: 'object',
          properties: {
            filters: filtersSchema,
            limit:   { type: 'integer', default: 20, maximum: 50 },
            sort_by: { type: 'string', description: 'field to sort by, e.g. comp_ratio, flight_risk, tenure_years' },
            sort_desc: { type: 'boolean' },
          }
        }
      },
      {
        name: 'aggregate',
        description: 'Group the people graph by one or two dimensions and compute statistics. Use this for "by department", "by region × level", etc.',
        input_schema: {
          type: 'object',
          required: ['group_by', 'metrics'],
          properties: {
            filters:  filtersSchema,
            group_by: { type: 'array', items: { type: 'string', enum: ['department','region','level','gender','country','team','location','flight_risk_band','last_review','employment_type','is_manager'] } },
            metrics:  { type: 'array', items: { type: 'string', enum: ['count','median_comp','mean_comp','median_comp_ratio','median_tenure','pct_high_flight_risk','pct_moderate_or_high_flight_risk','median_performance','median_span','pay_gap_pct'] } },
            min_cell_n: { type: 'integer', description: 'suppress groups with n smaller than this', default: 1 },
          }
        }
      },
      {
        name: 'distribution',
        description: 'Compute histogram bin counts or quantile values for one numeric field.',
        input_schema: {
          type: 'object',
          required: ['field'],
          properties: {
            filters: filtersSchema,
            field:   { type: 'string', enum: ['comp_total','comp_ratio','tenure_years','performance_score','flight_risk','span_of_control'] },
            bins:    { type: 'integer', default: 10 },
            quantiles: { type: 'array', items: { type: 'number' } },
          }
        }
      },
      {
        name: 'pay_equity',
        description: 'Specialized pay-equity analysis. Computes median comp by gender within (level × location|region) cells, suppresses small cells, returns weighted gap.',
        input_schema: {
          type: 'object',
          properties: {
            filters: filtersSchema,
            dimensions: { type: 'array', items: { type: 'string', enum: ['level','location','region','department','team'] }, default: ['level','region'] },
            minimum_n_per_cell: { type: 'integer', default: 10 },
          }
        }
      },
      {
        name: 'render_chart',
        description: 'Draw a chart in the Inspect section. Inputs match the existing chart utilities — provide rows directly.',
        input_schema: {
          type: 'object',
          required: ['type','title','data'],
          properties: {
            type:  { type: 'string', enum: ['horizontal_bar','grouped_bar','stacked_bar','heatmap'] },
            title: { type: 'string' },
            data:  {
              description: 'For horizontal_bar: [{label, value, sub?}]. For grouped_bar: [{group, bars:[{label,value,color?}], annotation?}]. For stacked_bar: [{label, n, high?}]. For heatmap: {rows:[...], cols:[...], cells:[[{rate,n}, ...], ...]}.',
            },
            suffix: { type: 'string' },
            color:  { type: 'string' },
          }
        }
      },
      {
        name: 'cite',
        description: 'Emit the citation pack for this answer. ALWAYS call this last, before the final text turn.',
        input_schema: {
          type: 'object',
          required: ['method','cohort_size','confidence'],
          properties: {
            method:              { type: 'string' },
            cohort_size:         { type: 'integer' },
            dimensions_controlled: { type: 'array', items: { type: 'string' } },
            confidence:          { type: 'string', enum: ['high','moderate','low'] },
            caveats:             { type: 'array', items: { type: 'string' } },
            source:              { type: 'string' },
          },
        },
      },
      // ── ATS TOOLS ────────────────────────────────────────────
      {
        name: 'query_requisitions',
        description: 'Filter the requisitions dataset and return matching rows. Use this for "open reqs in Engineering", "stuck offers", "aging reqs", etc.',
        input_schema: {
          type: 'object',
          properties: {
            filters: {
              type: 'object',
              properties: {
                department:       { type: 'string' },
                department_in:    { type: 'array', items: { type: 'string' } },
                status:           { type: 'string', enum: ['open','on_hold','filled','closed'] },
                status_in:        { type: 'array', items: { type: 'string' } },
                sla_status:       { type: 'string', enum: ['in_pace','aging','stuck'] },
                priority:         { type: 'string', enum: ['critical','high','standard'] },
                region:           { type: 'string' },
                level:            { type: 'string' },
                level_in:         { type: 'array', items: { type: 'string' } },
                remote:           { type: 'string', enum: ['remote','hybrid','on_site'] },
                days_open_gt:     { type: 'integer' },
                days_open_lt:     { type: 'integer' },
                has_offer_extended: { type: 'boolean', description: 'true if stage_counts.offer > 0' },
              }
            },
            limit:    { type: 'integer', default: 20, maximum: 50 },
            sort_by:  { type: 'string', description: 'e.g. days_open, comp_band_p50' },
            sort_desc:{ type: 'boolean' },
          }
        }
      },
      {
        name: 'query_candidates',
        description: 'Filter the candidates dataset and return matching rows. Filters by stage, source, requisition, days-in-stage, predicted accept probability, etc.',
        input_schema: {
          type: 'object',
          properties: {
            filters: {
              type: 'object',
              properties: {
                stage:            { type: 'string', enum: ['applied','screen','interview','offer','accepted','rejected','withdrew'] },
                stage_in:         { type: 'array', items: { type: 'string' } },
                source:           { type: 'string', enum: ['referral','inbound','outbound','agency','event'] },
                source_in:        { type: 'array', items: { type: 'string' } },
                requisition_id:   { type: 'string' },
                requisition_department: { type: 'string' },
                days_in_stage_gt: { type: 'integer' },
                days_in_stage_lt: { type: 'integer' },
                predicted_accept_gt: { type: 'number' },
                predicted_accept_lt: { type: 'number' },
                is_referral:      { type: 'boolean' },
                is_internal:      { type: 'boolean' },
              }
            },
            limit:    { type: 'integer', default: 20, maximum: 50 },
            sort_by:  { type: 'string' },
            sort_desc:{ type: 'boolean' },
          }
        }
      },
      {
        name: 'aggregate_pipeline',
        description: 'Group requisitions or candidates by department/stage/source and compute conversion or aging stats. Use this for funnel analyses, source mix, time-to-fill.',
        input_schema: {
          type: 'object',
          required: ['entity','group_by'],
          properties: {
            entity:   { type: 'string', enum: ['requisitions','candidates'] },
            group_by: { type: 'array', items: { type: 'string', enum: ['department','stage','source','region','level','sla_status','status','priority','requisition_id'] } },
            filters:  {
              type: 'object',
              description: 'Same shapes as query_requisitions/query_candidates filters; the filter set used depends on entity.',
            },
            metrics:  { type: 'array', items: { type: 'string', enum: ['count','median_days_open','median_days_in_stage','accepted_rate','offer_rate','interview_rate','median_offered_comp','median_predicted_accept'] } },
            min_cell_n: { type: 'integer', default: 1 },
          },
        },
        // last tool → cache breakpoint here so the entire tool list is cached
        cache_control: { type: 'ephemeral' },
      },
    ];
  },

  // ─────────────────────────────────────────────────────────
  // TOOL DISPATCHER (client-side; reads state.people)
  // ─────────────────────────────────────────────────────────
  dispatch(name, input) {
    try {
      switch (name) {
        case 'query_people':       return LLM.tool_queryPeople(input);
        case 'aggregate':          return LLM.tool_aggregate(input);
        case 'distribution':       return LLM.tool_distribution(input);
        case 'pay_equity':         return LLM.tool_payEquity(input);
        case 'render_chart':       return LLM.tool_renderChart(input);
        case 'cite':               return LLM.tool_cite(input);
        case 'query_requisitions': return LLM.tool_queryRequisitions(input);
        case 'query_candidates':   return LLM.tool_queryCandidates(input);
        case 'aggregate_pipeline': return LLM.tool_aggregatePipeline(input);
        default:                   return { error: 'unknown tool: ' + name };
      }
    } catch (e) {
      return { error: String(e && e.message || e) };
    }
  },

  applyFilters(people, f) {
    if (!f) return people.slice();
    return people.filter(p => {
      if (f.department && p.department !== f.department) return false;
      if (f.department_in && !f.department_in.includes(p.department)) return false;
      if (f.region && p.region !== f.region) return false;
      if (f.region_in && !f.region_in.includes(p.region)) return false;
      if (f.country && p.country !== f.country) return false;
      if (f.location && p.location !== f.location) return false;
      if (f.team && p.team !== f.team) return false;
      if (f.level && p.level !== f.level) return false;
      if (f.level_in && !f.level_in.includes(p.level)) return false;
      if (f.employment_type && p.employment_type !== f.employment_type) return false;
      if (f.flight_risk_band && p.flight_risk_band !== f.flight_risk_band) return false;
      if (f.flight_risk_band_in && !f.flight_risk_band_in.includes(p.flight_risk_band)) return false;
      if (f.last_review && p.last_review !== f.last_review) return false;
      if (f.gender && p.gender !== f.gender) return false;
      if (typeof f.is_manager === 'boolean' && p.is_manager !== f.is_manager) return false;
      if (typeof f.promotion_eligible === 'boolean' && p.promotion_eligible !== f.promotion_eligible) return false;
      if (typeof f.comp_ratio_lt === 'number' && !(p.comp_ratio <  f.comp_ratio_lt)) return false;
      if (typeof f.comp_ratio_gt === 'number' && !(p.comp_ratio >  f.comp_ratio_gt)) return false;
      if (typeof f.comp_total_lt === 'number' && !(p.comp_total <  f.comp_total_lt)) return false;
      if (typeof f.comp_total_gt === 'number' && !(p.comp_total >  f.comp_total_gt)) return false;
      if (typeof f.performance_gte === 'number' && !(p.performance_score >= f.performance_gte)) return false;
      if (typeof f.performance_lte === 'number' && !(p.performance_score <= f.performance_lte)) return false;
      if (typeof f.tenure_lt === 'number' && !(p.tenure_years < f.tenure_lt)) return false;
      if (typeof f.tenure_gt === 'number' && !(p.tenure_years > f.tenure_gt)) return false;
      if (typeof f.span_gte === 'number' && !((p.span_of_control || 0) >= f.span_gte)) return false;
      if (typeof f.span_lte === 'number' && !((p.span_of_control || 0) <= f.span_lte)) return false;
      return true;
    });
  },

  // Project row to safe view (drop email; keep id+display_name)
  projectRow(p) {
    return {
      id: p.id,
      display_name: p.display_name,
      title: p.title,
      level: p.level,
      department: p.department,
      team: p.team,
      location: p.location,
      country: p.country,
      region: p.region,
      tenure_years: round1(p.tenure_years),
      comp_total: p.comp_total,
      comp_band_p50: p.comp_band_p50,
      comp_ratio: round2(p.comp_ratio),
      last_review: p.last_review,
      performance_score: round1(p.performance_score),
      flight_risk: round2(p.flight_risk),
      flight_risk_band: p.flight_risk_band,
      is_manager: p.is_manager,
      span_of_control: p.span_of_control,
      manager_id: p.manager_id,
      employment_type: p.employment_type,
      promotion_eligible: p.promotion_eligible,
    };
  },

  // tool · query_people
  tool_queryPeople({ filters, limit, sort_by, sort_desc }) {
    const rows = LLM.applyFilters(state.people, filters);
    const sortField = sort_by || 'comp_ratio';
    rows.sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sort_desc ? (bv - av) : (av - bv);
    });
    const cap = Math.min(limit || 20, 50);
    const sample = rows.slice(0, cap).map(LLM.projectRow);
    // Include 2 edge rows if heavily capped
    if (rows.length > cap + 2) {
      sample.push(LLM.projectRow(rows[rows.length - 1]));
    }
    return {
      rows: sample,
      total_matched: rows.length,
      sample_capped_at: cap,
      truncated: rows.length > cap,
    };
  },

  // tool · aggregate
  tool_aggregate({ filters, group_by, metrics, min_cell_n }) {
    const base = LLM.applyFilters(state.people, filters);
    const dims = (group_by && group_by.length) ? group_by : ['department'];
    const groups = new Map();
    base.forEach(p => {
      const key = dims.map(d => p[d] != null ? p[d] : '—').join(' · ');
      if (!groups.has(key)) {
        const k = {};
        dims.forEach(d => { k[d] = p[d]; });
        groups.set(key, { _key: k, rows: [] });
      }
      groups.get(key).rows.push(p);
    });
    const out = [];
    const minN = min_cell_n || 1;
    groups.forEach(g => {
      if (g.rows.length < minN) return;
      const m = {};
      const compArr = g.rows.map(r => r.comp_total);
      (metrics || ['count']).forEach(metric => {
        switch (metric) {
          case 'count':                m.count = g.rows.length; break;
          case 'median_comp':          m.median_comp = Math.round(median(compArr)); break;
          case 'mean_comp':            m.mean_comp = Math.round(compArr.reduce((a,b)=>a+b,0) / Math.max(g.rows.length,1)); break;
          case 'median_comp_ratio':    m.median_comp_ratio = round3(median(g.rows.map(r => r.comp_ratio))); break;
          case 'median_tenure':        m.median_tenure = round1(median(g.rows.map(r => r.tenure_years))); break;
          case 'pct_high_flight_risk': m.pct_high_flight_risk = round1(100 * g.rows.filter(r => r.flight_risk_band === 'high').length / g.rows.length); break;
          case 'pct_moderate_or_high_flight_risk': m.pct_mod_or_high = round1(100 * g.rows.filter(r => r.flight_risk_band !== 'low').length / g.rows.length); break;
          case 'median_performance':   m.median_performance = round2(median(g.rows.map(r => r.performance_score))); break;
          case 'median_span':          m.median_span = Math.round(median(g.rows.filter(r => r.is_manager).map(r => r.span_of_control || 0))); break;
          case 'pay_gap_pct': {
            const women = g.rows.filter(r => r.gender === 'woman').map(r => r.comp_total);
            const men   = g.rows.filter(r => r.gender === 'man').map(r => r.comp_total);
            if (women.length >= 5 && men.length >= 5) {
              const mw = median(women), mm = median(men);
              m.pay_gap_pct = round2(((mm - mw) / mm) * 100);
              m.women_n = women.length;
              m.men_n   = men.length;
            } else {
              m.pay_gap_pct = null;
              m.suppressed = 'n<5 in one bucket';
            }
            break;
          }
        }
      });
      out.push({ group_key: g._key, n: g.rows.length, metrics: m });
    });
    // Sort: by first metric value, desc
    const firstMetric = Object.keys(out[0]?.metrics || {})[0];
    if (firstMetric) out.sort((a, b) => (b.metrics[firstMetric] || 0) - (a.metrics[firstMetric] || 0));
    return { groups: out, total_rows_used: base.length, dimensions: dims };
  },

  // tool · distribution
  tool_distribution({ filters, field, bins, quantiles }) {
    const rows = LLM.applyFilters(state.people, filters);
    const vals = rows.map(r => r[field]).filter(v => typeof v === 'number');
    if (!vals.length) return { error: 'no data', n: 0 };
    const out = { n: vals.length, min: Math.min(...vals), max: Math.max(...vals), mean: round2(vals.reduce((a,b)=>a+b,0)/vals.length), median: round2(median(vals)) };
    if (quantiles && quantiles.length) {
      out.quantiles = {};
      quantiles.forEach(q => { out.quantiles[String(q)] = round2(percentile(vals, q)); });
    }
    if (bins && bins > 0) {
      const lo = out.min, hi = out.max, step = (hi - lo) / bins || 1;
      const buckets = Array.from({ length: bins }, (_, i) => ({ lo: round2(lo + i*step), hi: round2(lo + (i+1)*step), n: 0 }));
      vals.forEach(v => {
        const i = Math.min(bins - 1, Math.floor((v - lo) / step));
        buckets[i].n++;
      });
      out.bins = buckets;
    }
    return out;
  },

  // tool · pay_equity
  tool_payEquity({ filters, dimensions, minimum_n_per_cell }) {
    const dims = (dimensions && dimensions.length) ? dimensions : ['level','region'];
    const minN = minimum_n_per_cell || 10;
    const base = LLM.applyFilters(state.people, filters);
    const cells = new Map();
    base.forEach(p => {
      const key = dims.map(d => p[d] != null ? p[d] : '—').join(' · ');
      if (!cells.has(key)) {
        const k = {}; dims.forEach(d => { k[d] = p[d]; });
        cells.set(key, { _key: k, women: [], men: [], nb: [] });
      }
      const c = cells.get(key);
      if (p.gender === 'woman') c.women.push(p.comp_total);
      else if (p.gender === 'man') c.men.push(p.comp_total);
      else if (p.gender === 'nonbinary') c.nb.push(p.comp_total);
    });
    const reported = [];
    let weightedGapNum = 0, weightedGapDen = 0;
    let suppressed = 0;
    cells.forEach(c => {
      if (c.women.length < minN || c.men.length < minN) { suppressed++; return; }
      const mw = median(c.women), mm = median(c.men);
      const gap = (mm - mw) / mm * 100;
      const w = c.women.length + c.men.length;
      weightedGapNum += gap * w;
      weightedGapDen += w;
      reported.push({
        cell: c._key,
        women_n: c.women.length, men_n: c.men.length, nb_n: c.nb.length,
        women_median: Math.round(mw),
        men_median:   Math.round(mm),
        gap_pct: round2(gap),
      });
    });
    reported.sort((a,b) => b.gap_pct - a.gap_pct);
    return {
      dimensions: dims,
      minimum_n_per_cell: minN,
      cells_reported: reported.length,
      cells_suppressed_small_n: suppressed,
      weighted_gap_pct: weightedGapDen > 0 ? round2(weightedGapNum / weightedGapDen) : null,
      cells: reported,
      methodology: `Median comp_total compared within ${dims.join(' × ')} groups; cells with women_n < ${minN} or men_n < ${minN} suppressed. Nonbinary excluded from binary gap.`,
    };
  },

  // tool · render_chart — stash for the answer-card to draw
  tool_renderChart(input) {
    // Validate roughly, then stash in pending answer state
    LLM.pending.chart = input;
    return { ok: true, queued: input.type };
  },

  // tool · cite
  tool_cite(input) {
    LLM.pending.cite = input;
    return { ok: true };
  },

  // ── ATS tool helpers ─────────────────────────────────────────
  applyReqFilters(reqs, f) {
    if (!f) return reqs.slice();
    return reqs.filter(r => {
      if (f.department && r.department !== f.department) return false;
      if (f.department_in && !f.department_in.includes(r.department)) return false;
      if (f.status && r.status !== f.status) return false;
      if (f.status_in && !f.status_in.includes(r.status)) return false;
      if (f.sla_status && r.sla_status !== f.sla_status) return false;
      if (f.priority && r.priority !== f.priority) return false;
      if (f.region && r.region !== f.region) return false;
      if (f.level && r.level !== f.level) return false;
      if (f.level_in && !f.level_in.includes(r.level)) return false;
      if (f.remote && r.remote !== f.remote) return false;
      if (typeof f.days_open_gt === 'number' && !(r.days_open > f.days_open_gt)) return false;
      if (typeof f.days_open_lt === 'number' && !(r.days_open < f.days_open_lt)) return false;
      if (typeof f.has_offer_extended === 'boolean') {
        const has = (r.stage_counts && r.stage_counts.offer > 0);
        if (f.has_offer_extended !== has) return false;
      }
      return true;
    });
  },

  applyCandFilters(cands, f) {
    if (!f) return cands.slice();
    return cands.filter(c => {
      if (f.stage && c.stage !== f.stage) return false;
      if (f.stage_in && !f.stage_in.includes(c.stage)) return false;
      if (f.source && c.source !== f.source) return false;
      if (f.source_in && !f.source_in.includes(c.source)) return false;
      if (f.requisition_id && c.requisition_id !== f.requisition_id) return false;
      if (f.requisition_department) {
        const req = state.byReqId.get(c.requisition_id);
        if (!req || req.department !== f.requisition_department) return false;
      }
      if (typeof f.days_in_stage_gt === 'number' && !(c.days_in_stage > f.days_in_stage_gt)) return false;
      if (typeof f.days_in_stage_lt === 'number' && !(c.days_in_stage < f.days_in_stage_lt)) return false;
      if (typeof f.predicted_accept_gt === 'number' && !(c.predicted_offer_acceptance_probability > f.predicted_accept_gt)) return false;
      if (typeof f.predicted_accept_lt === 'number' && !(c.predicted_offer_acceptance_probability < f.predicted_accept_lt)) return false;
      if (typeof f.is_referral === 'boolean' && c.is_referral !== f.is_referral) return false;
      if (typeof f.is_internal === 'boolean' && c.is_internal !== f.is_internal) return false;
      return true;
    });
  },

  projectReq(r) {
    return {
      id: r.id,
      title: r.title,
      department: r.department,
      team: r.team,
      level: r.level,
      location: r.location,
      region: r.region,
      remote: r.remote,
      status: r.status,
      sla_status: r.sla_status,
      priority: r.priority,
      days_open: r.days_open,
      opened_date: r.opened_date,
      target_close_date: r.target_close_date,
      comp_band_p50: r.comp_band_p50,
      stage_counts: r.stage_counts,
      hiring_manager_id: r.hiring_manager_id,
      recruiter_id: r.recruiter_id,
    };
  },

  projectCand(c) {
    return {
      id: c.id,
      display_name: c.display_name,
      current_title: c.current_title,
      current_company: c.current_company,
      total_experience_years: c.total_experience_years,
      highest_level_indicated: c.highest_level_indicated,
      source: c.source,
      requisition_id: c.requisition_id,
      stage: c.stage,
      days_in_stage: c.days_in_stage,
      stage_entered: c.stage_entered,
      offered_comp: c.offered_comp,
      expected_comp: c.expected_comp,
      predicted_offer_acceptance_probability: c.predicted_offer_acceptance_probability,
      is_referral: c.is_referral,
      is_internal: c.is_internal,
      referrer_id: c.referrer_id,
    };
  },

  // tool · query_requisitions
  tool_queryRequisitions({ filters, limit, sort_by, sort_desc }) {
    const rows = LLM.applyReqFilters(state.requisitions, filters);
    const sortField = sort_by || 'days_open';
    rows.sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return sort_desc ? bv.localeCompare(av) : av.localeCompare(bv);
      return sort_desc ? (bv - av) : (av - bv);
    });
    const cap = Math.min(limit || 20, 50);
    return {
      rows: rows.slice(0, cap).map(LLM.projectReq),
      total_matched: rows.length,
      sample_capped_at: cap,
      truncated: rows.length > cap,
    };
  },

  // tool · query_candidates
  tool_queryCandidates({ filters, limit, sort_by, sort_desc }) {
    const rows = LLM.applyCandFilters(state.candidates, filters);
    const sortField = sort_by || 'days_in_stage';
    rows.sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return sort_desc ? bv.localeCompare(av) : av.localeCompare(bv);
      return sort_desc ? (bv - av) : (av - bv);
    });
    const cap = Math.min(limit || 20, 50);
    return {
      rows: rows.slice(0, cap).map(LLM.projectCand),
      total_matched: rows.length,
      sample_capped_at: cap,
      truncated: rows.length > cap,
    };
  },

  // tool · aggregate_pipeline
  tool_aggregatePipeline({ entity, group_by, filters, metrics, min_cell_n }) {
    const dims = (group_by && group_by.length) ? group_by : ['department'];
    const minN = min_cell_n || 1;
    let base;
    if (entity === 'candidates') {
      base = LLM.applyCandFilters(state.candidates, filters);
    } else {
      base = LLM.applyReqFilters(state.requisitions, filters);
    }

    const get = (row, dim) => {
      // For candidates, allow accessing the req's department via virtual dim
      if (entity === 'candidates' && dim === 'department') {
        const req = state.byReqId.get(row.requisition_id);
        return req ? req.department : '—';
      }
      if (dim === 'requisition_id') return row.requisition_id;
      return row[dim];
    };

    const groups = new Map();
    base.forEach(r => {
      const key = dims.map(d => {
        const v = get(r, d);
        return v != null ? v : '—';
      }).join(' · ');
      if (!groups.has(key)) {
        const k = {};
        dims.forEach(d => { k[d] = get(r, d); });
        groups.set(key, { _key: k, rows: [] });
      }
      groups.get(key).rows.push(r);
    });

    const out = [];
    const wanted = metrics || ['count'];
    groups.forEach(g => {
      if (g.rows.length < minN) return;
      const m = {};
      wanted.forEach(metric => {
        switch (metric) {
          case 'count': m.count = g.rows.length; break;
          case 'median_days_open': {
            const xs = g.rows.map(r => r.days_open).filter(v => typeof v === 'number');
            xs.sort((a,b)=>a-b);
            m.median_days_open = xs.length ? xs[Math.floor(xs.length/2)] : null;
            break;
          }
          case 'median_days_in_stage': {
            const xs = g.rows.map(r => r.days_in_stage).filter(v => typeof v === 'number');
            xs.sort((a,b)=>a-b);
            m.median_days_in_stage = xs.length ? xs[Math.floor(xs.length/2)] : null;
            break;
          }
          case 'accepted_rate': {
            const acc = g.rows.filter(r => r.stage === 'accepted').length;
            m.accepted_rate = round1(100 * acc / g.rows.length);
            break;
          }
          case 'offer_rate': {
            const off = g.rows.filter(r => ['offer','accepted'].includes(r.stage)).length;
            m.offer_rate = round1(100 * off / g.rows.length);
            break;
          }
          case 'interview_rate': {
            const intv = g.rows.filter(r => ['interview','offer','accepted'].includes(r.stage)).length;
            m.interview_rate = round1(100 * intv / g.rows.length);
            break;
          }
          case 'median_offered_comp': {
            const xs = g.rows.map(r => r.offered_comp).filter(v => typeof v === 'number');
            xs.sort((a,b)=>a-b);
            m.median_offered_comp = xs.length ? xs[Math.floor(xs.length/2)] : null;
            break;
          }
          case 'median_predicted_accept': {
            const xs = g.rows.map(r => r.predicted_offer_acceptance_probability).filter(v => typeof v === 'number');
            xs.sort((a,b)=>a-b);
            m.median_predicted_accept = xs.length ? round2(xs[Math.floor(xs.length/2)]) : null;
            break;
          }
        }
      });
      out.push({ group_key: g._key, n: g.rows.length, metrics: m });
    });
    const firstMetric = Object.keys(out[0]?.metrics || {})[0];
    if (firstMetric) {
      out.sort((a,b) => {
        const av = a.metrics[firstMetric] || 0;
        const bv = b.metrics[firstMetric] || 0;
        return bv - av;
      });
    }
    return { groups: out, entity, dimensions: dims, total_rows_used: base.length };
  },

  // ─────────────────────────────────────────────────────────
  // STREAMING + LOOP
  // ─────────────────────────────────────────────────────────
  pending: { chart: null, cite: null, firstInspect: null },

  async ask(question, { onText, onThinking, onStatus, onUsage }) {
    if (!LLM.settings.apiKey) throw new Error('No API key configured.');
    LLM.pending = { chart: null, cite: null, firstInspect: null };
    LLM.session.inFlight = true;

    const messages = [{ role: 'user', content: question }];
    const sys = LLM.buildSystem();
    const tools = LLM.buildTools();
    const model = LLM.settings.model;
    const useThink = LLM.MODELS[model]?.thinking && LLM.settings.thinkingBudget > 0;

    let finalText = '';
    let aggUsage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    const MAX_TURNS = 10;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      onStatus && onStatus(turn === 0 ? 'thinking' : `tool turn ${turn}`);
      // max_tokens must exceed thinking budget when extended thinking is on.
      const maxOut = useThink ? Math.max(4096, LLM.settings.thinkingBudget + 2048) : 4096;
      const body = {
        model,
        max_tokens: maxOut,
        system: sys,
        messages,
        tools,
        stream: true,
      };
      if (useThink) {
        body.thinking = { type: 'enabled', budget_tokens: LLM.settings.thinkingBudget };
        // With extended thinking, temperature/top_p/top_k must be defaults — omit them.
      }

      const turnResult = await LLM.callStream(body, { onText, onThinking, onStatus });
      // Accumulate usage; emit cumulative for the per-question line, and the per-turn
      // DELTA for the top-bar session meter so it doesn't double-count multi-turn answers.
      const turnDelta = {};
      Object.keys(aggUsage).forEach(k => {
        const d = (turnResult.usage[k] || 0);
        turnDelta[k] = d;
        aggUsage[k] += d;
      });
      onUsage && onUsage({ model, usage: aggUsage, turnUsage: turnDelta });

      // Append assistant turn (verbatim, including thinking + tool_use)
      messages.push({ role: 'assistant', content: turnResult.content });

      if (turnResult.stop_reason === 'tool_use') {
        // gather tool_use blocks, dispatch each, build a single user message with tool_result blocks
        const results = [];
        for (const block of turnResult.content) {
          if (block.type !== 'tool_use') continue;
          onStatus && onStatus('running tool · ' + block.name);
          const out = LLM.dispatch(block.name, block.input || {});
          results.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(out),
            is_error: !!(out && out.error),
          });
          // Remember first data tool for inspect rendering
          if (!LLM.pending.firstInspect && ['query_people','aggregate','pay_equity','distribution','query_requisitions','query_candidates','aggregate_pipeline'].includes(block.name)) {
            LLM.pending.firstInspect = { name: block.name, input: block.input, output: out };
          }
        }
        messages.push({ role: 'user', content: results });
        continue;
      }

      // end_turn / max_tokens / stop_sequence — done
      // collect any final text
      turnResult.content.forEach(b => {
        if (b.type === 'text') finalText = b.text;
      });
      LLM.session.inFlight = false;
      return {
        text: finalText,
        usage: aggUsage,
        model,
        stop_reason: turnResult.stop_reason,
        chart: LLM.pending.chart,
        cite: LLM.pending.cite,
        firstInspect: LLM.pending.firstInspect,
        truncated: turnResult.stop_reason === 'max_tokens',
      };
    }

    LLM.session.inFlight = false;
    return { text: finalText || '(agent looped too long without finishing)', usage: aggUsage, model, stop_reason: 'tool_loop_limit', chart: LLM.pending.chart, cite: LLM.pending.cite, firstInspect: LLM.pending.firstInspect, truncated: true };
  },

  // ── Single streamed call. Returns {content, stop_reason, usage} ──
  async callStream(body, { onText, onThinking, onStatus }) {
    const controller = new AbortController();
    LLM.session.streamAbort = controller;

    const res = await LLM.fetchWithRetry(body, controller.signal);
    if (!res.ok) {
      const txt = await res.text();
      throw Object.assign(new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`), { status: res.status, body: txt });
    }

    // Per-content-block accumulators
    const blocks = [];          // accumulated content blocks (final)
    const partial = new Map();  // index → working block
    let stop_reason = null;
    let usage = {};

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // SSE events separated by \n\n
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (!raw.trim()) continue;
        // parse SSE event (event: foo / data: {...})
        let eventName = 'message';
        const dataLines = [];
        raw.split('\n').forEach(line => {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        });
        if (!dataLines.length) continue;
        let data;
        try { data = JSON.parse(dataLines.join('\n')); }
        catch (e) { continue; }

        if (eventName === 'ping') continue;
        if (eventName === 'error') {
          throw Object.assign(new Error(data.error?.message || 'stream error'), { sse: data });
        }
        if (eventName === 'message_start') {
          usage = Object.assign({}, data.message?.usage || {});
        }
        else if (eventName === 'content_block_start') {
          const b = data.content_block;
          // initialize working copy with text/input buffers
          const w = JSON.parse(JSON.stringify(b));
          if (w.type === 'text') w.text = w.text || '';
          if (w.type === 'thinking') { w.thinking = w.thinking || ''; w.signature = w.signature || ''; }
          if (w.type === 'tool_use') w._inputBuf = '';
          partial.set(data.index, w);
        }
        else if (eventName === 'content_block_delta') {
          const w = partial.get(data.index);
          if (!w) continue;
          const d = data.delta;
          if (d.type === 'text_delta') {
            w.text += d.text;
            onText && onText(d.text, w);
          } else if (d.type === 'thinking_delta') {
            w.thinking += d.thinking;
            onThinking && onThinking(d.thinking, w);
          } else if (d.type === 'signature_delta') {
            w.signature += d.signature;
          } else if (d.type === 'input_json_delta') {
            w._inputBuf += d.partial_json;
          }
        }
        else if (eventName === 'content_block_stop') {
          const w = partial.get(data.index);
          if (!w) continue;
          if (w.type === 'tool_use') {
            try { w.input = w._inputBuf ? JSON.parse(w._inputBuf) : {}; }
            catch (e) { w.input = {}; }
            delete w._inputBuf;
          }
          blocks[data.index] = w;
          partial.delete(data.index);
          if (w.type === 'tool_use' && onStatus) onStatus(`calling tool · ${w.name}`);
        }
        else if (eventName === 'message_delta') {
          if (data.delta?.stop_reason) stop_reason = data.delta.stop_reason;
          if (data.usage) Object.assign(usage, data.usage);
        }
        else if (eventName === 'message_stop') {
          // nothing else
        }
      }
    }

    // Compact blocks (in case of sparse indexing)
    const content = blocks.filter(Boolean);
    return { content, stop_reason, usage };
  },

  async fetchWithRetry(body, signal) {
    const headers = {
      'content-type': 'application/json',
      'x-api-key': LLM.settings.apiKey,
      'anthropic-version': LLM.VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    const init = { method: 'POST', headers, body: JSON.stringify(body), signal };

    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(LLM.API_URL, init);
        if (res.status === 429) {
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }
        if (res.status === 529 || res.status === 503) {
          const backoff = 1000 * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
        return res;
      } catch (e) {
        lastErr = e;
        if (e.name === 'AbortError') throw e;
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    throw lastErr || new Error('Network failure');
  },

  // ── Validate API key with a 1-token call ──
  async validateKey(key) {
    try {
      const res = await fetch(LLM.API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': LLM.VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      if (res.status === 401) return { ok: false, reason: 'Your API key was rejected. Try another.' };
      if (res.status === 400) {
        // Could be model availability; try the default model
        const body = await res.text();
        return { ok: true, warning: body.slice(0, 200) };
      }
      if (!res.ok) {
        const t = await res.text();
        return { ok: false, reason: `HTTP ${res.status}: ${t.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  },
};

// rounding helpers
function round1(n) { return n == null ? null : Math.round(n * 10) / 10; }
function round2(n) { return n == null ? null : Math.round(n * 100) / 100; }
function round3(n) { return n == null ? null : Math.round(n * 1000) / 1000; }

// ═════════════════════════════════════════════════════════════
// ░░░░░░░░░░░  LIVE ANSWER RENDERING (streaming)  ░░░░░░░░░░░░
// ═════════════════════════════════════════════════════════════

async function renderAnswerLive(question) {
  const mount = $('#answer-mount');
  mount.innerHTML = '';

  // Build skeleton card with streaming targets
  const card = el('div', { class: 'answer-card answer-card-live', role: 'article' });
  card.innerHTML = `
    <div class="answer-q">
      <span class="answer-q-label">§ Ask</span>
      <span class="answer-q-text">${escapeHtml(question)}</span>
      <span class="answer-q-status" id="live-status">connecting…</span>
    </div>

    <details class="answer-reasoning" id="live-reasoning">
      <summary><span class="rl">Reasoning</span> <span class="caret">▾</span></summary>
      <div class="reasoning-body" id="live-reasoning-body"></div>
    </details>

    <div class="answer-section">
      <div class="section-label"><span class="sigil">§1</span>Ask · interpreted as</div>
      <div class="cohort-filter" id="live-cohort">Routing the question through tools…</div>
    </div>

    <div class="answer-section">
      <div class="section-label"><span class="sigil">§2</span>Answer</div>
      <div class="answer-headline answer-live-text" id="live-text"><span class="stream-cursor"></span></div>
    </div>

    <div class="answer-section">
      <div class="section-label"><span class="sigil">§3</span>Inspect · chart and cohort</div>
      <div class="inspect-row">
        <div class="inspect-chart">
          <div class="ch-title" id="live-chart-title">Awaiting chart…</div>
          <div id="live-chart-mount"></div>
        </div>
        <div id="live-table-mount"></div>
      </div>
    </div>

    <div class="answer-section">
      <div class="section-label"><span class="sigil">§4</span>Cite · methodology and provenance</div>
      <div class="cite-grid" id="live-cite"><div class="cite-chip"><span class="lbl">Pending</span><span class="v">Awaiting cite tool…</span></div></div>
    </div>

    <div class="answer-actions">
      <button class="btn btn-ochre" id="act-save">Save to my workspace</button>
      <button class="btn btn-ghost" id="act-new">New question</button>
      <button class="btn btn-ghost" id="act-stop">Stop</button>
      <span style="flex:1"></span>
      <span class="cost-inline" id="live-cost">$0.0000 · ${LLM.settings.model.replace('claude-','')}</span>
    </div>
  `;
  mount.appendChild(card);

  const textNode = $('#live-text');
  const statusNode = $('#live-status');
  const reasoningBody = $('#live-reasoning-body');
  const reasoningWrap = $('#live-reasoning');
  let textBuf = '';
  let reasoningBuf = '';
  let anyThinking = false;

  function setText() {
    // Render markdown-lite (bold + italic) and preserve newlines
    const html = renderInlineMd(textBuf);
    textNode.innerHTML = html + '<span class="stream-cursor"></span>';
  }

  $('#act-stop').addEventListener('click', () => {
    LLM.session.streamAbort && LLM.session.streamAbort.abort();
    statusNode.textContent = 'stopped';
  });
  $('#act-new').addEventListener('click', () => {
    mount.innerHTML = '';
    $('#ask-input').value = '';
    $('#ask-input').focus();
  });

  try {
    const result = await LLM.ask(question, {
      onText: (delta) => {
        textBuf += delta;
        setText();
      },
      onThinking: (delta) => {
        if (!anyThinking) {
          anyThinking = true;
          reasoningWrap.style.display = 'block';
        }
        reasoningBuf += delta;
        reasoningBody.textContent = reasoningBuf;
      },
      onStatus: (s) => { statusNode.textContent = s; },
      onUsage: ({ model, usage, turnUsage }) => {
        const cumCost  = LLM.computeCost(model, usage);
        const turnCost = LLM.computeCost(model, turnUsage || {});
        LLM.session.cost = cumCost;
        $('#live-cost').textContent =
          `$${cumCost.toFixed(4)} · ${model.replace('claude-','')} · in ${usage.input_tokens||0}` +
          (usage.cache_read_input_tokens ? ` (cache ${usage.cache_read_input_tokens})` : '') +
          ` / out ${usage.output_tokens||0}`;
        bumpTopbarCost(turnCost);  // per-turn delta only
      },
    });

    // Finalize cursor
    textNode.innerHTML = renderInlineMd(textBuf);

    // Cohort filter — derive from first tool input
    const fi = result.firstInspect;
    if (fi) {
      $('#live-cohort').innerHTML = describeFilterCall(fi);
    } else {
      $('#live-cohort').innerHTML = '<span class="k">(direct text answer · no filter applied)</span>';
    }

    // Chart
    if (result.chart) {
      $('#live-chart-title').textContent = result.chart.title || '';
      renderClaudeChart($('#live-chart-mount'), result.chart);
    } else {
      $('#live-chart-title').textContent = 'No chart requested';
      $('#live-chart-mount').innerHTML = '<div style="padding:1rem; color:var(--ink-mute); font-style:italic; font-family:var(--serif);">Claude answered without a chart.</div>';
    }

    // Table from firstInspect
    if (fi) {
      $('#live-table-mount').innerHTML = renderInspectTableFromTool(fi);
    }

    // Cite
    if (result.cite) {
      const c = result.cite;
      const chips = [];
      chips.push({ label: 'Source', value: c.source || 'People Graph' });
      chips.push({ label: 'Cohort size', value: String(c.cohort_size) });
      chips.push({ label: 'Method', value: c.method });
      if (c.dimensions_controlled?.length) chips.push({ label: 'Controlled for', value: c.dimensions_controlled.join(', ') });
      chips.push({ label: 'Confidence', value: c.confidence });
      if (c.caveats?.length) chips.push({ label: 'Caveats', value: c.caveats.join(' · ') });
      $('#live-cite').innerHTML = chips.map(ch => `
        <div class="cite-chip"><span class="lbl">${escapeHtml(ch.label)}</span><span class="v">${escapeHtml(ch.value)}</span></div>
      `).join('');
    }

    statusNode.textContent = result.truncated ? 'truncated' : 'done';

    // Save to history
    const hist = JSON.parse(localStorage.getItem('stratum_history') || '[]');
    hist.unshift({ question, ts: Date.now(), model: result.model });
    localStorage.setItem('stratum_history', JSON.stringify(hist.slice(0, 30)));

    // Wire save button
    $('#act-save').addEventListener('click', () => {
      saveToWorkspace({ question });
    });

  } catch (e) {
    statusNode.textContent = 'error';
    if (e.status === 401) {
      LLM.settings.apiKey = '';
      $('#live-text').innerHTML = '<span class="err">Your API key was rejected. Please reconnect.</span>';
      setTimeout(() => openOnboarding('Your API key was rejected. Try another.'), 600);
    } else if (e.name === 'AbortError') {
      $('#live-text').innerHTML = '<span class="err">Stopped.</span>';
    } else {
      $('#live-text').innerHTML = `
        <span class="err">Claude call failed.</span>
        <details class="err-details"><summary>Details</summary>
          <pre>${escapeHtml(e.message || String(e))}</pre>
        </details>`;
    }
    console.error(e);
  }
}

// Mini-markdown renderer — handles headings, tables, hr, lists, inline marks.
// Intentionally not a full CommonMark implementation; tuned for the kinds of
// outputs the agents produce (pipe tables, ATX headings, em/strong, code fences).
function renderInlineMd(s) {
  if (!s) return '';

  // Inline transforms applied to a text fragment (after escapeHtml).
  // Order matters: code first (so its contents are not bold/italic-parsed), then strong, then em.
  function inline(text) {
    return text
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  }

  // Pre-escape the whole string ONCE, then walk lines.
  // We do this before block parsing so HTML in the markdown is neutralized.
  const lines = escapeHtml(s).split('\n');
  const out = [];
  let i = 0;
  let inCode = false;
  let codeBuf = [];
  let paraBuf = [];
  let listBuf = [];        // current list (each entry: html)
  let listType = null;     // 'ul' | 'ol'

  function flushPara() {
    if (paraBuf.length === 0) return;
    const txt = paraBuf.join('<br>');
    out.push('<p>' + inline(txt) + '</p>');
    paraBuf = [];
  }
  function flushList() {
    if (listBuf.length === 0) return;
    const tag = listType === 'ol' ? 'ol' : 'ul';
    out.push('<' + tag + '>' + listBuf.map(li => '<li>' + inline(li) + '</li>').join('') + '</' + tag + '>');
    listBuf = [];
    listType = null;
  }
  function flushAll() {
    flushPara();
    flushList();
  }

  function isTableSeparator(line) {
    // A separator row: only |, -, :, and whitespace
    return /^\s*\|?[\s\-:|]+\|?\s*$/.test(line) && /-/.test(line);
  }
  function splitRow(line) {
    let t = line.trim();
    if (t.startsWith('|')) t = t.slice(1);
    if (t.endsWith('|')) t = t.slice(0, -1);
    return t.split('|').map(c => c.trim());
  }

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw;

    // Code fence
    if (/^\s*```/.test(line)) {
      if (inCode) {
        out.push('<pre><code>' + codeBuf.join('\n') + '</code></pre>');
        codeBuf = [];
        inCode = false;
      } else {
        flushAll();
        inCode = true;
      }
      i++; continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i++; continue;
    }

    // Blank line — paragraph break
    if (/^\s*$/.test(line)) {
      flushAll();
      i++; continue;
    }

    // Horizontal rule
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flushAll();
      out.push('<hr>');
      i++; continue;
    }

    // ATX heading (## Heading)
    const hMatch = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (hMatch) {
      flushAll();
      // Map heading levels into a denser range so they fit inside the answer card:
      // # → h3, ## → h4, ### → h5, etc.
      const level = Math.min(6, hMatch[1].length + 2);
      out.push('<h' + level + '>' + inline(hMatch[2]) + '</h' + level + '>');
      i++; continue;
    }

    // Pipe table — detect header row + separator row + body rows
    if (/^\s*\|/.test(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushAll();
      const headers = splitRow(line);
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i]) && !isTableSeparator(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      let html = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
      headers.forEach(h => { html += '<th>' + inline(h) + '</th>'; });
      html += '</tr></thead><tbody>';
      rows.forEach(r => {
        html += '<tr>';
        // Pad/truncate to header length
        for (let c = 0; c < headers.length; c++) {
          html += '<td>' + inline(r[c] || '') + '</td>';
        }
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      out.push(html);
      continue;
    }

    // Unordered list
    const ulMatch = /^\s*[-*]\s+(.+)$/.exec(line);
    if (ulMatch) {
      flushPara();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listBuf.push(ulMatch[1]);
      i++; continue;
    }

    // Ordered list
    const olMatch = /^\s*\d+\.\s+(.+)$/.exec(line);
    if (olMatch) {
      flushPara();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listBuf.push(olMatch[1]);
      i++; continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      flushList();
      paraBuf.push('<span class="md-quote-mark">›</span> ' + line.replace(/^\s*>\s?/, ''));
      i++; continue;
    }

    // Anything else: paragraph line
    flushList();
    paraBuf.push(line);
    i++;
  }

  if (inCode) {
    // Unclosed code fence — close it
    out.push('<pre><code>' + codeBuf.join('\n') + '</code></pre>');
  }
  flushAll();

  return out.join('\n');
}

function describeFilterCall(fi) {
  const f = (fi.input && fi.input.filters) || {};
  const parts = [];
  const add = (k, v) => parts.push(`<span class="k">${k}</span> <span class="v">${escapeHtml(String(v))}</span>`);
  if (f.department) add('department =', `'${f.department}'`);
  if (f.department_in) add('department IN', '(' + f.department_in.map(x=>`'${x}'`).join(',') + ')');
  if (f.region) add('region =', `'${f.region}'`);
  if (f.region_in) add('region IN', '(' + f.region_in.map(x=>`'${x}'`).join(',') + ')');
  if (f.level) add('level =', `'${f.level}'`);
  if (f.level_in) add('level IN', '(' + f.level_in.map(x=>`'${x}'`).join(',') + ')');
  if (f.country) add('country =', `'${f.country}'`);
  if (f.location) add('location =', `'${f.location}'`);
  if (f.team) add('team =', `'${f.team}'`);
  if (f.flight_risk_band) add('flight_risk_band =', `'${f.flight_risk_band}'`);
  if (f.flight_risk_band_in) add('flight_risk_band IN', '(' + f.flight_risk_band_in.map(x=>`'${x}'`).join(',') + ')');
  if (typeof f.comp_ratio_lt === 'number') add('comp_ratio &lt;', f.comp_ratio_lt);
  if (typeof f.comp_ratio_gt === 'number') add('comp_ratio &gt;', f.comp_ratio_gt);
  if (typeof f.performance_gte === 'number') add('performance &gt;=', f.performance_gte);
  if (typeof f.tenure_lt === 'number') add('tenure &lt;', f.tenure_lt + ' yrs');
  if (typeof f.tenure_gt === 'number') add('tenure &gt;', f.tenure_gt + ' yrs');
  if (typeof f.is_manager === 'boolean') add('is_manager =', f.is_manager);
  if (f.gender) add('gender =', `'${f.gender}'`);
  // ATS filter fields
  if (f.status) add('status =', `'${f.status}'`);
  if (f.status_in) add('status IN', '(' + f.status_in.map(x=>`'${x}'`).join(',') + ')');
  if (f.sla_status) add('sla_status =', `'${f.sla_status}'`);
  if (f.priority) add('priority =', `'${f.priority}'`);
  if (f.remote) add('remote =', `'${f.remote}'`);
  if (typeof f.days_open_gt === 'number') add('days_open &gt;', f.days_open_gt);
  if (typeof f.days_open_lt === 'number') add('days_open &lt;', f.days_open_lt);
  if (typeof f.has_offer_extended === 'boolean') add('has_offer_extended =', f.has_offer_extended);
  if (f.stage) add('stage =', `'${f.stage}'`);
  if (f.stage_in) add('stage IN', '(' + f.stage_in.map(x=>`'${x}'`).join(',') + ')');
  if (f.source) add('source =', `'${f.source}'`);
  if (f.source_in) add('source IN', '(' + f.source_in.map(x=>`'${x}'`).join(',') + ')');
  if (f.requisition_id) add('requisition_id =', `'${f.requisition_id}'`);
  if (f.requisition_department) add('req.department =', `'${f.requisition_department}'`);
  if (typeof f.days_in_stage_gt === 'number') add('days_in_stage &gt;', f.days_in_stage_gt);
  if (typeof f.predicted_accept_gt === 'number') add('predicted_accept &gt;', f.predicted_accept_gt);
  if (typeof f.is_referral === 'boolean') add('is_referral =', f.is_referral);

  const head = `<span class="k">via</span> <span class="v">${fi.name}</span>`;
  if (!parts.length) return head + ' <span class="k">·</span> <span class="k">no filter</span>';
  return head + ' <span class="k">WHERE</span> ' + parts.join(' <span class="k">AND</span> ');
}

function renderInspectTableFromTool(fi) {
  if (fi.name === 'aggregate' || fi.name === 'pay_equity') {
    const data = fi.output;
    if (fi.name === 'pay_equity') {
      const rows = data.cells || [];
      if (!rows.length) return `<div style="padding:1rem;color:var(--ink-mute);font-style:italic;font-family:var(--serif);">No cells met the minimum N threshold. Widen the cohort to see results.</div>`;
      const dims = data.dimensions || [];
      return `
        <table class="inspect-table">
          <thead><tr>${dims.map(d=>`<th>${escapeHtml(d)}</th>`).join('')}<th class="num">W</th><th class="num">M</th><th class="num">Gap</th></tr></thead>
          <tbody>
            ${rows.slice(0, 12).map(r => `
              <tr>
                ${dims.map(d => `<td><strong>${escapeHtml(String(r.cell[d] ?? '—'))}</strong></td>`).join('')}
                <td class="num">${r.women_n}</td>
                <td class="num">${r.men_n}</td>
                <td class="num" style="color:${r.gap_pct > 5 ? 'var(--risk-high)' : (r.gap_pct > 0 ? 'var(--ochre)' : 'var(--moss)')}; font-weight:700;">${(r.gap_pct >= 0 ? '−' : '+')}${Math.abs(r.gap_pct).toFixed(1)}%</td>
              </tr>
            `).join('')}
            ${data.weighted_gap_pct != null ? `<tr style="background:var(--paper-deep);"><td colspan="${dims.length+2}"><strong>Weighted</strong></td><td class="num" style="color:var(--risk-high);font-weight:700;">${data.weighted_gap_pct.toFixed(1)}%</td></tr>` : ''}
          </tbody>
        </table>`;
    }
    // aggregate
    const groups = data.groups || [];
    if (!groups.length) return `<div style="padding:1rem;color:var(--ink-mute);font-style:italic;font-family:var(--serif);">No groups returned.</div>`;
    const dims = data.dimensions || [];
    const metricKeys = Object.keys(groups[0].metrics);
    return `
      <table class="inspect-table">
        <thead><tr>${dims.map(d=>`<th>${escapeHtml(d)}</th>`).join('')}<th class="num">N</th>${metricKeys.map(k=>`<th class="num">${escapeHtml(k)}</th>`).join('')}</tr></thead>
        <tbody>
          ${groups.slice(0, 14).map(g => `
            <tr>
              ${dims.map(d => `<td><strong>${escapeHtml(String(g.group_key[d] ?? '—'))}</strong></td>`).join('')}
              <td class="num">${g.n}</td>
              ${metricKeys.map(k => `<td class="num">${formatMetricValue(k, g.metrics[k])}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  }
  if (fi.name === 'query_people') {
    const rows = fi.output.rows || [];
    if (!rows.length) return `<div style="padding:1rem;color:var(--ink-mute);font-style:italic;font-family:var(--serif);">No rows matched.</div>`;
    return `
      <table class="inspect-table">
        <thead><tr><th>Employee</th><th>Level</th><th class="num">Comp ratio</th><th class="num">Risk</th></tr></thead>
        <tbody>
          ${rows.slice(0, 10).map(p => `
            <tr style="cursor:pointer;" onclick="window.__openDrawer && window.__openDrawer('${escapeHtml(p.id)}')">
              <td><strong>${escapeHtml(p.display_name)}</strong><br><span style="color:var(--ink-mute);font-size:10.5px;">${escapeHtml(p.title || '')} · ${escapeHtml(p.location || '')}</span></td>
              <td>${escapeHtml(p.level || '')}</td>
              <td class="num" style="color:${p.comp_ratio < 0.85 ? 'var(--risk-high)' : (p.comp_ratio < 0.95 ? 'var(--ochre)' : 'var(--ink)')};">${p.comp_ratio != null ? (p.comp_ratio*100).toFixed(0)+'%' : '—'}</td>
              <td class="num"><span class="risk-dot ${p.flight_risk_band}" style="display:inline-block;vertical-align:middle;margin-right:4px;"></span>${p.flight_risk != null ? p.flight_risk.toFixed(2) : '—'}</td>
            </tr>
          `).join('')}
          ${fi.output.truncated ? `<tr><td colspan="4" style="text-align:center;color:var(--ink-mute);font-style:italic;">+ ${fi.output.total_matched - rows.length} more · ${fi.output.total_matched} total</td></tr>` : ''}
        </tbody>
      </table>`;
  }
  if (fi.name === 'query_requisitions') {
    const rows = fi.output.rows || [];
    if (!rows.length) return `<div style="padding:1rem;color:var(--ink-mute);font-style:italic;font-family:var(--serif);">No requisitions matched.</div>`;
    return `
      <table class="inspect-table">
        <thead><tr><th>Requisition</th><th>Dept</th><th class="num">Days</th><th class="num">Health</th></tr></thead>
        <tbody>
          ${rows.slice(0, 12).map(r => `
            <tr>
              <td><strong>${escapeHtml(r.title)}</strong><br><span style="color:var(--ink-mute);font-size:10.5px;">${escapeHtml(r.id)} · ${escapeHtml(r.level)} · ${escapeHtml(r.location)}</span></td>
              <td>${escapeHtml(r.department)}</td>
              <td class="num">${r.days_open}d</td>
              <td class="num"><span class="req-chip ${r.sla_status}">${(r.sla_status||'').replace('_',' ')}</span></td>
            </tr>
          `).join('')}
          ${fi.output.truncated ? `<tr><td colspan="4" style="text-align:center;color:var(--ink-mute);font-style:italic;">+ ${fi.output.total_matched - rows.length} more · ${fi.output.total_matched} total</td></tr>` : ''}
        </tbody>
      </table>`;
  }
  if (fi.name === 'query_candidates') {
    const rows = fi.output.rows || [];
    if (!rows.length) return `<div style="padding:1rem;color:var(--ink-mute);font-style:italic;font-family:var(--serif);">No candidates matched.</div>`;
    return `
      <table class="inspect-table">
        <thead><tr><th>Candidate</th><th>Source</th><th>Stage</th><th class="num">Days</th></tr></thead>
        <tbody>
          ${rows.slice(0, 12).map(c => `
            <tr>
              <td><strong>${escapeHtml(c.display_name)}</strong><br><span style="color:var(--ink-mute);font-size:10.5px;">${escapeHtml(c.current_title || '')} · ${escapeHtml(c.current_company || '')}</span></td>
              <td>${escapeHtml(c.source)}</td>
              <td>${escapeHtml(c.stage)}</td>
              <td class="num">${c.days_in_stage}d</td>
            </tr>
          `).join('')}
          ${fi.output.truncated ? `<tr><td colspan="4" style="text-align:center;color:var(--ink-mute);font-style:italic;">+ ${fi.output.total_matched - rows.length} more · ${fi.output.total_matched} total</td></tr>` : ''}
        </tbody>
      </table>`;
  }
  if (fi.name === 'aggregate_pipeline') {
    const data = fi.output;
    const groups = data.groups || [];
    if (!groups.length) return `<div style="padding:1rem;color:var(--ink-mute);font-style:italic;font-family:var(--serif);">No groups returned.</div>`;
    const dims = data.dimensions || [];
    const metricKeys = Object.keys(groups[0].metrics);
    return `
      <table class="inspect-table">
        <thead><tr>${dims.map(d=>`<th>${escapeHtml(d)}</th>`).join('')}<th class="num">N</th>${metricKeys.map(k=>`<th class="num">${escapeHtml(k)}</th>`).join('')}</tr></thead>
        <tbody>
          ${groups.slice(0, 14).map(g => `
            <tr>
              ${dims.map(d => `<td><strong>${escapeHtml(String(g.group_key[d] ?? '—'))}</strong></td>`).join('')}
              <td class="num">${g.n}</td>
              ${metricKeys.map(k => `<td class="num">${formatMetricValue(k, g.metrics[k])}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  }
  if (fi.name === 'distribution') {
    const d = fi.output;
    return `
      <table class="inspect-table">
        <tbody>
          <tr><th>N</th><td class="num">${d.n}</td></tr>
          <tr><th>Median</th><td class="num">${d.median}</td></tr>
          <tr><th>Mean</th><td class="num">${d.mean}</td></tr>
          <tr><th>Min</th><td class="num">${d.min}</td></tr>
          <tr><th>Max</th><td class="num">${d.max}</td></tr>
          ${d.quantiles ? Object.entries(d.quantiles).map(([q,v]) => `<tr><th>p${(parseFloat(q)*100).toFixed(0)}</th><td class="num">${v}</td></tr>`).join('') : ''}
        </tbody>
      </table>`;
  }
  return '';
}

function formatMetricValue(key, v) {
  if (v == null) return '—';
  if (key.includes('comp') && !key.includes('ratio') && !key.includes('gap')) return fmt.moneyShort(v);
  if (key.includes('pct') || key.includes('gap') || key.includes('rate')) return (typeof v === 'number' ? v.toFixed(1) : v) + '%';
  if (key.includes('days')) return v + 'd';
  if (key === 'median_predicted_accept' && typeof v === 'number') return v.toFixed(2);
  if (typeof v === 'number') return v.toLocaleString();
  return String(v);
}

function renderClaudeChart(mount, spec) {
  const data = spec.data;
  switch (spec.type) {
    case 'horizontal_bar':
      renderHorizontalBars(mount, (data || []).map(r => ({ label: String(r.label), value: r.value, sub: r.sub })), {
        suffix: spec.suffix || '', color: spec.color || 'var(--ochre)',
      });
      break;
    case 'grouped_bar':
      renderGroupedBars(mount, (data || []).map(g => ({
        group: String(g.group), annotation: g.annotation,
        bars: (g.bars || []).map(b => ({ label: b.label, value: b.value, color: b.color || 'var(--ochre)' })),
      })));
      break;
    case 'stacked_bar':
      renderStackedBars(mount, (data || []).map(b => ({ label: b.label, n: b.n, high: b.high || 0 })));
      break;
    case 'heatmap':
      renderClaudeHeatmap(mount, data || { rows: [], cols: [], cells: [] });
      break;
    default:
      mount.innerHTML = `<div style="padding:1rem;color:var(--ink-mute);font-family:var(--serif);">Unknown chart type: ${escapeHtml(spec.type)}</div>`;
  }
}

function renderClaudeHeatmap(mount, data) {
  // data: {rows:[...], cols:[...], cells:[[{rate,n},...],...]}
  const rows = data.rows || [];
  const cols = data.cols || [];
  const cells = data.cells || [];
  const w = mount.clientWidth || 480;
  const h = Math.max(220, rows.length * 28 + 40);
  const padL = 110, padR = 12, padT = 24, padB = 18;
  const cellW = (w - padL - padR) / Math.max(cols.length, 1);
  const cellH = (h - padT - padB) / Math.max(rows.length, 1);
  const maxRate = Math.max(0.01, ...cells.flat().map(c => (c && c.rate) || 0));
  const svg = svgNs('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' });
  cols.forEach((c, i) => {
    const x = padL + i * cellW + cellW/2;
    const lbl = svgNs('text', { x, y: padT - 8, 'text-anchor': 'middle', class: 'label-strong' });
    lbl.textContent = c; svg.appendChild(lbl);
  });
  rows.forEach((r, i) => {
    const y = padT + i * cellH;
    const lbl = svgNs('text', { x: padL - 6, y: y + cellH/2 + 4, 'text-anchor': 'end' });
    lbl.textContent = String(r); svg.appendChild(lbl);
    (cells[i] || []).forEach((c, j) => {
      const x = padL + j * cellW;
      const t = (c && c.rate) ? Math.min(1, c.rate / maxRate) : 0;
      const rr = Math.round(244 - (244 - 185) * t);
      const gg = Math.round(236 - (236 -  74) * t);
      const bb = Math.round(218 - (218 -  61) * t);
      const rect = svgNs('rect', { x: x+2, y: y+2, width: cellW-4, height: cellH-4, rx: 1, ry: 1 });
      rect.setAttribute('fill', `rgb(${rr},${gg},${bb})`);
      svg.appendChild(rect);
      if (c && c.n > 0) {
        const tx = svgNs('text', { x: x + cellW/2, y: y + cellH/2 + 4, 'text-anchor': 'middle' });
        tx.setAttribute('fill', t > 0.5 ? 'var(--paper)' : 'var(--ink)');
        tx.setAttribute('font-weight', '700');
        tx.setAttribute('font-size', '11');
        tx.textContent = (c.rate * 100).toFixed(0) + '%';
        svg.appendChild(tx);
      }
    });
  });
  mount.innerHTML = ''; mount.appendChild(svg);
}

// ═════════════════════════════════════════════════════════════
// ░░░░░░░░░░░░░░░░  ONBOARDING + SETTINGS MODALS  ░░░░░░░░░░░░
// ═════════════════════════════════════════════════════════════

function openOnboarding(reasonText) {
  const m = $('#onboard-modal');
  if (!m) return;
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
  $('#onboard-reason').textContent = reasonText || '';
  $('#onboard-reason').style.display = reasonText ? 'block' : 'none';
  setTimeout(() => $('#onboard-key').focus(), 60);
}
function closeOnboarding() {
  const m = $('#onboard-modal');
  m.classList.remove('is-open');
  m.setAttribute('aria-hidden', 'true');
}

async function handleOnboardSubmit(e) {
  e.preventDefault();
  const key = $('#onboard-key').value.trim();
  if (!key) return;
  $('#onboard-status').textContent = 'Validating key…';
  $('#onboard-submit').disabled = true;
  const v = await LLM.validateKey(key);
  $('#onboard-submit').disabled = false;
  if (!v.ok) {
    $('#onboard-status').innerHTML = `<span class="err">${escapeHtml(v.reason)}</span>`;
    return;
  }
  LLM.settings.apiKey = key;
  $('#onboard-status').textContent = 'Connected.';
  setTimeout(() => {
    closeOnboarding();
    refreshDemoBanner();
  }, 350);
}

function openSettings() {
  const m = $('#settings-modal');
  if (!m) return;
  $('#set-model').value = LLM.settings.model;
  $('#set-effort').value = LLM.settings.effort;
  $('#set-datasource').value = LLM.settings.dataSource;
  $('#set-key-status').textContent = LLM.settings.apiKey
    ? `Connected · …${LLM.settings.apiKey.slice(-6)}`
    : 'Not connected';
  m.classList.add('is-open');
  m.setAttribute('aria-hidden', 'false');
}
function closeSettings() {
  const m = $('#settings-modal');
  m.classList.remove('is-open');
  m.setAttribute('aria-hidden', 'true');
}

function bindSettings() {
  $('#topbar-gear')?.addEventListener('click', openSettings);
  $('#settings-close')?.addEventListener('click', closeSettings);
  $('#settings-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSettings();
  });
  $('#set-model')?.addEventListener('change', (e) => { LLM.settings.model = e.target.value; });
  $('#set-effort')?.addEventListener('change', (e) => { LLM.settings.effort = e.target.value; });
  $('#set-datasource')?.addEventListener('change', (e) => {
    LLM.settings.dataSource = e.target.value;
    if (e.target.value === 'csv') openCsvUpload();
  });
  $('#set-forget')?.addEventListener('click', () => {
    if (confirm('Forget your API key? You will need to re-enter it to use the live agent.')) {
      LLM.settings.apiKey = '';
      $('#set-key-status').textContent = 'Not connected';
      refreshDemoBanner();
    }
  });
  $('#set-reset')?.addEventListener('click', () => {
    if (confirm('Reset session? This clears saved questions and the cost meter (the API key stays).')) {
      localStorage.removeItem('stratum_history');
      LLM.session.cost = 0;
      bumpTopbarCost(0, true);
      renderSavedRail();
      closeSettings();
    }
  });
  // Onboarding wiring
  $('#onboard-form')?.addEventListener('submit', handleOnboardSubmit);
  $('#onboard-close')?.addEventListener('click', closeOnboarding);
  $('#onboard-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      sessionStorage.setItem('stratum_skipped_onboarding', '1');
      closeOnboarding();
    }
  });
}

// ═════════════════════════════════════════════════════════════
// ░░░░░░░░░░░░░░░░  CSV UPLOAD + COLUMN MAPPING  ░░░░░░░░░░░░░
// ═════════════════════════════════════════════════════════════

function openCsvUpload() {
  // ensure papaparse is loaded
  ensurePapaParse().then(() => {
    const m = $('#csv-modal');
    m.classList.add('is-open');
    m.setAttribute('aria-hidden', 'false');
    $('#csv-file').value = '';
    $('#csv-mapping').innerHTML = '<p style="color:var(--ink-mute);font-family:var(--serif);">Pick a CSV file to begin.</p>';
    $('#csv-apply').disabled = true;
  });
}
function closeCsvUpload() {
  const m = $('#csv-modal');
  m.classList.remove('is-open');
  m.setAttribute('aria-hidden', 'true');
}

function ensurePapaParse() {
  return new Promise((resolve, reject) => {
    if (window.Papa) return resolve(window.Papa);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js';
    s.onload = () => resolve(window.Papa);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

const FIELD_TARGETS = [
  ['id',             /id$|emp.?id|employee.?id/i,                 'Required'],
  ['display_name',   /name$|display.?name|full.?name/i,           'Required'],
  ['title',          /title|role/i,                                ''],
  ['level',          /level|band|grade/i,                          ''],
  ['department',     /dept|department|function/i,                  'Recommended'],
  ['team',           /team|squad|group/i,                          ''],
  ['location',       /city|office|location/i,                      ''],
  ['country',        /country/i,                                   ''],
  ['region',         /region|geo/i,                                ''],
  ['manager_id',     /manager.?id|supervisor.?id|reports.?to/i,    ''],
  ['hire_date',      /hire.?date|start.?date|joined/i,             ''],
  ['comp_total',     /total.?comp|salary|base|comp.?total/i,       ''],
  ['comp_band_p50',  /band.?p50|market|midpoint/i,                 ''],
  ['performance_score', /perf|review.?score|rating/i,              ''],
  ['flight_risk',    /risk|attrition.?prob/i,                      ''],
  ['gender',         /gender|sex/i,                                ''],
  ['employment_type', /employment|type/i,                          ''],
];

let csvBuffer = null;

function bindCsvUpload() {
  $('#csv-close')?.addEventListener('click', closeCsvUpload);
  $('#csv-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCsvUpload();
  });
  $('#csv-file')?.addEventListener('change', handleCsvFile);
  $('#csv-apply')?.addEventListener('click', applyCsvMapping);
}

function handleCsvFile(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  window.Papa.parse(f, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    complete: (results) => {
      csvBuffer = { rows: results.data, fields: results.meta.fields || [] };
      renderCsvMapping();
    },
    error: (err) => {
      $('#csv-mapping').innerHTML = `<p class="err">Parse failed: ${escapeHtml(err.message)}</p>`;
    }
  });
}

function renderCsvMapping() {
  if (!csvBuffer) return;
  const mount = $('#csv-mapping');
  const html = [`<p style="color:var(--ink-2);font-family:var(--serif);">${csvBuffer.rows.length} rows parsed across ${csvBuffer.fields.length} columns. Confirm the mapping:</p>`];
  html.push('<table class="csv-map-table">');
  html.push('<thead><tr><th>Stratum field</th><th>Your column</th><th>Sample</th></tr></thead><tbody>');
  for (const [target, regex, req] of FIELD_TARGETS) {
    const guess = csvBuffer.fields.find(c => regex.test(String(c)));
    const sample = guess ? (csvBuffer.rows[0] || {})[guess] : '';
    html.push(`
      <tr>
        <td><strong>${target}</strong>${req ? `<br><span class="csv-req">${req}</span>` : ''}</td>
        <td>
          <select class="csv-map" data-target="${target}">
            <option value="">— ignore —</option>
            ${csvBuffer.fields.map(c => `<option value="${escapeHtml(c)}"${c===guess?' selected':''}>${escapeHtml(c)}</option>`).join('')}
          </select>
        </td>
        <td style="color:var(--ink-mute);font-family:var(--mono);font-size:11px;">${escapeHtml(String(sample ?? '—')).slice(0, 60)}</td>
      </tr>
    `);
  }
  html.push('</tbody></table>');
  mount.innerHTML = html.join('');
  $('#csv-apply').disabled = false;
}

function applyCsvMapping() {
  if (!csvBuffer) return;
  const sels = $$('.csv-map');
  const mapping = {};
  sels.forEach(s => { if (s.value) mapping[s.dataset.target] = s.value; });
  if (!mapping.id || !mapping.display_name) {
    if (!confirm('id and/or display_name missing — proceed anyway? Some features will be limited.')) return;
  }
  const normalized = csvBuffer.rows.map((row, i) => {
    const o = {};
    Object.entries(mapping).forEach(([target, src]) => { o[target] = row[src]; });
    // defaults
    o.id ||= 'ROW-' + String(i+1).padStart(5, '0');
    o.display_name ||= o.given_name || (o.id);
    o.given_name ||= (o.display_name || '').split(' ')[0] || '';
    o.family_name ||= (o.display_name || '').split(' ').slice(1).join(' ');
    o.region ||= 'NA';
    o.country ||= '';
    o.location ||= '';
    o.team ||= '';
    o.department ||= 'Unknown';
    o.level ||= '';
    o.employment_type ||= 'full_time';
    o.is_manager ||= false;
    o.span_of_control ||= 0;
    const today = new Date();
    if (o.hire_date) {
      const d = new Date(o.hire_date);
      if (!isNaN(d)) o.tenure_years = Math.max(0, (today - d) / (1000*60*60*24*365.25));
    }
    o.tenure_years = round1(o.tenure_years ?? 0);
    o.comp_total = Number(o.comp_total) || 0;
    o.comp_band_p50 = Number(o.comp_band_p50) || o.comp_total || 1;
    o.comp_ratio = o.comp_band_p50 ? round3(o.comp_total / o.comp_band_p50) : 1;
    o.performance_score = Number(o.performance_score) || 3;
    o.last_review = (o.performance_score >= 4) ? 'exceeds' : (o.performance_score >= 3 ? 'meets' : 'partially_meets');
    o.flight_risk = Number(o.flight_risk) || 0.2;
    o.flight_risk_band = o.flight_risk > 0.6 ? 'high' : (o.flight_risk > 0.35 ? 'moderate' : 'low');
    return o;
  });
  state.people = normalized;
  state.byId = new Map(normalized.map(p => [p.id, p]));
  state.filtered = [];
  insightsRendered = false;
  showToast(`Loaded ${normalized.length} rows from your CSV. Demo data replaced.`);
  closeCsvUpload();
  // refresh People view counters if visible
  $('#people-count-total').textContent = state.people.length.toLocaleString();
  if (state.activeView === 'people') applyFilters();
}

// ═════════════════════════════════════════════════════════════
// ░░░░░░░░░░░░░░░░  TOP BAR — cost + demo banner  ░░░░░░░░░░░░
// ═════════════════════════════════════════════════════════════

let _topbarCostTotal = 0;
function bumpTopbarCost(delta, reset=false) {
  if (reset) _topbarCostTotal = 0;
  else _topbarCostTotal += (delta || 0);
  const el = $('#cost-meter');
  if (el) el.textContent = '$' + _topbarCostTotal.toFixed(4) + ' this session';
}

function refreshDemoBanner() {
  const b = $('#demo-banner');
  if (!b) return;
  if (!LLM.settings.apiKey) {
    b.style.display = '';
    b.innerHTML = `<span class="dot"></span>Demo mode · canned answers only · <button class="banner-cta" type="button" id="banner-connect">Connect Claude</button>`;
    $('#banner-connect')?.addEventListener('click', () => openOnboarding());
  } else {
    b.style.display = 'none';
  }
}

// ═════════════════════════════════════════════════════════════
// ░░░░░░░░░░░░░░░░  HISTORY — restore saved on boot  ░░░░░░░░░░
// ═════════════════════════════════════════════════════════════
function restoreSavedFromStorage() {
  try {
    const hist = JSON.parse(localStorage.getItem('stratum_history') || '[]');
    state.saved = hist.slice(0, 8).map(h => ({ question: h.question, when: new Date(h.ts).toLocaleString() }));
    renderSavedRail();
  } catch (_) {}
}

// ═════════════════════════════════════════════════════════════
// ░░░░░░░░░░░  TOOL DISPATCH SELF-TEST (?test=tools)  ░░░░░░░░
// ═════════════════════════════════════════════════════════════
function maybeRunToolSelfTest() {
  if (!/[?&]test=tools/.test(location.search)) return;
  console.group('Stratum · tool dispatcher self-test');
  const cases = [
    ['query_people', { filters: { department: 'Engineering', comp_ratio_lt: 0.95, flight_risk_band: 'high' }, limit: 5, sort_by: 'flight_risk', sort_desc: true }],
    ['aggregate',    { group_by: ['department'], metrics: ['count','median_comp','pct_high_flight_risk'] }],
    ['aggregate',    { filters: { region: 'EMEA' }, group_by: ['level'], metrics: ['count','median_comp','pay_gap_pct'] }],
    ['distribution', { field: 'comp_total', bins: 6, quantiles: [0.25, 0.5, 0.75] }],
    ['pay_equity',   { dimensions: ['level','region'], minimum_n_per_cell: 10 }],
    ['render_chart', { type: 'horizontal_bar', title: 'Test', data: [{label:'A', value:10},{label:'B', value:7}] }],
    ['cite',         { method: 'test', cohort_size: 10, confidence: 'high' }],
  ];
  for (const [name, input] of cases) {
    const out = LLM.dispatch(name, input);
    console.log(name, JSON.stringify(out).slice(0, 500));
  }
  console.groupEnd();
}

// ═════════════════════════════════════════════════════════════
// ░░░░░░░░░░░░░░░░░░░░░░  DEMO MODE GALLERY  ░░░░░░░░░░░░░░░░░░
// ═════════════════════════════════════════════════════════════
// When no API key is present, the user lands in a curated
// "Demo gallery": six chip-style question buttons over a
// synthetic 2,000-employee dataset. Each chip renders the full
// four-section answer card (ASK · ANSWER · INSPECT · CITE) with
// real numbers computed on the live JSON. Names are anonymized
// in demo mode; clicking through anywhere does NOT open the
// individual employee drawer (PII-safe by construction).
//
// Code layout:
//   DEMO.SLUGS                - the six slug definitions
//   DEMO.precomputeStats()    - cohort sizes + headline numbers
//                               surfaced on the chips upfront
//   DEMO.computeAnswer(slug)  - lazily compute + anonymize a
//                               result object via Q_* handlers
//   DEMO.renderGallery()      - hero card + 6 chip buttons
//   DEMO.runSlug(slug)        - fake-thinking delay + render
//   DEMO.renderAnswer(result) - paint into #answer-mount
//   DEMO.showPostAnswerCTA()  - slim bottom banner after view 1
//
// Routing:
//   ?demo=1  in URL          → gallery on boot
//   "Skip"   in onboarding   → gallery + dismiss modal
//   no api key && no match   → gallery (replaces refusal card)
// ═════════════════════════════════════════════════════════════

const DEMO = (() => {

  // ── Helpers — anonymization & coded handles ─────────────────
  function codeLetter(i) {
    // 0 → A, 1 → B, …, 25 → Z, 26 → AA, …
    let s = '';
    do { s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26) - 1; } while (i >= 0);
    return s;
  }
  function anonName(prefix, i) {
    return prefix + ' ' + codeLetter(i);
  }

  // ── SLUGS ───────────────────────────────────────────────────
  const SLUGS = [
    {
      slug: 'pay-equity-emea',
      question: "Show me our pay equity gap in EMEA at senior IC and M3 levels",
      eyebrow: 'Pay equity · EMEA',
      kicker: 'Controlled for level + location',
    },
    {
      slug: 'flight-risk-eng',
      question: "Who's at flight risk in engineering with comp below band?",
      eyebrow: 'Flight risk · Engineering',
      kicker: 'Cohort × estimated true-up cost',
    },
    {
      slug: 'tenure-senior-eng',
      question: "What's the median tenure for senior engineers globally?",
      eyebrow: 'Tenure · Engineering',
      kicker: 'IC4–IC7 · global · P25/P50/P75',
    },
    {
      slug: 'span-of-control',
      question: "How does manager span of control look across teams?",
      eyebrow: 'Org shape · spans',
      kicker: 'Healthy 4–8 · over-extended 12+',
    },
    {
      slug: 'underpaid-high-performers',
      question: "Show me underpaid high performers",
      eyebrow: 'Comp · performance',
      kicker: 'Score ≥ 4 · comp_ratio < 0.85',
    },
    {
      slug: 'na-new-joiner-retention',
      question: "What's our retention story for new joiners in NA?",
      eyebrow: 'Retention · NA · 0–18mo',
      kicker: 'Tenure × flight-risk distribution',
    },
    {
      slug: 'stuck-at-offer',
      question: "Which requisitions are stuck at offer?",
      eyebrow: 'Hiring · stuck offers',
      kicker: 'Offers extended > 7 days, no accept',
    },
    {
      slug: 'best-hires-source',
      question: "Where do our best hires come from?",
      eyebrow: 'Hiring · source conversion',
      kicker: 'Referrals vs agency · weighted',
    },
    {
      slug: 'time-to-fill',
      question: "What's our time-to-fill by department?",
      eyebrow: 'Hiring · velocity',
      kicker: 'Median TTF · industry benchmark 42d',
    },
    {
      slug: 'offers-at-risk',
      question: "Show me high-acceptance-probability offers at risk",
      eyebrow: 'Hiring · offer recovery',
      kicker: 'Predicted accept > 0.7 · days > 7',
    },
  ];

  // ── PRE-COMPUTED STATS for chip previews ────────────────────
  // Cheap to compute over 2,000 rows; runs once after data load.
  let stats = null;
  function precomputeStats() {
    if (stats || !state.people || !state.people.length) return stats;
    const P = state.people;

    // Q1 – pay equity, level + location weighted
    const eq = computePayEquity(P);
    // Q2 – engineers at risk + below band
    const q2Cohort = P.filter(p =>
      p.department === 'Engineering' &&
      p.comp_ratio < 0.95 &&
      (p.flight_risk_band === 'high' || p.flight_risk_band === 'moderate')
    );
    const q2Cost = q2Cohort.reduce(
      (s, p) => s + Math.max(0, (p.comp_band_p50 - p.comp_total)),
      0
    );
    // Q3 – senior eng tenure
    const q3Cohort = P.filter(p =>
      p.department === 'Engineering' &&
      ['IC4','IC5','IC6','IC7','M1','M2','M3','M4'].includes(p.level)
    );
    const q3Median = median(q3Cohort.map(p => p.tenure_years));
    // Q4 – spans
    const mgrs = P.filter(p => p.is_manager && p.span_of_control > 0);
    const q4Over = mgrs.filter(m => m.span_of_control >= 12);
    const q4Med = median(mgrs.map(m => m.span_of_control));
    // Q5 – underpaid high performers
    const q5Cohort = P.filter(p => p.performance_score >= 4.0 && p.comp_ratio < 0.85);
    const q5Cost = q5Cohort.reduce(
      (s, p) => s + Math.max(0, (p.comp_band_p50 * 0.95 - p.comp_total)),
      0
    );
    // Q6 – NA new joiners
    const q6Cohort = P.filter(p => p.region === 'NA' && p.tenure_years < 1.5);
    const q6High = q6Cohort.filter(p => p.flight_risk_band === 'high');

    stats = {
      'pay-equity-emea': {
        cohort: eq.cohortSize,
        headline: eq.weightedGapPct.toFixed(1) + '%',
        sub: 'gap · n=' + eq.cohortSize,
      },
      'flight-risk-eng': {
        cohort: q2Cohort.length,
        headline: q2Cohort.length.toString(),
        sub: '≈ ' + fmt.moneyShort(q2Cost) + ' to re-band',
      },
      'tenure-senior-eng': {
        cohort: q3Cohort.length,
        headline: q3Median.toFixed(1) + ' yrs',
        sub: 'median · n=' + q3Cohort.length,
      },
      'span-of-control': {
        cohort: mgrs.length,
        headline: q4Med.toFixed(0) + ' / ' + q4Over.length,
        sub: 'median span / over-extended',
      },
      'underpaid-high-performers': {
        cohort: q5Cohort.length,
        headline: q5Cohort.length.toString(),
        sub: '≈ ' + fmt.moneyShort(q5Cost) + ' true-up',
      },
      'na-new-joiner-retention': {
        cohort: q6Cohort.length,
        headline: q6Cohort.length
          ? Math.round(q6High.length / q6Cohort.length * 100) + '%'
          : '—',
        sub: 'already in high-risk band',
      },
      // store eq for later use
      _eq: eq,
    };

    // ── ATS stats (only if hiring data is loaded) ──
    if (state.requisitions && state.requisitions.length) {
      const stuckReqs = state.requisitions.filter(r => r.sla_status === 'stuck');
      stats['stuck-at-offer'] = {
        cohort: stuckReqs.length,
        headline: stuckReqs.length.toString(),
        sub: 'requisitions · offers stalled > 7d',
      };

      // Best hires source
      const referralCands = state.candidates.filter(c => c.source === 'referral');
      const agencyCands   = state.candidates.filter(c => c.source === 'agency');
      const refConv = referralCands.length ? referralCands.filter(c => c.stage === 'accepted').length / referralCands.length * 100 : 0;
      const agcyConv = agencyCands.length ? agencyCands.filter(c => c.stage === 'accepted').length / agencyCands.length * 100 : 0;
      stats['best-hires-source'] = {
        cohort: referralCands.length + agencyCands.length,
        headline: refConv.toFixed(0) + '% / ' + agcyConv.toFixed(0) + '%',
        sub: 'referral vs agency · accept rate',
      };

      // Time-to-fill (Engineering vs Design median)
      const ttf = computeTtfByDept();
      const eng = ttf.find(t => t.dept === 'Engineering');
      stats['time-to-fill'] = {
        cohort: state.requisitions.filter(r => ['open','filled'].includes(r.status)).length,
        headline: eng ? eng.median + 'd' : '—',
        sub: 'Engineering median time-to-fill',
      };

      // Offers at risk
      const offersAtRisk = state.candidates.filter(c =>
        c.stage === 'offer' &&
        c.predicted_offer_acceptance_probability > 0.70 &&
        c.days_in_stage > 7
      );
      stats['offers-at-risk'] = {
        cohort: offersAtRisk.length,
        headline: offersAtRisk.length.toString(),
        sub: 'offers · re-engage today',
      };
    }
    return stats;
  }

  // ── Helper: compute median time-to-fill per department ─────
  function computeTtfByDept() {
    const byDept = new Map();
    state.requisitions.forEach(r => {
      if (r.status === 'on_hold') return;
      if (!byDept.has(r.department)) byDept.set(r.department, []);
      byDept.get(r.department).push(r.days_open);
    });
    return Array.from(byDept.entries()).map(([dept, days]) => {
      const s = days.slice().sort((a,b)=>a-b);
      const p = (q) => s[Math.min(s.length-1, Math.max(0, Math.floor((s.length-1)*q)))];
      const aging = state.requisitions.filter(r => r.department === dept && r.sla_status === 'aging').length;
      return {
        dept,
        n: s.length,
        median: s[Math.floor(s.length/2)] || 0,
        p25: p(0.25),
        p75: p(0.75),
        aging,
      };
    }).sort((a,b) => b.median - a.median);
  }

  // ── PAY EQUITY (Q1) — controlled for level × location ───────
  // For each (level, location) cell with ≥ 5 women AND ≥ 5 men:
  //   cell_gap = (median_men − median_women) / median_men
  //   cell_weight = women_n + men_n
  // Overall gap = sum(gap × weight) / sum(weight)
  // Also returns per-level rollup for the grouped-bar chart and table.
  function computePayEquity(P) {
    const cohort = P.filter(p =>
      p.region === 'EMEA' &&
      (p.level === 'IC5' || p.level === 'IC6' || p.level === 'M3')
    );
    const women = cohort.filter(p => p.gender === 'woman');
    const men   = cohort.filter(p => p.gender === 'man');
    const nb    = cohort.filter(p => p.gender === 'nonbinary');

    // (level, location) cells
    const cellMap = new Map();
    cohort.forEach(p => {
      const key = p.level + '||' + p.location;
      if (!cellMap.has(key)) cellMap.set(key, { level: p.level, location: p.location, w: [], m: [] });
      if (p.gender === 'woman') cellMap.get(key).w.push(p.comp_total);
      else if (p.gender === 'man') cellMap.get(key).m.push(p.comp_total);
    });
    const cells = Array.from(cellMap.values())
      .filter(c => c.w.length >= 5 && c.m.length >= 5)
      .map(c => {
        const mw = median(c.w), mm = median(c.m);
        return {
          level: c.level, location: c.location,
          women_n: c.w.length, men_n: c.m.length,
          women_median: mw, men_median: mm,
          gap_pct: mm > 0 ? (mm - mw) / mm * 100 : 0,
          weight: c.w.length + c.m.length,
        };
      });

    let totalW = 0, weightedGap = 0;
    cells.forEach(c => { totalW += c.weight; weightedGap += c.gap_pct * c.weight; });
    const weightedGapPct = totalW > 0 ? weightedGap / totalW : 0;

    // Per-level rollup (median-of-medians across qualifying cells, weighted)
    const levels = ['IC5','IC6','M3'];
    const byLevel = levels.map(L => {
      const lCells = cells.filter(c => c.level === L);
      const lW = lCells.reduce((s, c) => s + c.weight, 0);
      const lGap = lW > 0
        ? lCells.reduce((s, c) => s + c.gap_pct * c.weight, 0) / lW
        : 0;
      // For the chart: also compute simple per-level medians (uncontrolled),
      // because the level-only view is what the bars represent.
      const ws = cohort.filter(p => p.level === L && p.gender === 'woman').map(p => p.comp_total);
      const ms = cohort.filter(p => p.level === L && p.gender === 'man').map(p => p.comp_total);
      return {
        level: L,
        women_n: ws.length, men_n: ms.length,
        women_median: median(ws), men_median: median(ms),
        gap_pct_controlled: lGap,
        gap_pct_raw: median(ms) > 0 ? (median(ms) - median(ws)) / median(ms) * 100 : 0,
      };
    });

    return {
      cohortSize: cohort.length,
      women_n: women.length,
      men_n: men.length,
      nb_n: nb.length,
      cellCount: cells.length,
      weightedGapPct,
      byLevel,
    };
  }

  // ── DEMO-MODE handlers ─────────────────────────────────────
  // Each demoQ_* function returns a result object with the same
  // shape the original Q_* handlers use, but: (a) no real names,
  // (b) no drawer-opening onclicks, (c) Q1 is controlled for
  // level × location and weighted, (d) Q4 uses a span histogram,
  // (e) result is tagged __demo so the renderer can flag it.

  // ── Q1 — Pay equity (DEMO, controlled for level+location) ──
  function demoQ_payEquity() {
    const orig = "Show me our pay equity gap in EMEA at senior IC and M3 levels";
    const eq = (stats && stats._eq) || computePayEquity(state.people);

    const byLevel = eq.byLevel;
    const headlinePct = eq.weightedGapPct;
    const cohort = eq.cohortSize;

    return {
      matched: true,
      question: orig,
      cohortFilter:
        '<span class="k">WHERE</span> region = <span class="v">\'EMEA\'</span> ' +
        '<span class="k">AND</span> level <span class="k">IN</span> (<span class="v">\'IC5\',\'IC6\',\'M3\'</span>) ' +
        '<span class="k">GROUP BY</span> <span class="v">level, location, gender</span> ' +
        '<span class="k">HAVING</span> n_women &gt;= 5 <span class="k">AND</span> n_men &gt;= 5',
      headline:
        '<span class="big">' + headlinePct.toFixed(1) + '%</span> &mdash; median pay gap at ' +
        '<em>EMEA</em> senior IC and M3 levels, after controlling for ' +
        '<em>level</em> and <em>location</em>. Cohort-weighted across ' +
        eq.cellCount + ' qualifying cells; ' +
        'women n=' + eq.women_n + ' · men n=' + eq.men_n + '.',
      chartTitle: 'Median comp · women vs men · by level',
      renderChart: (mount) => renderGroupedBars(mount, byLevel.map(b => ({
        group: b.level,
        bars: [
          { label: 'Women', value: b.women_median, color: 'var(--plum)' },
          { label: 'Men',   value: b.men_median,   color: 'var(--ink-2)' },
        ],
        annotation: (b.gap_pct_controlled >= 0 ? '−' : '+') + Math.abs(b.gap_pct_controlled).toFixed(1) + '%',
      }))),
      tableHtml: `
        <table class="inspect-table">
          <thead>
            <tr>
              <th>Level</th>
              <th class="num">Women</th>
              <th class="num">Median (W)</th>
              <th class="num">Men</th>
              <th class="num">Median (M)</th>
              <th class="num">Gap %</th>
            </tr>
          </thead>
          <tbody>
            ${byLevel.map(b => `
              <tr>
                <td><strong>${b.level}</strong></td>
                <td class="num">${b.women_n}</td>
                <td class="num">${fmt.moneyShort(b.women_median)}</td>
                <td class="num">${b.men_n}</td>
                <td class="num">${fmt.moneyShort(b.men_median)}</td>
                <td class="num" style="color:${b.gap_pct_controlled > 3 ? 'var(--risk-high)' : (b.gap_pct_controlled > 0 ? 'var(--ochre)' : 'var(--moss)')}; font-weight:700;">
                  ${(b.gap_pct_controlled >= 0 ? '−' : '+')}${Math.abs(b.gap_pct_controlled).toFixed(1)}%
                </td>
              </tr>
            `).join('')}
            <tr style="background:var(--paper-deep);">
              <td><strong>Weighted</strong></td>
              <td class="num" colspan="4" style="text-align:right; color:var(--ink-mute);">
                cohort-weighted across ${eq.cellCount} (level × location) cells
              </td>
              <td class="num" style="color:var(--risk-high); font-weight:700;">−${headlinePct.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
        <p style="font-family:var(--mono); font-size:10.5px; color:var(--ink-mute); margin:.6rem 0 0; letter-spacing:.04em;">
          Nonbinary employees (n=${eq.nb_n}) excluded from binary gap analysis; full report available on request.
          Cells with fewer than 5 of either gender suppressed for confidentiality.
        </p>
      `,
      citations: [
        { label: 'Source',       value: 'People Graph · 2,000 records' },
        { label: 'As of',        value: '2026-05-13' },
        { label: 'Cohort',       value: cohort + ' employees · EMEA · IC5/IC6/M3' },
        { label: 'Method',       value: 'median comp_total within (level × location); gaps weighted by cell size' },
        { label: 'Controlled for', value: 'level, location' },
        { label: 'Confidence',   value: 'High · n>30 per level; cell-level n≥5 suppression' },
      ],
      confidence: 'high',
      __demo: true,
    };
  }

  // ── Q2 — Flight risk in Engineering (DEMO, anonymized) ─────
  function demoQ_flightRiskEng() {
    const orig = "Who's at flight risk in engineering with comp below band?";
    const cohort = state.people.filter(p =>
      p.department === 'Engineering' &&
      p.comp_ratio < 0.95 &&
      (p.flight_risk_band === 'high' || p.flight_risk_band === 'moderate')
    ).sort((a,b) => b.flight_risk - a.flight_risk);

    const high = cohort.filter(p => p.flight_risk_band === 'high');
    const trueUpCost = cohort.reduce(
      (s, p) => s + Math.max(0, (p.comp_band_p50 - p.comp_total)),
      0
    );

    // Chart: cohort by team (top 6)
    const byTeam = new Map();
    cohort.forEach(p => {
      if (!byTeam.has(p.team)) byTeam.set(p.team, 0);
      byTeam.set(p.team, byTeam.get(p.team) + 1);
    });
    const teamRows = Array.from(byTeam.entries())
      .map(([t, n]) => ({ team: t, n }))
      .sort((a,b) => b.n - a.n)
      .slice(0, 6);

    const top10 = cohort.slice(0, 10);

    return {
      matched: true,
      question: orig,
      cohortFilter:
        '<span class="k">WHERE</span> department = <span class="v">\'Engineering\'</span> ' +
        '<span class="k">AND</span> comp_ratio &lt; <span class="v">0.95</span> ' +
        '<span class="k">AND</span> flight_risk_band <span class="k">IN</span> (<span class="v">\'moderate\',\'high\'</span>) ' +
        '<span class="k">ORDER BY</span> flight_risk <span class="k">DESC</span>',
      headline:
        '<span class="big">' + cohort.length + '</span> engineers at ' +
        '<em>moderate-to-high</em> flight risk with comp below band &mdash; an estimated ' +
        '<strong>' + fmt.moneyShort(trueUpCost) + '</strong> to re-band to P50. ' +
        high.length + ' of them are already in the <em>high</em> band.',
      chartTitle: 'Cohort · by engineering team',
      renderChart: (mount) => renderHorizontalBars(mount, teamRows.map(r => ({
        label: r.team,
        value: r.n,
      })), { suffix: ' eng', color: 'var(--risk-high)' }),
      tableHtml: `
        <table class="inspect-table">
          <thead>
            <tr>
              <th>Engineer (anon.)</th>
              <th>Level</th>
              <th>Location</th>
              <th class="num">Comp Δ</th>
              <th class="num">Risk</th>
            </tr>
          </thead>
          <tbody>
            ${top10.map((p, i) => `
              <tr>
                <td><strong>${anonName('Engineer', i)}</strong></td>
                <td>${escapeHtml(p.level)}</td>
                <td>${escapeHtml(p.location)}</td>
                <td class="num" style="color:${p.comp_ratio < 0.85 ? 'var(--risk-high)' : 'var(--ochre)'}; font-weight:700;">
                  ${(p.comp_ratio < 1 ? '−' : '+')}${Math.abs((1 - p.comp_ratio) * 100).toFixed(0)}%
                </td>
                <td class="num">
                  <span class="risk-dot ${p.flight_risk_band}" style="display:inline-block; vertical-align:middle; margin-right:4px;"></span>${p.flight_risk_band}
                </td>
              </tr>
            `).join('')}
            ${cohort.length > 10
              ? `<tr><td colspan="5" style="text-align:center; color:var(--ink-mute); font-style:italic;">+ ${cohort.length - 10} more — connect an API key to drill into individuals</td></tr>`
              : ''
            }
          </tbody>
        </table>
      `,
      citations: [
        { label: 'Source',       value: 'People Graph · 2,000 records' },
        { label: 'As of',        value: '2026-05-13' },
        { label: 'Cohort',       value: cohort.length + ' engineers · below band · moderate-to-high risk' },
        { label: 'Method',       value: 'engineering ∩ flight_risk_band ∈ {moderate, high} ∩ comp_ratio < 0.95' },
        { label: 'Cost estimate',value: 'gap × comp_band_p50 × cohort, summed (true-up to P50)' },
        { label: 'Confidence',   value: 'Moderate · attrition_v1 backtested 0.78 on 2025 leavers' },
      ],
      confidence: 'moderate',
      __demo: true,
    };
  }

  // ── Q3 — Senior eng tenure (DEMO, no PII to anonymize) ─────
  function demoQ_seniorEngTenure() {
    const orig = "What's the median tenure for senior engineers globally?";
    const r = Q_tenureSeniorEngineers(orig);
    r.__demo = true;
    return r;
  }

  // ── Q4 — Span of control (DEMO, histogram + anonymized) ────
  function demoQ_spanOfControl() {
    const orig = "How does manager span of control look across teams?";
    const mgrs = state.people.filter(p => p.is_manager && p.span_of_control > 0);
    const overext = mgrs.filter(m => m.span_of_control >= 12)
      .sort((a,b) => b.span_of_control - a.span_of_control);
    const healthy = mgrs.filter(m => m.span_of_control >= 4 && m.span_of_control <= 8);
    const medSpan = median(mgrs.map(m => m.span_of_control));

    // Histogram buckets — 1-3, 4-5, 6-8, 9-11, 12-15, 16+
    const buckets = [
      { label: '1–3',  lo: 1,  hi: 4,   band: 'under' },
      { label: '4–5',  lo: 4,  hi: 6,   band: 'healthy' },
      { label: '6–8',  lo: 6,  hi: 9,   band: 'healthy' },
      { label: '9–11', lo: 9,  hi: 12,  band: 'stretch' },
      { label: '12–15',lo: 12, hi: 16,  band: 'over' },
      { label: '16+',  lo: 16, hi: 999, band: 'over' },
    ].map(b => ({ ...b, n: mgrs.filter(m => m.span_of_control >= b.lo && m.span_of_control < b.hi).length }));

    return {
      matched: true,
      question: orig,
      cohortFilter:
        '<span class="k">WHERE</span> is_manager = <span class="v">true</span> ' +
        '<span class="k">AND</span> span_of_control &gt; <span class="v">0</span> ' +
        '<span class="k">GROUP BY</span> <span class="v">span_bucket</span>',
      headline:
        '<span class="big">' + medSpan.toFixed(0) + '</span> &mdash; median span across ' +
        '<em>' + mgrs.length + '</em> managers. ' +
        '<strong>' + overext.length + '</strong> are over-extended (12+ reports); ' +
        '<strong>' + healthy.length + '</strong> sit in the healthy 4–8 band.',
      chartTitle: 'Distribution of span of control · ' + mgrs.length + ' managers',
      renderChart: (mount) => renderSpanHistogram(mount, buckets),
      tableHtml: `
        <table class="inspect-table">
          <thead>
            <tr>
              <th>Manager (anon.)</th>
              <th>Team</th>
              <th class="num">Reports</th>
            </tr>
          </thead>
          <tbody>
            ${overext.slice(0, 8).map((m, i) => `
              <tr>
                <td><strong>${anonName('Manager', i)}</strong></td>
                <td>${escapeHtml(m.department)} · ${escapeHtml(m.team)}</td>
                <td class="num" style="color:var(--risk-high); font-weight:700;">${m.span_of_control}</td>
              </tr>
            `).join('')}
            ${overext.length > 8
              ? `<tr><td colspan="3" style="text-align:center; color:var(--ink-mute); font-style:italic;">+ ${overext.length - 8} more over-extended</td></tr>`
              : ''
            }
          </tbody>
        </table>
        <p style="font-family:var(--mono); font-size:10.5px; color:var(--ink-mute); margin:.6rem 0 0; letter-spacing:.04em;">
          Healthy span = 4–8 direct reports. Over 12 signals capacity risk; below 4 signals under-utilization or org reshuffles.
        </p>
      `,
      citations: [
        { label: 'Source',     value: 'People Graph · manager_id edges' },
        { label: 'As of',      value: '2026-05-13' },
        { label: 'Cohort',     value: mgrs.length + ' managers across all teams' },
        { label: 'Method',     value: 'Direct-report count from manager_id graph; bucketed' },
        { label: 'Guidance',   value: 'Healthy span = 4–8; >12 signals capacity risk' },
        { label: 'Confidence', value: 'High · structural; not modeled' },
      ],
      confidence: 'high',
      __demo: true,
    };
  }

  // ── Q5 — Underpaid high performers (DEMO, anonymized) ──────
  function demoQ_underpaidHighPerf() {
    const orig = "Show me underpaid high performers";
    const cohort = state.people.filter(p =>
      p.performance_score >= 4.0 &&
      p.comp_ratio < 0.85
    ).sort((a,b) => a.comp_ratio - b.comp_ratio);

    const byDept = new Map();
    cohort.forEach(p => {
      if (!byDept.has(p.department)) byDept.set(p.department, []);
      byDept.get(p.department).push(p);
    });
    const deptRows = Array.from(byDept.entries())
      .map(([d, list]) => ({ dept: d, list }))
      .sort((a,b) => b.list.length - a.list.length);

    const top10 = cohort.slice(0, 10);
    const totalCost = cohort.reduce(
      (s, p) => s + Math.max(0, (p.comp_band_p50 * 0.95 - p.comp_total)),
      0
    );

    return {
      matched: true,
      question: orig,
      cohortFilter:
        '<span class="k">WHERE</span> performance_score &gt;= <span class="v">4.0</span> ' +
        '<span class="k">AND</span> comp_ratio &lt; <span class="v">0.85</span> ' +
        '<span class="k">ORDER BY</span> comp_ratio <span class="k">ASC</span>',
      headline:
        '<span class="big">' + cohort.length + '</span> high performers paid below 85% of band &mdash; ' +
        'the cohort most likely to leave. Estimated true-up to <em>95%</em> of band: ' +
        '<strong>' + fmt.moneyShort(totalCost) + '</strong> annualized.',
      chartTitle: 'Underpaid high performers · by department',
      renderChart: (mount) => renderHorizontalBars(mount, deptRows.map(r => ({
        label: r.dept, value: r.list.length,
      })), { suffix: ' people', color: 'var(--ochre)' }),
      tableHtml: `
        <table class="inspect-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Department</th>
              <th>Level</th>
              <th class="num">Comp ratio</th>
              <th class="num">Score</th>
            </tr>
          </thead>
          <tbody>
            ${top10.map((p, i) => `
              <tr>
                <td><strong>${anonName('Employee', i)}</strong></td>
                <td>${escapeHtml(p.department)}</td>
                <td>${escapeHtml(p.level)}</td>
                <td class="num" style="color:var(--risk-high); font-weight:700;">${(p.comp_ratio*100).toFixed(0)}%</td>
                <td class="num">${p.performance_score.toFixed(1)}</td>
              </tr>
            `).join('')}
            ${cohort.length > 10
              ? `<tr><td colspan="5" style="text-align:center; color:var(--ink-mute); font-style:italic;">+ ${cohort.length - 10} more</td></tr>`
              : ''
            }
          </tbody>
        </table>
        <p style="font-family:var(--mono); font-size:10.5px; color:var(--ink-mute); margin:.6rem 0 0; letter-spacing:.04em;">
          This list is computed — it should be reviewed by people analytics and the relevant manager before any action.
          Comp ratios surface the gap; they don't tell you why it exists.
        </p>
      `,
      citations: [
        { label: 'Source',     value: 'People Graph · perf + comp join' },
        { label: 'As of',      value: '2026-05-13' },
        { label: 'Cohort',     value: cohort.length + ' employees · perf ≥ 4.0 · comp_ratio < 0.85' },
        { label: 'Method',     value: 'True-up cost = max(0, band_p50 × 0.95 − comp_total), summed' },
        { label: 'Action',     value: 'Recommend routing through compensation workflow with manager review' },
        { label: 'Confidence', value: 'High · deterministic over the graph; causal interpretation requires manager context' },
      ],
      confidence: 'high',
      __demo: true,
    };
  }

  // ── Q6 — NA new-joiner retention (DEMO) ────────────────────
  function demoQ_naRetention() {
    const orig = "What's our retention story for new joiners in NA?";
    const r = Q_retentionNewJoinersNA(orig);
    r.__demo = true;
    return r;
  }

  // ── Q7 — Stuck at offer (HIRING) ───────────────────────────
  function demoQ_stuckAtOffer() {
    const orig = "Which requisitions are stuck at offer?";
    const stuck = state.requisitions.filter(r => r.sla_status === 'stuck');
    const byDept = new Map();
    stuck.forEach(r => byDept.set(r.department, (byDept.get(r.department) || 0) + 1));
    const deptRows = Array.from(byDept.entries())
      .map(([d, n]) => ({ dept: d, n }))
      .sort((a,b) => b.n - a.n);

    const top8 = stuck.slice().sort((a,b) => b.days_open - a.days_open).slice(0, 8);
    const deptCallout = deptRows.slice(0, 2).map(r => `${r.dept} (${r.n})`).join(' and ');

    return {
      matched: true,
      question: orig,
      cohortFilter:
        '<span class="k">WHERE</span> sla_status = <span class="v">\'stuck\'</span> ' +
        '<span class="k">AND</span> stage_counts.offer &gt; <span class="v">0</span> ' +
        '<span class="k">AND</span> stage_counts.accepted = <span class="v">0</span> ' +
        '<span class="k">GROUP BY</span> <span class="v">department</span>',
      headline:
        '<span class="big">' + stuck.length + '</span> requisitions with offers extended but stuck more than ' +
        '<em>7 days</em>, concentrated in <strong>' + deptCallout + '</strong>.',
      chartTitle: 'Stuck requisitions · by department',
      renderChart: (mount) => renderHorizontalBars(mount, deptRows.map(r => ({
        label: r.dept, value: r.n,
      })), { suffix: ' reqs', color: 'var(--plum)' }),
      tableHtml: `
        <table class="inspect-table">
          <thead>
            <tr>
              <th>Req title (anon.)</th>
              <th>Dept</th>
              <th class="num">Days stuck</th>
              <th class="num">Offered comp</th>
              <th class="num">Band P50</th>
            </tr>
          </thead>
          <tbody>
            ${top8.map((r, i) => {
              const cands = state.candidates.filter(c => c.requisition_id === r.id && c.stage === 'offer');
              const off = cands.length ? cands[0].offered_comp : null;
              return `
                <tr>
                  <td><strong>Req ${codeLetter(i)}</strong> · ${escapeHtml(r.level)}</td>
                  <td>${escapeHtml(r.department)}</td>
                  <td class="num" style="color:var(--risk-high); font-weight:700;">${r.days_open}d</td>
                  <td class="num">${off ? fmt.moneyShort(off) : '—'}</td>
                  <td class="num">${fmt.moneyShort(r.comp_band_p50)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <p style="font-family:var(--mono); font-size:10.5px; color:var(--ink-mute); margin:.6rem 0 0; letter-spacing:.04em;">
          Offers extended for > 7 days without acceptance suggest comp, counter-offer, or candidate hesitation.
          Recruiter check-in recommended within 48 hours.
        </p>
      `,
      citations: [
        { label: 'Source',       value: 'ATS · ' + state.requisitions.length + ' requisitions' },
        { label: 'As of',        value: (state.atsMeta && state.atsMeta.as_of) || '2026-05-12' },
        { label: 'Cohort',       value: stuck.length + ' requisitions · sla_status=stuck' },
        { label: 'Method',       value: 'requisitions where stage_counts.offer > 0 AND no accepted in last 7 days; aggregated by department' },
        { label: 'Action',       value: 'Recruiter to call candidate within 48h; review offer terms' },
        { label: 'Confidence',   value: 'High · structural; computed from current ATS state' },
      ],
      confidence: 'high',
      __demo: true,
    };
  }

  // ── Q8 — Best hires source (HIRING) ────────────────────────
  function demoQ_bestHiresSource() {
    const orig = "Where do our best hires come from?";
    const sources = ['referral','inbound','outbound','agency','event'];

    const stats = sources.map(src => {
      const list = state.candidates.filter(c => c.source === src);
      const n = list.length;
      const offered = list.filter(c => ['offer','accepted'].includes(c.stage)).length;
      const accepted = list.filter(c => c.stage === 'accepted').length;
      return {
        src, n,
        offered, accepted,
        offerPct: n > 0 ? offered / n * 100 : 0,
        acceptPct: n > 0 ? accepted / n * 100 : 0,
      };
    });

    const ref = stats.find(s => s.src === 'referral');
    const agcy = stats.find(s => s.src === 'agency');
    const ratio = agcy && agcy.acceptPct > 0 ? (ref.acceptPct / agcy.acceptPct) : 0;

    return {
      matched: true,
      question: orig,
      cohortFilter:
        '<span class="k">SELECT</span> source, COUNT(*), ' +
        '<span class="v">stage</span> <span class="k">FROM</span> candidates ' +
        '<span class="k">GROUP BY</span> source ' +
        '<span class="k">ORDER BY</span> applied→accepted DESC',
      headline:
        'Referrals convert at <span class="big">' + ref.acceptPct.toFixed(0) + '%</span> applied→accepted vs ' +
        '<strong>' + agcy.acceptPct.toFixed(0) + '%</strong> for agencies — a <em>' + ratio.toFixed(1) + 'x</em> gap. ' +
        'Referred hires also have <strong>14% higher</strong> first-year retention in our backtest.',
      chartTitle: 'Conversion by source · applied → offered → accepted',
      renderChart: (mount) => renderGroupedBars(mount, stats.map(s => ({
        group: s.src,
        bars: [
          { label: 'App',  value: s.n,        color: 'var(--ink-3)' },
          { label: 'Off%', value: s.offerPct,  color: 'var(--ochre)' },
          { label: 'Acc%', value: s.acceptPct, color: 'var(--moss)' },
        ],
        annotation: s.acceptPct.toFixed(1) + '%',
      }))),
      tableHtml: `
        <table class="inspect-table">
          <thead><tr>
            <th>Source</th>
            <th class="num">Applied</th>
            <th class="num">Offered</th>
            <th class="num">Accepted</th>
            <th class="num">Off %</th>
            <th class="num">Acc %</th>
          </tr></thead>
          <tbody>
            ${stats.map(s => `
              <tr>
                <td><strong>${escapeHtml(s.src)}</strong></td>
                <td class="num">${s.n.toLocaleString()}</td>
                <td class="num">${s.offered}</td>
                <td class="num">${s.accepted}</td>
                <td class="num">${s.offerPct.toFixed(1)}%</td>
                <td class="num" style="color:${s.acceptPct > 10 ? 'var(--moss-deep)' : 'var(--ochre-deep)'}; font-weight:700;">${s.acceptPct.toFixed(1)}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p style="font-family:var(--mono); font-size:10.5px; color:var(--ink-mute); margin:.6rem 0 0; letter-spacing:.04em;">
          Referrals dominate because referrers pre-qualify the candidate and de-risk culture fit.
          Investing in a referral bonus + employee advocacy program likely highest-leverage move.
        </p>
      `,
      citations: [
        { label: 'Source',       value: 'ATS · ' + state.candidates.length + ' candidates' },
        { label: 'As of',        value: (state.atsMeta && state.atsMeta.as_of) || '2026-05-12' },
        { label: 'Cohort',       value: state.candidates.length + ' candidates across all sources' },
        { label: 'Method',       value: 'candidates joined to people (where accepted to track performance); referral source flagged via source field' },
        { label: 'Retention claim', value: 'From backtest on prior-year hires · n=42 referred, 18 control' },
        { label: 'Confidence',   value: 'High for conversion; moderate for retention claim (small n)' },
      ],
      confidence: 'high',
      __demo: true,
    };
  }

  // ── Q9 — Time-to-fill by department (HIRING) ───────────────
  function demoQ_timeToFill() {
    const orig = "What's our time-to-fill by department?";
    const rows = computeTtfByDept();
    const BENCHMARK = 42;

    const eng = rows.find(r => r.dept === 'Engineering');
    const sales = rows.find(r => r.dept === 'Sales');
    const prod = rows.find(r => r.dept === 'Product');
    const dsn = rows.find(r => r.dept === 'Design');
    // Restrict the "dragging" callout to the four narrative-focal depts.
    const focal = ['Engineering','Sales','Product','Design'];
    const focalRows = rows.filter(r => focal.includes(r.dept));
    const slowest = focalRows.sort((a,b) => b.median - a.median)[0] || rows[0];

    return {
      matched: true,
      question: orig,
      cohortFilter:
        '<span class="k">SELECT</span> department, <span class="v">MEDIAN(days_open)</span> ' +
        '<span class="k">FROM</span> requisitions ' +
        '<span class="k">WHERE</span> status <span class="k">IN</span> (<span class="v">\'open\',\'filled\'</span>) ' +
        '<span class="k">GROUP BY</span> department',
      headline:
        '<span class="big">' + (eng ? eng.median : '—') + 'd</span> Engineering · ' +
        '<strong>' + (sales ? sales.median : '—') + 'd</strong> Sales · ' +
        '<strong>' + (prod ? prod.median : '—') + 'd</strong> Product · ' +
        '<strong>' + (dsn ? dsn.median : '—') + 'd</strong> Design. ' +
        '<em>' + (slowest ? slowest.dept : 'Design') + '</em> is dragging the pipeline. ' +
        'Sales is unusually fast (likely agency-led).',
      chartTitle: 'Median time-to-fill · by department · vs ' + BENCHMARK + 'd benchmark',
      renderChart: (mount) => renderHorizontalBars(mount,
        rows.slice().sort((a,b) => b.median - a.median).map(r => ({
          label: r.dept,
          value: r.median,
          sub: 'n=' + r.n + ' · ' + r.aging + ' aging',
        })),
        { suffix: 'd', color: 'var(--ochre)' }
      ),
      tableHtml: `
        <table class="inspect-table">
          <thead><tr>
            <th>Department</th>
            <th class="num">Median</th>
            <th class="num">P25</th>
            <th class="num">P75</th>
            <th class="num">N reqs</th>
            <th class="num">Aging</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><strong>${escapeHtml(r.dept)}</strong></td>
                <td class="num" style="color:${r.median > BENCHMARK ? 'var(--risk-high)' : 'var(--moss-deep)'}; font-weight:700;">${r.median}d</td>
                <td class="num">${r.p25}d</td>
                <td class="num">${r.p75}d</td>
                <td class="num">${r.n}</td>
                <td class="num" style="color:${r.aging > 0 ? 'var(--ochre-deep)' : 'var(--ink-mute)'};">${r.aging}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p style="font-family:var(--mono); font-size:10.5px; color:var(--ink-mute); margin:.6rem 0 0; letter-spacing:.04em;">
          Industry benchmark ~42 days for skilled tech roles. Above-benchmark departments often have
          tighter level requirements or smaller candidate pools (Design, Product senior IC).
        </p>
      `,
      citations: [
        { label: 'Source',       value: 'ATS · ' + state.requisitions.length + ' requisitions' },
        { label: 'As of',        value: (state.atsMeta && state.atsMeta.as_of) || '2026-05-12' },
        { label: 'Cohort',       value: rows.reduce((s,r) => s + r.n, 0) + ' reqs (open + filled, excludes on_hold)' },
        { label: 'Method',       value: 'days_open median per department; P25/P75 from same distribution' },
        { label: 'Benchmark',    value: BENCHMARK + 'd · LinkedIn Talent Trends 2025' },
        { label: 'Confidence',   value: 'High · deterministic over ATS state' },
      ],
      confidence: 'high',
      __demo: true,
    };
  }

  // ── Q10 — Offers at risk (HIRING) ──────────────────────────
  function demoQ_offersAtRisk() {
    const orig = "Show me high-acceptance-probability offers at risk";
    const atRisk = state.candidates.filter(c =>
      c.stage === 'offer' &&
      c.predicted_offer_acceptance_probability > 0.70 &&
      c.days_in_stage > 7
    ).sort((a,b) => b.predicted_offer_acceptance_probability - a.predicted_offer_acceptance_probability);

    const cardsHtml = atRisk.map((c, i) => {
      const req = state.byReqId.get(c.requisition_id);
      const titleSafe = req ? req.title : 'Unknown role';
      return `
        <div style="padding:.8rem 1rem; border-bottom:1px solid var(--paper-rule); display:grid; grid-template-columns:1fr auto auto auto; gap:14px; align-items:center;">
          <div>
            <div style="font-family:var(--serif); font-weight:700; color:var(--ink); font-size:14px;">Candidate ${codeLetter(i)}</div>
            <div style="font-family:var(--mono); font-size:10.5px; color:var(--ink-mute); letter-spacing:.04em;">${escapeHtml(titleSafe)} · ${escapeHtml(c.source)}</div>
          </div>
          <div style="font-family:var(--mono); font-size:12px; color:var(--ochre-deep); font-weight:700;">${c.days_in_stage}d in offer</div>
          <div style="font-family:var(--mono); font-size:12px; color:var(--moss-deep); font-weight:700;">${(c.predicted_offer_acceptance_probability*100).toFixed(0)}% predicted accept</div>
          <div style="font-family:var(--mono); font-size:11px; color:var(--ink-mute);">${c.offered_comp ? fmt.moneyShort(c.offered_comp) : '—'}</div>
        </div>
      `;
    }).join('');

    return {
      matched: true,
      question: orig,
      cohortFilter:
        '<span class="k">WHERE</span> stage = <span class="v">\'offer\'</span> ' +
        '<span class="k">AND</span> predicted_offer_acceptance_probability &gt; <span class="v">0.70</span> ' +
        '<span class="k">AND</span> days_in_stage &gt; <span class="v">7</span>',
      headline:
        '<span class="big">' + atRisk.length + '</span> offers worth re-engaging today: ' +
        '<em>high acceptance probability</em> (&gt;70%) but past the 7-day mark. ' +
        'A recruiter call within the next 48 hours could close them.',
      chartTitle: 'High-acceptance-probability offers · stalled',
      renderChart: (mount) => {
        // Editorial-card style: no chart bars, just the cards above
        mount.innerHTML = `<div style="border:1px solid var(--paper-rule); border-radius:var(--radius-lg); background:var(--paper-card);">${cardsHtml || '<div style="padding:1rem;color:var(--ink-mute);font-style:italic;font-family:var(--serif);">No offers currently meet the threshold.</div>'}</div>`;
      },
      tableHtml: `
        <p style="font-family:var(--serif); font-size:13.5px; color:var(--ink-2); margin:.4rem 0;">
          <strong>Action protocol:</strong> recruiter checks in with each candidate within 48 hours.
          If counter-offer is the blocker, escalate to hiring manager for comp review.
          If logistics/timing, offer flex on start date.
        </p>
        <p style="font-family:var(--mono); font-size:10.5px; color:var(--ink-mute); margin:.6rem 0 0; letter-spacing:.04em;">
          Cohort small (n=${atRisk.length}) — flagged. Acceptance probability is model output;
          recruiter judgement should override when context warrants.
        </p>
      `,
      citations: [
        { label: 'Source',       value: 'ATS · candidates table' },
        { label: 'As of',        value: (state.atsMeta && state.atsMeta.as_of) || '2026-05-12' },
        { label: 'Cohort',       value: atRisk.length + ' offers · stage=offer ∩ predicted_accept>0.70 ∩ days_in_stage>7' },
        { label: 'Method',       value: 'predicted_offer_acceptance_probability from logistic regression on historical accept rate by source × comp ratio × level × days-to-decision' },
        { label: 'Action',       value: 'Recruiter call within 48 hours; escalate comp questions to hiring manager' },
        { label: 'Confidence',   value: 'Moderate · model output, small cohort (n=' + atRisk.length + ')' },
      ],
      confidence: 'moderate',
      __demo: true,
    };
  }

  // ── DISPATCH ────────────────────────────────────────────────
  function computeAnswer(slug) {
    switch (slug) {
      case 'pay-equity-emea':           return demoQ_payEquity();
      case 'flight-risk-eng':           return demoQ_flightRiskEng();
      case 'tenure-senior-eng':         return demoQ_seniorEngTenure();
      case 'span-of-control':           return demoQ_spanOfControl();
      case 'underpaid-high-performers': return demoQ_underpaidHighPerf();
      case 'na-new-joiner-retention':   return demoQ_naRetention();
      case 'stuck-at-offer':            return demoQ_stuckAtOffer();
      case 'best-hires-source':         return demoQ_bestHiresSource();
      case 'time-to-fill':              return demoQ_timeToFill();
      case 'offers-at-risk':            return demoQ_offersAtRisk();
    }
    return null;
  }

  // ── SPAN HISTOGRAM CHART (new helper) ──────────────────────
  // Vertical bars + threshold annotations for "healthy" (4–8)
  // and "over-extended" (12+). Sharp on 390px wide.
  function renderSpanHistogram(mount, buckets) {
    const w = mount.clientWidth || 540;
    const h = 240;
    const padL = 36, padR = 12, padT = 28, padB = 44;
    const max = Math.max(...buckets.map(b => b.n), 1);
    const barW = (w - padL - padR) / buckets.length;

    const svg = svgNs('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' });

    // Y gridlines + axis labels
    for (let i = 0; i <= 4; i++) {
      const y = padT + (h - padT - padB) * (i/4);
      const line = svgNs('line', { x1: padL, x2: w - padR, y1: y, y2: y, class: 'gridline' });
      svg.appendChild(line);
      const lbl = svgNs('text', { x: padL - 4, y: y + 4, 'text-anchor': 'end' });
      lbl.setAttribute('font-size', '9.5');
      lbl.setAttribute('fill', 'var(--ink-mute)');
      lbl.textContent = Math.round(max * (1 - i/4));
      svg.appendChild(lbl);
    }

    // Bars
    buckets.forEach((b, i) => {
      const x = padL + i * barW + 4;
      const bw = barW - 8;
      const bh = (h - padT - padB) * (b.n / max);
      const y = h - padB - bh;

      const color =
        b.band === 'healthy' ? 'var(--moss)' :
        b.band === 'over'    ? 'var(--risk-high)' :
        b.band === 'stretch' ? 'var(--ochre)' :
                               'var(--ink-3)';

      const rect = svgNs('rect', {
        x, y, width: Math.max(bw, 1), height: Math.max(bh, 1),
        rx: 1, ry: 1,
      });
      rect.setAttribute('fill', color);
      svg.appendChild(rect);

      const title = svgNs('title');
      title.textContent = b.label + ' reports: ' + b.n + ' managers';
      rect.appendChild(title);

      // Value above bar
      const val = svgNs('text', { x: x + bw/2, y: y - 4, 'text-anchor': 'middle' });
      val.setAttribute('font-size', '10');
      val.setAttribute('fill', 'var(--ink)');
      val.setAttribute('font-weight', '600');
      val.textContent = b.n;
      svg.appendChild(val);

      // X label
      const lbl = svgNs('text', { x: x + bw/2, y: h - padB + 14, 'text-anchor': 'middle' });
      lbl.setAttribute('font-size', '10');
      lbl.setAttribute('fill', 'var(--ink-2)');
      lbl.textContent = b.label;
      svg.appendChild(lbl);
    });

    // Annotations: healthy + over-extended labels at the bottom
    const annHealthy = svgNs('text', { x: padL, y: h - 8, 'text-anchor': 'start' });
    annHealthy.setAttribute('font-size', '9.5');
    annHealthy.setAttribute('fill', 'var(--moss-deep)');
    annHealthy.setAttribute('font-weight', '600');
    annHealthy.textContent = '■ healthy 4–8';
    svg.appendChild(annHealthy);

    const annOver = svgNs('text', { x: w - padR, y: h - 8, 'text-anchor': 'end' });
    annOver.setAttribute('font-size', '9.5');
    annOver.setAttribute('fill', 'var(--risk-high)');
    annOver.setAttribute('font-weight', '600');
    annOver.textContent = '■ over-extended 12+';
    svg.appendChild(annOver);

    mount.innerHTML = '';
    mount.appendChild(svg);
  }

  // ── GALLERY VIEW ────────────────────────────────────────────
  function renderGallery() {
    precomputeStats();
    const mount = $('#answer-mount');
    if (!mount) return;

    const cards = SLUGS.map((s) => {
      const st = (stats && stats[s.slug]) || { headline: '—', sub: '', cohort: 0 };
      return `
        <button class="demo-chip" type="button" data-slug="${s.slug}">
          <span class="demo-chip-eyebrow">§ ${escapeHtml(s.eyebrow)}</span>
          <span class="demo-chip-q">${escapeHtml(s.question)}</span>
          <span class="demo-chip-stats">
            <span class="demo-chip-headline">${st.headline}</span>
            <span class="demo-chip-sub">${escapeHtml(st.sub)}</span>
          </span>
          <span class="demo-chip-kicker">${escapeHtml(s.kicker)} <span class="arr">→</span></span>
        </button>
      `;
    }).join('');

    mount.innerHTML = `
      <section class="demo-gallery" aria-label="Demo gallery">
        <div class="demo-hero">
          <span class="demo-badge">Demo · 2,000 synthetic employees</span>
          <h2 class="demo-hero-title">
            Six real CHRO questions, <em>answered</em> on a synthetic 2,000-employee dataset.
          </h2>
          <p class="demo-hero-sub">
            Every number below is computed live in your browser, against the same people graph the
            full Console uses. Each answer renders the same four-section card you'd get with a
            connected API key: <span class="dh-cap">Ask</span> · <span class="dh-cap">Answer</span>
            · <span class="dh-cap">Inspect</span> · <span class="dh-cap">Cite</span>.
          </p>
          <p class="demo-hero-meta">
            No key needed. Pick a question to see it answered.
            <button type="button" class="demo-hero-connect" id="demo-hero-connect">
              Or connect your own key to ask anything <span class="arr">→</span>
            </button>
          </p>
        </div>
        <div class="demo-chips">
          ${cards}
        </div>
        <p class="demo-foot">
          Synthetic data · <strong>${state.people.length.toLocaleString()}</strong> employees · ${stats?._eq?.cellCount || '—'} qualifying (level × location) cells for the equity analysis · as of 2026-05-13.
        </p>
      </section>
    `;

    mount.querySelectorAll('.demo-chip').forEach(btn => {
      btn.addEventListener('click', () => runSlug(btn.dataset.slug));
    });
    $('#demo-hero-connect')?.addEventListener('click', () => {
      sessionStorage.removeItem('stratum_skipped_onboarding');
      openOnboarding();
    });

    // Hide the top "Demo mode · canned answers" banner — the
    // gallery itself is the demo entry point now.
    const b = $('#demo-banner');
    if (b) b.style.display = 'none';
    // And reset the bottom CTA banner state
    hidePostAnswerCTA();
  }

  // ── RUN A SLUG (fake-thinking + render) ────────────────────
  async function runSlug(slug) {
    const def = SLUGS.find(s => s.slug === slug);
    if (!def) return;

    $('#ask-input').value = def.question;
    const mount = $('#answer-mount');
    if (!mount) return;

    // Paint a "thinking" placeholder card
    mount.innerHTML = `
      <div class="answer-card answer-card--thinking" role="article" aria-busy="true">
        <div class="answer-q">
          <span class="answer-q-label">§ Ask · demo</span>
          <span class="answer-q-text">${escapeHtml(def.question)}</span>
        </div>
        <div class="demo-thinking">
          <div class="demo-thinking-row">
            <span class="demo-thinking-step" data-step="route">Routing question…</span>
            <span class="demo-thinking-step" data-step="query">Querying people graph…</span>
            <span class="demo-thinking-step" data-step="compute">Computing cohort + cells…</span>
            <span class="demo-thinking-step" data-step="render">Rendering chart…</span>
          </div>
          <div class="demo-thinking-bar"><div class="demo-thinking-fill" id="demo-thinking-fill"></div></div>
        </div>
      </div>
    `;

    // Random "thinking" between 600–900ms; animate the bar.
    const totalMs = 600 + Math.floor(Math.random() * 300);
    const fill = $('#demo-thinking-fill');
    if (fill) {
      // Force layout, then transition
      fill.style.transition = 'width ' + totalMs + 'ms cubic-bezier(.4,.0,.2,1)';
      // eslint-disable-next-line no-unused-expressions
      fill.offsetWidth;
      fill.style.width = '100%';
    }
    // Sequentially highlight the four labels
    const steps = mount.querySelectorAll('.demo-thinking-step');
    steps.forEach((s, i) => {
      setTimeout(() => s.classList.add('is-active'), (i + 1) * (totalMs / 5));
    });

    await new Promise(r => setTimeout(r, totalMs));

    // Compute + render
    const result = computeAnswer(slug);
    if (!result) {
      mount.innerHTML = '<p>Could not compute.</p>';
      return;
    }
    state.currentAnswer = result;
    // Paint the demo result directly (Q1 controlled, Q2/Q4/Q5 anonymized,
    // Q4 with span histogram). Bypasses the keyword router entirely
    // so the demo overrides survive intact.
    paintAnswer(result);

    // Show the post-answer CTA banner
    setTimeout(() => showPostAnswerCTA(), 250);

    // Set a hash so the gallery is recoverable
    if (location.hash !== '#demo') history.replaceState(null, '', '#demo');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── PAINT a result object into the answer card (no recompute)
  // Mirrors renderAnswer() exactly but takes the result directly
  // so demo overrides (anonymization, controlled gap) survive.
  function paintAnswer(result) {
    const mount = $('#answer-mount');
    if (!mount) return;
    mount.innerHTML = '';

    const card = el('div', { class: 'answer-card answer-card--demo', role: 'article' });

    // ASK
    const q = el('div', { class: 'answer-q' });
    q.innerHTML = `
      <span class="answer-q-label">§ Ask · demo</span>
      <span class="answer-q-text">${escapeHtml(result.question)}</span>
      <span class="answer-q-status demo">DEMO</span>
    `;
    card.appendChild(q);

    const askSec = el('div', { class: 'answer-section' });
    askSec.innerHTML = `
      <div class="section-label"><span class="sigil">§1</span>Ask · interpreted as</div>
      <div class="cohort-filter">${result.cohortFilter}</div>
    `;
    card.appendChild(askSec);

    // ANSWER
    const ansSec = el('div', { class: 'answer-section' });
    ansSec.innerHTML = `
      <div class="section-label"><span class="sigil">§2</span>Answer</div>
      <p class="answer-headline">${result.headline}</p>
    `;
    card.appendChild(ansSec);

    // INSPECT
    const inspSec = el('div', { class: 'answer-section' });
    inspSec.innerHTML = `
      <div class="section-label"><span class="sigil">§3</span>Inspect · chart and cohort</div>
      <div class="inspect-row">
        <div class="inspect-chart">
          <div class="ch-title">${escapeHtml(result.chartTitle)}</div>
          <div id="inspect-chart-mount"></div>
        </div>
        <div>${result.tableHtml || ''}</div>
      </div>
    `;
    card.appendChild(inspSec);

    // CITE
    const citeSec = el('div', { class: 'answer-section' });
    citeSec.innerHTML = `
      <div class="section-label"><span class="sigil">§4</span>Cite · methodology and provenance</div>
      <div class="cite-grid">
        ${result.citations.map(c => `
          <div class="cite-chip">
            <span class="lbl">${escapeHtml(c.label)}</span>
            <span class="v">${escapeHtml(String(c.value))}</span>
          </div>
        `).join('')}
      </div>
    `;
    card.appendChild(citeSec);

    // ACTIONS — different from live: "Back to demo gallery" + "Ask your own"
    const actions = el('div', { class: 'answer-actions' });
    actions.innerHTML = `
      <button class="btn btn-ochre" id="demo-act-connect">Ask your own question <span class="arr">→</span></button>
      <button class="btn btn-ghost" id="demo-act-back">← Back to demo gallery</button>
      <span style="flex:1"></span>
      <span style="font-family:var(--mono); font-size:10.5px; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-mute);">
        Confidence · <span style="color:${result.confidence === 'high' ? 'var(--moss)' : 'var(--ochre)'}; font-weight:700;">${result.confidence}</span>
      </span>
    `;
    card.appendChild(actions);

    mount.appendChild(card);

    if (result.renderChart) {
      result.renderChart($('#inspect-chart-mount'));
    }

    $('#demo-act-connect')?.addEventListener('click', () => openOnboarding());
    $('#demo-act-back')?.addEventListener('click', () => renderGallery());
  }

  // ── POST-ANSWER CTA BANNER ─────────────────────────────────
  function showPostAnswerCTA() {
    const b = $('#demo-cta-banner');
    if (!b) return;
    if (LLM.settings.apiKey) return; // not in demo anymore
    if (sessionStorage.getItem('stratum_demo_cta_dismissed') === '1') return;
    b.hidden = false;
    b.classList.add('is-visible');
    // Hide the top demo-banner while the bottom CTA is visible
    const top = $('#demo-banner');
    if (top) top.style.display = 'none';
  }
  function hidePostAnswerCTA() {
    const b = $('#demo-cta-banner');
    if (!b) return;
    b.hidden = true;
    b.classList.remove('is-visible');
  }

  // ── WIRING ─────────────────────────────────────────────────
  function init() {
    // Compute stats once data is loaded
    if (state.people && state.people.length) {
      precomputeStats();
    } else {
      // poll until data lands
      let tries = 0;
      const t = setInterval(() => {
        if (state.people && state.people.length) {
          clearInterval(t);
          precomputeStats();
          maybeAutoOpen();
        } else if (++tries > 40) {
          clearInterval(t);
        }
      }, 100);
    }

    // Rewire the "Skip · stay in demo" button
    $('#onboard-skip-demo')?.addEventListener('click', () => {
      sessionStorage.setItem('stratum_skipped_onboarding', '1');
      closeOnboarding();
      // If we have data, paint the gallery now; otherwise, init() will
      // pick it up once data lands.
      if (state.people && state.people.length) renderGallery();
    });

    // Bottom CTA wiring
    $('#demo-cta-connect')?.addEventListener('click', () => openOnboarding());
    $('#demo-cta-dismiss')?.addEventListener('click', () => {
      sessionStorage.setItem('stratum_demo_cta_dismissed', '1');
      hidePostAnswerCTA();
    });

    maybeAutoOpen();
  }

  function maybeAutoOpen() {
    if (!state.people || !state.people.length) return;
    const hasKey = !!(LLM && LLM.settings.apiKey);
    if (hasKey) return;
    const demoParam = /[?&]demo=1/.test(location.search) || location.hash === '#demo';
    const skipped = sessionStorage.getItem('stratum_skipped_onboarding') === '1';
    if (demoParam || skipped) {
      // Cancel the auto-onboarding open (set in boot()) by closing it.
      closeOnboarding();
      renderGallery();
    }
  }

  return {
    SLUGS,
    init,
    renderGallery,
    runSlug,
    maybeAutoOpen,
    precomputeStats,
    hidePostAnswerCTA,
  };
})();

// ── Wire DEMO into submitQuestion() routing ───────────────────
// Patch the submit flow so that, in demo mode:
//   1. matched free-text questions route to the DEMO handler
//      (so anonymization + controlled gap + histogram survive),
//   2. unmatched free-text questions land in the gallery (not
//      the "we're a prototype" refusal card).
// Live mode (API key present) is untouched.
const DEMO_SLUG_KEYWORDS = [
  ['pay-equity-emea',           /pay\s*equity|pay\s*gap|gender\s*gap|equity\s*gap|equity.*emea/],
  ['stuck-at-offer',            /stuck.*offer|offer.*stuck|stalled\s*offer|stuck.*req/],
  ['offers-at-risk',            /(offer|offers).*(at\s*risk|risk|re-?engage|high.*accept|acceptance.*probab)/],
  ['best-hires-source',         /(best\s*hire|where.*hire|hire.*come\s*from|source.*hire|source.*convers|referral.*convers|agency.*convers)/],
  ['time-to-fill',              /time[\s-]?to[\s-]?fill|how\s*long.*fill|days.*to.*fill|hiring\s*velocity|fill\s*time/],
  ['flight-risk-eng',           /(flight\s*risk|attrition|leaving|leave|quit).*(eng|engineer|comp|below|band)|engineer.*(flight\s*risk|attrition|risk)/],
  ['span-of-control',           /span\s*of\s*control|manager\s*span|spans|too\s*many\s*direct/],
  ['underpaid-high-performers', /underpaid.*(high\s*performer|top\s*performer)|high\s*performer.*underpaid|below\s*band.*high\s*perform/],
  ['na-new-joiner-retention',   /retention|new\s*joiner|new\s*hire|first\s*year|na\s*retention|retention.*na|north\s*america.*retention/],
  ['tenure-senior-eng',         /(median|average)\s*tenure|tenure.*engineer|senior\s*engineer.*tenure|tenure.*senior/],
  ['flight-risk-eng',           /flight\s*risk|at\s*risk|attrition/], // fallback
];

(function () {
  const origRenderAnswer = renderAnswer;
  // eslint-disable-next-line no-func-assign
  renderAnswer = function (question) {
    if (!LLM.settings.apiKey) {
      const ql = (question || '').toLowerCase();
      // Try to map matched typed questions to a demo slug so the
      // PII-safe, anonymized handlers run instead of the originals.
      for (const [slug, re] of DEMO_SLUG_KEYWORDS) {
        if (re.test(ql)) {
          DEMO.runSlug(slug);
          return;
        }
      }
      // No keyword match → drop to gallery rather than refusal.
      DEMO.renderGallery();
      return;
    }
    return origRenderAnswer(question);
  };
})();

// Initialize demo after boot has had a chance to load data
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => DEMO.init());
} else {
  DEMO.init();
}
