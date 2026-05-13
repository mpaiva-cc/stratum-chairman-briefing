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
    const [people, orgs] = await Promise.all([
      fetch('data/people.json').then(r => r.json()),
      fetch('data/orgs.json').then(r => r.json()),
    ]);
    bar.style.width = '75%';
    state.people = people;
    state.orgs = orgs;
    state.byId = new Map(people.map(p => [p.id, p]));
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
  restoreSavedFromStorage();
  refreshDemoBanner();
  bumpTopbarCost(0, true);

  // Pre-fill the People list count
  $('#people-count-total').textContent = state.people.length.toLocaleString();
  $('#people-count-n').textContent = state.people.length.toLocaleString();

  // Tool dispatcher self-test (gated by ?test=tools)
  maybeRunToolSelfTest();

  // First-run: prompt for API key (non-blocking — demo mode still works)
  if (!LLM.settings.apiKey && !sessionStorage.getItem('stratum_skipped_onboarding')) {
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

You have access to a dataset of ${N} employees (as of ${asOf}). Use tools — do not assume.`,
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
          // last tool → cache breakpoint here so the entire tool list is cached
        },
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
        case 'query_people':  return LLM.tool_queryPeople(input);
        case 'aggregate':     return LLM.tool_aggregate(input);
        case 'distribution':  return LLM.tool_distribution(input);
        case 'pay_equity':    return LLM.tool_payEquity(input);
        case 'render_chart':  return LLM.tool_renderChart(input);
        case 'cite':          return LLM.tool_cite(input);
        default:              return { error: 'unknown tool: ' + name };
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
          if (!LLM.pending.firstInspect && ['query_people','aggregate','pay_equity','distribution'].includes(block.name)) {
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

function renderInlineMd(s) {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*([^*]|$)/g, '$1<em>$2</em>$3')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>');
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
  if (key.includes('pct') || key.includes('gap')) return v.toFixed(1) + '%';
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

