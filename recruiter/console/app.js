/* ============================================================
   Stratum · Recruiter — prototype app
   Vanilla JS · loads from ../../console/data/
   ============================================================ */

(() => {
  'use strict';

  // ────────────────────────── STATE ────────────────────────
  const state = {
    reqs: [],
    candidates: [],
    people: [],
    peopleById: {},
    reqsById: {},

    currentView: 'dashboard',
    drawerOpen: false,
    drawerType: null,   // 'req' | 'cand' | 'offer'
    drawerActiveTab: 'overview',
    candPage: 1,
    candPerPage: 50,
    kbCardEl: null,
    kbDraggingId: null,

    filters: {
      req: { dept: '', loc: '', status: '', prio: '', hm: '', q: '' },
      cand: { stage: '', req: '', source: '', country: '', q: '' },
      kb: { req: '', q: '' }
    },
  };

  // ────────────────────────── BOOT ─────────────────────────
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const loadbar = $('#loadbar');

  async function boot() {
    setLoad(20);
    updateRtStamp();
    setInterval(updateRtStamp, 1000);

    try {
      const [reqs, cands, people] = await Promise.all([
        fetch('../../console/data/requisitions.json').then(r => r.json()),
        fetch('../../console/data/candidates.json').then(r => r.json()),
        fetch('../../console/data/people.json').then(r => r.json()),
      ]);
      state.reqs = reqs;
      state.candidates = cands;
      state.people = people;
      state.peopleById = Object.fromEntries(people.map(p => [p.id, p]));
      state.reqsById = Object.fromEntries(reqs.map(r => [r.id, r]));

      setLoad(70);
      initFilters();
      initNav();
      initShortcuts();
      initDrawer();
      initModal();
      renderAll();

      // Initial view from hash
      const hash = (location.hash || '#dashboard').replace('#', '');
      const validViews = ['dashboard','requisitions','pipeline','candidates','scheduling','offers','analytics','integrations','settings'];
      const view = validViews.includes(hash.split('/')[0]) ? hash.split('/')[0] : 'dashboard';
      switchView(view, false);

      setLoad(100);
      setTimeout(() => loadbar.classList.add('is-done'), 250);
    } catch (e) {
      console.error('Load failed', e);
      toast('Failed to load data — check console paths.');
    }
  }

  function setLoad(pct) {
    loadbar.style.width = pct + '%';
  }

  function updateRtStamp() {
    const t0 = new Date('2026-05-13T09:00:00-04:00').getTime();
    const now = Date.now();
    const sessionStart = window.__sessionStart || (window.__sessionStart = now);
    const elapsed = Math.floor((now - sessionStart) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    const stamp = `T+${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.000`;
    const rt = $('#rt-time'); if (rt) rt.textContent = stamp;
    const iso = $('#rt-iso'); if (iso) iso.textContent = new Date().toISOString();
  }

  // ────────────────────────── NAVIGATION ───────────────────
  function initNav() {
    $$('.rail-item').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    $('#hamburger').addEventListener('click', () => {
      $('#rail').classList.toggle('is-open');
    });
    window.addEventListener('hashchange', () => {
      const v = (location.hash || '#dashboard').replace('#', '').split('/')[0];
      if (v !== state.currentView) switchView(v, false);
    });
  }

  function switchView(view, pushHash = true) {
    state.currentView = view;
    $$('.view').forEach(v => v.classList.toggle('is-active', v.id === `view-${view}`));
    $$('.rail-item').forEach(b => b.classList.toggle('is-active', b.dataset.view === view));
    if (pushHash) location.hash = '#' + view;
    $('#rail').classList.remove('is-open');

    // View-specific lazy render
    switch (view) {
      case 'dashboard':    renderDashboard(); break;
      case 'requisitions': renderReqTable(); break;
      case 'pipeline':     renderKanban(); break;
      case 'candidates':   renderCandTable(); break;
      case 'scheduling':   renderScheduling(); break;
      case 'offers':       renderOffers(); break;
      case 'analytics':    renderAnalytics(); break;
      case 'integrations': renderIntegrations(); break;
      case 'settings':     renderSettings(); break;
    }
  }

  // ────────────────────────── INITIAL FILTER POPULATION ───
  function initFilters() {
    // REQ
    const depts = uniqueSorted(state.reqs.map(r => r.department));
    const locs  = uniqueSorted(state.reqs.map(r => r.location));
    fillSelect('#r-dept', depts);
    fillSelect('#r-loc', locs);

    const hms = uniqueSorted(state.reqs.map(r => state.peopleById[r.hiring_manager_id]?.display_name).filter(Boolean));
    fillSelect('#r-hm', hms);

    ['#r-dept','#r-loc','#r-status','#r-prio','#r-hm'].forEach(sel => {
      $(sel).addEventListener('change', () => {
        const key = sel.replace('#r-','');
        state.filters.req[key] = $(sel).value;
        renderReqTable();
      });
    });
    $('#r-search').addEventListener('input', e => {
      state.filters.req.q = e.target.value.toLowerCase();
      renderReqTable();
    });
    $('#r-clear').addEventListener('click', () => {
      state.filters.req = { dept:'', loc:'', status:'', prio:'', hm:'', q:'' };
      ['#r-dept','#r-loc','#r-status','#r-prio','#r-hm','#r-search'].forEach(s => $(s).value = '');
      renderReqTable();
    });
    $('#new-req-btn').addEventListener('click', openNewReqModal);

    // CAND
    const sources = uniqueSorted(state.candidates.map(c => c.source));
    const countries = uniqueSorted(state.candidates.map(c => c.country));
    const openReqs = state.reqs.filter(r => r.status === 'open');
    fillSelect('#c-source', sources);
    fillSelect('#c-country', countries);
    fillSelect('#c-req', openReqs.map(r => `${r.id}|${r.title}`), v => {
      const [id, title] = v.split('|');
      return { value: id, label: `${id} · ${title.slice(0, 38)}` };
    });

    ['#c-stage','#c-req','#c-source','#c-country'].forEach(sel => {
      $(sel).addEventListener('change', () => {
        const key = sel.replace('#c-','');
        state.filters.cand[key] = $(sel).value;
        state.candPage = 1;
        renderCandTable();
      });
    });
    $('#c-search').addEventListener('input', e => {
      state.filters.cand.q = e.target.value.toLowerCase();
      state.candPage = 1;
      renderCandTable();
    });
    $('#c-clear').addEventListener('click', () => {
      state.filters.cand = { stage:'', req:'', source:'', country:'', q:'' };
      ['#c-stage','#c-req','#c-source','#c-country','#c-search'].forEach(s => $(s).value = '');
      state.candPage = 1;
      renderCandTable();
    });

    // Kanban
    fillSelect('#kb-req', openReqs.map(r => `${r.id}|${r.title}`), v => {
      const [id, title] = v.split('|');
      return { value: id, label: `${id} · ${title.slice(0, 38)}` };
    });
    $('#kb-req').addEventListener('change', e => {
      state.filters.kb.req = e.target.value;
      renderKanban();
    });
    $('#kb-search').addEventListener('input', e => {
      state.filters.kb.q = e.target.value.toLowerCase();
      renderKanban();
    });
  }

  function uniqueSorted(arr) {
    return [...new Set(arr.filter(Boolean))].sort();
  }

  function fillSelect(sel, vals, fn) {
    const el = $(sel);
    const existing = el.querySelector('option[value=""]');
    el.innerHTML = '';
    if (existing) el.appendChild(existing);
    else {
      const opt = document.createElement('option');
      opt.value = ''; opt.textContent = 'All';
      el.appendChild(opt);
    }
    vals.forEach(v => {
      const opt = document.createElement('option');
      if (fn) {
        const o = fn(v);
        opt.value = o.value; opt.textContent = o.label;
      } else {
        opt.value = v; opt.textContent = v;
      }
      el.appendChild(opt);
    });
  }

  // ────────────────────────── RENDER ALL ──────────────────
  function renderAll() {
    $('#ri-count-reqs').textContent = state.reqs.length.toLocaleString();
    $('#ri-count-cands').textContent = state.candidates.length.toLocaleString();
    const offerCount = state.candidates.filter(c => c.stage === 'offer').length;
    $('#ri-count-offers').textContent = offerCount;
    $('#offer-live').textContent = offerCount;
    renderDashboard();
  }

  // ────────────────────────── DASHBOARD ───────────────────
  function renderDashboard() {
    const kpiGrid = $('#kpi-grid');
    const openReqs = state.reqs.filter(r => r.status === 'open').length;
    const activeStages = ['applied','screen','interview','offer'];
    const active = state.candidates.filter(c => activeStages.includes(c.stage)).length;

    // KPIs
    const kpis = [
      { label: 'Open reqs',          val: openReqs,           sub: '<span class="up">↑ 6</span> vs last week', trend: trendLine([12,14,18,17,22,25,21,28], '#0e1626') },
      { label: 'Active candidates',  val: active.toLocaleString(), sub: 'across applied → offer',                trend: trendLine([900,1020,1100,1150,1220,1280,1310,1380], '#b8651f') },
      { label: 'Time-to-fill',       val: '42d',              sub: 'median · <span class="down">↑ 3d</span>',   trend: trendLine([39,40,42,41,44,42,43,42], '#0e1626') },
      { label: 'Offers / week',      val: 18,                 sub: 'extended · <span class="up">↑ 4</span>',    trend: trendLine([10,12,14,11,15,16,14,18], '#b8651f') },
      { label: 'Accept rate',        val: '<span>66.7</span><em>%</em>',  sub: '12 of 18 this week',          trend: trendLine([62,64,67,65,68,66,69,67], '#4a5d3a') },
      { label: 'Cost / hire',        val: '$14.2K',           sub: 'YTD avg · <span class="up">↓ $0.8K</span>', trend: trendLine([15.5,15.2,15.0,14.8,14.5,14.3,14.2,14.1], '#0e1626') },
    ];
    kpiGrid.innerHTML = kpis.map(k => `
      <div class="kpi">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-val">${k.val}</div>
        <div class="kpi-trend">${k.trend}</div>
        <div class="kpi-sub">${k.sub}</div>
      </div>
    `).join('');

    // Priorities
    const priorities = [
      { mark: 'urgent', body: '<strong>2 offers expiring in 24h</strong> — Liu Chen (REQ-00042), Priya Nair (REQ-00018). Send extension or close out.', meta: '6h until expiry · finance approver: Marcus Liu' },
      { mark: 'urgent', body: '<strong>3 candidates waiting &gt;7 days</strong> for response after final round — risk of withdrawal.', meta: 'CAND-00471 · CAND-00892 · CAND-01034' },
      { mark: 'high',   body: '<strong>1 high-priority req</strong> with no qualified applicants. REQ-00088 · Staff PM · São Paulo.', meta: 'opened 21 days ago · 24 applied · 0 progressed' },
      { mark: 'high',   body: 'Bar-raiser unassigned on <strong>REQ-00007</strong> (Director, Engineering · London). First-round in 3 days.', meta: 'Suggest: Elena Park · 14 raises in last 6mo' },
      { mark: 'med',    body: 'Hiring manager feedback overdue on 4 scorecards from last week.', meta: 'REQ-00012, REQ-00033, REQ-00057, REQ-00091' },
    ];
    $('#priority-list').innerHTML = priorities.map(p => `
      <li>
        <span class="p-mark ${p.mark}">${p.mark}</span>
        <div class="p-body">${p.body}<span class="p-meta">${p.meta}</span></div>
      </li>
    `).join('');

    // AI suggestions
    const ai = [
      { body: '<strong>Refresh sourcing for REQ-00042</strong> — funnel velocity dropped 40% this week. Top channel (LinkedIn Recruiter) has produced 0 new leads in 5 days. Try Gem + Hire EZ for senior security ICs.', meta: 'agent: sourcing · confidence 0.82' },
      { body: '<strong>Expand location for REQ-00018</strong> — only 3 qualified applicants in São Paulo. Opening Buenos Aires + Mexico City (same band, 4h TZ overlap) yields ~14 in-band candidates per Lightcast.', meta: 'agent: market intel · confidence 0.74' },
      { body: '<strong>Raise the comp band on REQ-00007</strong> by 8% — 60% of declined offers in this geo cite comp. The market P75 for Director · Engineering · London is now $235K, up from $218K in Q4.', meta: 'agent: market intel · confidence 0.71' },
    ];
    $('#ai-list').innerHTML = ai.map(s => `
      <li>
        <span class="p-mark ai">AI</span>
        <div class="p-body">${s.body}<span class="p-meta">${s.meta}</span></div>
      </li>
    `).join('');

    // Recent activity
    const activity = [
      { t: '12 min ago', ev: '<strong>Liu Chen</strong> moved from Interview → Offer · REQ-00042', meta: 'by Sofia Vargas' },
      { t: '34 min ago', ev: '<strong>Tomás Reyes</strong> submitted final-round scorecard for Priya Nair', meta: 'recommendation: lean_hire · REQ-00018' },
      { t: '1 h ago',    ev: '<strong>Aisha Khan</strong> declined offer · REQ-00033', meta: 'reason: competing offer · 4% higher base' },
      { t: '2 h ago',    ev: '<strong>REQ-00091</strong> opened by Elena Vasquez (CHRO)', meta: 'Staff Software Engineer · Platform · Dublin' },
      { t: '3 h ago',    ev: 'Bar-raiser Elena Park scheduled on <strong>REQ-00042</strong>', meta: 'first-round panel · Tuesday 14:00 GMT' },
      { t: '4 h ago',    ev: '<strong>Maya Anand</strong> withdrew · REQ-00018', meta: 'reason: accepted competing offer at Anthropic' },
      { t: '5 h ago',    ev: '<strong>22 new candidates</strong> sourced for REQ-00007 via Gem campaign', meta: '14 referrals · 6 inbound · 2 outbound' },
      { t: 'yesterday',  ev: 'Sofia Vargas updated 6 candidate stages in bulk', meta: 'REQ-00057 first-round outcome batch' },
      { t: 'yesterday',  ev: '<strong>Carlos Mendez</strong> accepted · REQ-00012', meta: 'start date: 2026-06-15 · sign-on: $15K' },
      { t: '2 days ago', ev: '<strong>REQ-00088</strong> moved to high priority by Elena Vasquez', meta: '21 days open · 0 in-band candidates' },
    ];
    $('#activity-list').innerHTML = activity.map(a => `
      <li>
        <div class="time">${a.t}</div>
        <div class="ev">${a.ev}<span class="ev-meta">${a.meta}</span></div>
      </li>
    `).join('');
  }

  // Tiny sparkline
  function trendLine(values, color) {
    const w = 120, h = 18, pad = 1;
    const max = Math.max(...values), min = Math.min(...values);
    const range = max - min || 1;
    const pts = values.map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - 2*pad);
      const y = h - pad - ((v - min) / range) * (h - 2*pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" />
    </svg>`;
  }

  // ────────────────────────── REQ TABLE ───────────────────
  function filteredReqs() {
    const f = state.filters.req;
    return state.reqs.filter(r => {
      if (f.dept && r.department !== f.dept) return false;
      if (f.loc && r.location !== f.loc) return false;
      if (f.status && r.status !== f.status) return false;
      if (f.prio && r.priority !== f.prio) return false;
      if (f.hm) {
        const hm = state.peopleById[r.hiring_manager_id]?.display_name;
        if (hm !== f.hm) return false;
      }
      if (f.q) {
        const hay = `${r.id} ${r.title} ${r.department} ${r.team} ${r.location}`.toLowerCase();
        if (!hay.includes(f.q)) return false;
      }
      return true;
    });
  }

  function renderReqTable() {
    const tbody = $('#req-tbody');
    const reqs = filteredReqs();
    $('#req-empty').hidden = reqs.length > 0;

    tbody.innerHTML = reqs.slice(0, 200).map(r => {
      const hm = state.peopleById[r.hiring_manager_id];
      const sc = r.stage_counts;
      const fnl = ['applied','screen','interview','offer','accepted'].map(s => {
        const n = sc[s] || 0;
        return `<div class="req-funnel-seg ${s}" data-n="${n}" title="${s}: ${n}"></div>`;
      }).join('');

      return `
        <tr data-id="${r.id}">
          <td><span class="req-id">${r.id}</span></td>
          <td><span class="req-title">${r.title}</span></td>
          <td><span class="req-dept">${r.department}</span></td>
          <td>${r.location}<br><span class="cand-email">${r.region} · ${r.remote}</span></td>
          <td><span class="req-dept">${r.level}</span></td>
          <td><strong>${r.days_open}</strong><br><span class="cand-email">days</span></td>
          <td><div class="req-funnel">${fnl}</div></td>
          <td>${hm ? hm.display_name : '—'}<br><span class="cand-email">${hm ? hm.title : ''}</span></td>
          <td><span class="status-pill ${r.priority}">${r.priority}</span> <span class="status-pill ${r.sla_status}">${r.sla_status.replace('_',' ')}</span></td>
          <td><button class="dot-menu">⋯</button></td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', () => openReqDrawer(tr.dataset.id));
    });
  }

  // ────────────────────────── CANDIDATE TABLE ─────────────
  function filteredCands() {
    const f = state.filters.cand;
    return state.candidates.filter(c => {
      if (f.stage && c.stage !== f.stage) return false;
      if (f.req && c.requisition_id !== f.req) return false;
      if (f.source && c.source !== f.source) return false;
      if (f.country && c.country !== f.country) return false;
      if (f.q) {
        const hay = `${c.display_name} ${c.current_title} ${c.current_company} ${c.location_preference}`.toLowerCase();
        if (!hay.includes(f.q)) return false;
      }
      return true;
    });
  }

  function renderCandTable() {
    const tbody = $('#cand-tbody');
    const cands = filteredCands();
    $('#cand-count').textContent = `${cands.length.toLocaleString()} candidates`;
    $('#cand-empty').hidden = cands.length > 0;

    const start = (state.candPage - 1) * state.candPerPage;
    const page = cands.slice(start, start + state.candPerPage);

    tbody.innerHTML = page.map(c => {
      const r = state.reqsById[c.requisition_id];
      const match = matchScore(c);
      return `
        <tr data-id="${c.id}">
          <td>
            <div class="cand-cell">
              <div class="cand-avatar">${initials(c.display_name)}</div>
              <div>
                <div class="cand-name">${c.display_name}</div>
                <div class="cand-email">${c.current_title} · ${c.current_company || '—'}</div>
              </div>
            </div>
          </td>
          <td>${r ? r.title : c.requisition_id}<br><span class="cand-email">${c.requisition_id}</span></td>
          <td><span class="status-pill ${c.stage}">${c.stage}</span></td>
          <td><strong>${c.days_in_stage}</strong></td>
          <td><span class="match-chip ${matchTier(match)}">M: ${match}</span></td>
          <td><span class="req-dept">${c.source || '—'}</span></td>
          <td><span class="cand-email">${c.stage_entered}</span></td>
          <td><button class="dot-menu">⋯</button></td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', () => openCandDrawer(tr.dataset.id));
    });

    renderPagination(cands.length);
  }

  function renderPagination(total) {
    const pages = Math.ceil(total / state.candPerPage);
    const cur = state.candPage;
    const pag = $('#cand-pagination');
    if (pages <= 1) { pag.innerHTML = ''; return; }
    let html = '';
    html += `<button ${cur === 1 ? 'disabled' : ''} data-p="prev">‹ prev</button>`;
    const max = Math.min(pages, 8);
    let startP = Math.max(1, cur - 3);
    let endP = Math.min(pages, startP + max - 1);
    if (endP - startP < max - 1) startP = Math.max(1, endP - max + 1);
    for (let i = startP; i <= endP; i++) {
      html += `<button data-p="${i}" class="${i === cur ? 'is-active' : ''}">${i}</button>`;
    }
    html += `<button ${cur === pages ? 'disabled' : ''} data-p="next">next ›</button>`;
    html += `<span style="font-family:var(--mono);font-size:11px;color:var(--ink-mute);margin-left:.6rem">page ${cur} of ${pages}</span>`;
    pag.innerHTML = html;
    pag.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        const p = b.dataset.p;
        if (p === 'prev') state.candPage = Math.max(1, cur - 1);
        else if (p === 'next') state.candPage = Math.min(pages, cur + 1);
        else state.candPage = parseInt(p, 10);
        renderCandTable();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  function initials(name) {
    if (!name) return '?';
    return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  }

  // Pseudo-match score derived from real signals
  function matchScore(c) {
    let base = 60;
    base += Math.min(20, c.total_experience_years * 1.5);
    if (c.is_referral) base += 8;
    if (c.is_internal) base += 6;
    base += (c.predicted_offer_acceptance_probability || 0.5) * 12;
    if (c.stage === 'accepted') base += 4;
    if (c.stage === 'rejected') base -= 18;
    if (c.stage === 'withdrew') base -= 8;
    base += (parseInt(c.id.slice(-3), 10) % 7) - 3;
    return Math.max(20, Math.min(99, Math.round(base)));
  }
  function matchTier(m) {
    if (m >= 85) return 'high';
    if (m >= 70) return 'med';
    return 'low';
  }

  // ────────────────────────── KANBAN ──────────────────────
  function kanbanCandidates() {
    const stages = ['applied','screen','interview','offer','accepted'];
    let pool = state.candidates.filter(c => stages.includes(c.stage));
    if (state.filters.kb.req) pool = pool.filter(c => c.requisition_id === state.filters.kb.req);
    if (state.filters.kb.q) {
      const q = state.filters.kb.q;
      pool = pool.filter(c => `${c.display_name} ${c.current_title} ${c.current_company}`.toLowerCase().includes(q));
    }
    return pool;
  }

  function renderKanban() {
    const all = kanbanCandidates();
    const byStage = {
      applied: [], screen: [], interview: [], offer: [], accepted: []
    };
    all.forEach(c => byStage[c.stage]?.push(c));

    Object.entries(byStage).forEach(([stage, list]) => {
      const col = $(`.kb-col[data-stage="${stage}"]`);
      col.querySelector('.kb-count .n').textContent = list.length;

      // Limit displayed cards for perf
      const shown = list.slice(0, 60);
      const body = col.querySelector('.kb-body');
      body.innerHTML = shown.map(c => {
        const r = state.reqsById[c.requisition_id];
        const m = matchScore(c);
        return `
          <div class="kb-card" draggable="true" data-id="${c.id}" data-stage="${c.stage}">
            <div class="kb-card-top">
              <div class="kb-avatar">${initials(c.display_name)}</div>
              <div style="min-width:0; flex:1;">
                <div class="kb-name" title="${c.display_name}">${c.display_name}</div>
                <div class="kb-role" title="${r ? r.title : c.requisition_id}">${r ? r.title.slice(0,30) : c.requisition_id}</div>
              </div>
            </div>
            <div class="kb-meta">
              <span class="kb-days">${c.days_in_stage}d in stage</span>
              <span class="kb-match ${matchTier(m)}" title="AI match score (composite)">M: ${m}</span>
            </div>
          </div>
        `;
      }).join('') + (list.length > shown.length ? `<div style="font-family:var(--mono);font-size:10.5px;color:var(--ink-mute);text-align:center;padding:.5rem 0;letter-spacing:.04em;">+${list.length - shown.length} more · filter to narrow</div>` : '');
    });

    bindKanbanDnD();
  }

  function bindKanbanDnD() {
    $$('.kb-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        state.kbDraggingId = card.dataset.id;
        card.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.dataset.id);
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
      });
      card.addEventListener('click', () => {
        openCandDrawer(card.dataset.id);
      });
    });

    $$('.kb-body').forEach(body => {
      body.addEventListener('dragover', e => {
        e.preventDefault();
        body.classList.add('is-over');
        e.dataTransfer.dropEffect = 'move';
      });
      body.addEventListener('dragleave', () => {
        body.classList.remove('is-over');
      });
      body.addEventListener('drop', e => {
        e.preventDefault();
        body.classList.remove('is-over');
        const id = e.dataTransfer.getData('text/plain') || state.kbDraggingId;
        const newStage = body.dataset.stage;
        const cand = state.candidates.find(c => c.id === id);
        if (cand && cand.stage !== newStage) {
          const old = cand.stage;
          cand.stage = newStage;
          cand.days_in_stage = 0;
          cand.stage_entered = '2026-05-13';
          renderKanban();
          toast(`${cand.display_name} moved · ${old} → ${newStage}`);
        }
      });
    });
  }

  // ────────────────────────── SCHEDULING ──────────────────
  function renderScheduling() {
    const pending = state.candidates
      .filter(c => c.stage === 'interview')
      .slice(0, 8);
    $('#pending-list').innerHTML = pending.map(c => {
      const r = state.reqsById[c.requisition_id];
      return `
        <li>
          <div class="pn-name">${c.display_name}</div>
          <div class="pn-meta">${r ? r.title : c.requisition_id} · ${c.days_in_stage}d in stage · needs 4-person panel</div>
        </li>
      `;
    }).join('');

    // Calendar grid (Mon-Fri × 5 time slots)
    const days = ['Mon 11', 'Tue 12', 'Wed 13', 'Thu 14', 'Fri 15'];
    const times = ['09:00', '10:30', '12:00', '14:00', '15:30'];
    const events = [
      [0,0,'Liu Chen · final',  'ink'],
      [0,2,'Maya · screen',     'moss'],
      [1,1,'Priya Nair · tech', 'ochre'],
      [1,3,'Tomás · onsite',    'ink'],
      [2,0,'Aisha · culture',   'moss'],
      [2,3,'Sam · screen',      'ochre'],
      [3,1,'Yusuf · panel',     'ink'],
      [3,4,'Wei · final',       'ochre'],
      [4,2,'Ana · screen',      'moss'],
      [4,4,'Diego · loop',      'ink'],
    ];
    const eventsMap = {};
    events.forEach(([col,row,label,tone]) => {
      const k = `${col}-${row}`;
      eventsMap[k] = eventsMap[k] || [];
      eventsMap[k].push({ label, tone });
    });

    let html = '<div class="cal-grid">';
    html += `<div class="cal-cell header"></div>`;
    days.forEach(d => html += `<div class="cal-cell header">${d}</div>`);
    times.forEach((t, row) => {
      html += `<div class="cal-cell time">${t}</div>`;
      days.forEach((_, col) => {
        const evs = eventsMap[`${col}-${row}`] || [];
        const inner = evs.map(e => `<div class="cal-event ${e.tone === 'ochre' ? '' : e.tone}">${e.label}</div>`).join('');
        html += `<div class="cal-cell">${inner}</div>`;
      });
    });
    html += '</div>';
    $('#cal-wrap').innerHTML = html;

    // Panel suggestions
    const eligible = state.people.filter(p => p.is_manager || p.level?.startsWith('IC4') || p.level?.startsWith('IC5'));
    const sample = eligible.sort((a,b) => (a.id + b.id).localeCompare(b.id + a.id)).slice(0, 12);
    const panels = [
      {
        title: 'Panel A · balanced',
        score: '0.91',
        members: sample.slice(0, 4),
        reason: 'Highest availability + 3-of-4 with bar-raiser certification. Gender mix 2/2. Avg interviewer load 1.2/wk (target ≤2).'
      },
      {
        title: 'Panel B · technical depth',
        score: '0.84',
        members: sample.slice(4, 8),
        reason: 'Two principal engineers from adjacent teams; deepest domain match. Slight load risk on Tomás (4 panels this week).'
      },
      {
        title: 'Panel C · diversity-weighted',
        score: '0.79',
        members: sample.slice(8, 12),
        reason: 'Underrepresented seniority + region. One member based in São Paulo for direct timezone fit. Availability solid through Friday.'
      },
    ];
    $('#panel-suggest').innerHTML = panels.map(p => `
      <div class="panel-card">
        <div class="panel-card-head">
          <span class="lbl">${p.title}</span>
          <span class="score">fit ${p.score}</span>
        </div>
        <div class="panel-members">
          ${p.members.map(m => `
            <div class="panel-member">
              <span class="av">${initials(m.display_name)}</span>
              <span>${m.display_name} · ${m.title}</span>
            </div>
          `).join('')}
        </div>
        <div class="panel-reason">${p.reason}</div>
      </div>
    `).join('');
  }

  // ────────────────────────── OFFERS ──────────────────────
  function renderOffers() {
    const offers = state.candidates.filter(c => c.stage === 'offer').slice(0, 12);
    $('#offer-grid').innerHTML = offers.map(c => {
      const r = state.reqsById[c.requisition_id];
      const comp = c.offered_comp || c.expected_comp || (r ? r.comp_band_p50 : 0);
      const prob = Math.round((c.predicted_offer_acceptance_probability || 0.6) * 100);
      const statusPool = ['extended','extended','pending','accepted','declined'];
      const status = statusPool[parseInt(c.id.slice(-2), 10) % statusPool.length];
      return `
        <article class="offer-card" data-id="${c.id}">
          <div class="offer-head">
            <div>
              <div class="offer-cand-name">${c.display_name}</div>
              <div class="offer-role">${r ? r.title : c.requisition_id}</div>
            </div>
            <span class="status-pill ${status}">${status}</span>
          </div>
          <div class="offer-comp">
            <span class="big">$${(comp/1000).toFixed(0)}K</span>
            <span class="lbl">base · USD</span>
          </div>
          <div class="offer-foot">
            <span>${c.days_in_stage}d in stage</span>
            <span class="offer-prob">accept · ${prob}%</span>
          </div>
        </article>
      `;
    }).join('');
    $$('.offer-card').forEach(el => el.addEventListener('click', () => openOfferDrawer(el.dataset.id)));
  }

  // ────────────────────────── ANALYTICS ───────────────────
  function renderAnalytics() {
    // Funnel: aggregate stage counts across all open reqs
    const totals = { applied:0, screen:0, interview:0, offer:0, accepted:0 };
    state.reqs.filter(r => r.status === 'open').forEach(r => {
      Object.entries(r.stage_counts).forEach(([k,v]) => totals[k] = (totals[k]||0)+v);
    });
    $('#chart-funnel').innerHTML = funnelChart(totals);

    // Time-to-fill by department
    const deptTimes = {};
    state.reqs.forEach(r => {
      deptTimes[r.department] = deptTimes[r.department] || { sum: 0, n: 0 };
      deptTimes[r.department].sum += r.days_open;
      deptTimes[r.department].n += 1;
    });
    const ttData = Object.entries(deptTimes)
      .map(([k, v]) => ({ label: k, value: Math.round(v.sum / v.n) }))
      .sort((a,b) => b.value - a.value)
      .slice(0, 7);
    $('#chart-ttfill').innerHTML = hBarChart(ttData, 'days', '#0e1626');

    // Cost per hire by source
    const cphData = [
      { label: 'Referral',  value: 4200 },
      { label: 'Inbound',   value: 6800 },
      { label: 'Outbound',  value: 11200 },
      { label: 'Agency',    value: 31000 },
      { label: 'Event',     value: 14500 },
      { label: 'Campus',    value: 9200 },
    ];
    $('#chart-cph').innerHTML = hBarChart(cphData, '$', '#b8651f', v => '$' + (v/1000).toFixed(1) + 'K');

    // Source mix donut
    const accepted = state.candidates.filter(c => c.stage === 'accepted');
    const srcCount = {};
    accepted.forEach(c => { srcCount[c.source || 'other'] = (srcCount[c.source || 'other']||0) + 1; });
    $('#chart-source').innerHTML = donutChart(srcCount);

    // Offer acceptance rate by month
    const accRate = [
      { label: 'Dec',  value: 58 },
      { label: 'Jan',  value: 61 },
      { label: 'Feb',  value: 64 },
      { label: 'Mar',  value: 63 },
      { label: 'Apr',  value: 67 },
      { label: 'May',  value: 66.7 },
    ];
    $('#chart-accept').innerHTML = lineChart(accRate, '%', '#4a5d3a', 50, 80);

    // Quality of hire (1-year retention)
    const qoh = [
      { label: 'Referral', value: 92 },
      { label: 'Internal', value: 94 },
      { label: 'Outbound', value: 84 },
      { label: 'Inbound',  value: 81 },
      { label: 'Event',    value: 78 },
      { label: 'Agency',   value: 70 },
    ];
    $('#chart-quality').innerHTML = hBarChart(qoh, '%', '#4a5d3a', v => v + '%');

    // AI insights
    const aiInsights = [
      { body: '<strong>Agency-sourced hires have 22% higher first-year attrition than referrals.</strong> Re-allocating $480K of agency spend to a referral bonus program (estimated 32 additional referral hires) would improve 1-yr retention by ~3.2pp.', meta: 'confidence 0.86 · model: retention v2' },
      { body: '<strong>Time-to-fill in Engineering rose 11d vs Q4.</strong> Bottleneck: scorecard turnaround. 38% of Engineering scorecards exceed the 48h SLA. Suggested fix: auto-nudge after 30h.', meta: 'confidence 0.79 · model: cycle-time v1' },
      { body: '<strong>Offer acceptance is concentrated in 3 hiring managers.</strong> Sandra Ortega, Marcus Liu, and Aisha Khan close 71% of offers within their teams at >75% accept rate. Their interview script is now codified as the recommended panel template.', meta: 'confidence 0.74 · model: HM effectiveness' },
    ];
    $('#analytics-ai').innerHTML = aiInsights.map(s => `
      <li>
        <span class="p-mark ai">AI</span>
        <div class="p-body">${s.body}<span class="p-meta">${s.meta}</span></div>
      </li>
    `).join('');
  }

  function funnelChart(totals) {
    const stages = ['applied','screen','interview','offer','accepted'];
    const labels = ['Applied','Screened','Interview','Offer','Accepted'];
    const max = Math.max(...stages.map(s => totals[s] || 0));
    const w = 540, h = 200;
    const barW = w / stages.length - 14;
    let html = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">`;
    stages.forEach((s, i) => {
      const v = totals[s] || 0;
      const bh = (v / max) * 140;
      const x = i * (w / stages.length) + 7;
      const y = h - bh - 30;
      const colors = ['#dccba0','#c5b884','#e6c79b','#b8651f','#4a5d3a'];
      html += `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="${colors[i]}" />`;
      html += `<text x="${x + barW/2}" y="${y - 6}" font-family="JetBrains Mono" font-size="12" font-weight="700" fill="#0e1626" text-anchor="middle">${v.toLocaleString()}</text>`;
      html += `<text x="${x + barW/2}" y="${h - 10}" font-family="JetBrains Mono" font-size="10" fill="#4b5365" text-anchor="middle" letter-spacing="1">${labels[i].toUpperCase()}</text>`;
      // conversion
      if (i > 0) {
        const prev = totals[stages[i-1]] || 1;
        const conv = Math.round((v / prev) * 100);
        html += `<text x="${x - 7}" y="${h - 50}" font-family="JetBrains Mono" font-size="10" fill="#b8651f" text-anchor="middle">${conv}%</text>`;
      }
    });
    html += '</svg>';
    return html;
  }

  function hBarChart(data, axis, color, fmt) {
    fmt = fmt || (v => v + (axis === 'days' ? 'd' : ''));
    const max = Math.max(...data.map(d => d.value));
    const w = 460, rowH = 26, h = data.length * rowH + 14;
    const lblW = 100;
    let html = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">`;
    data.forEach((d, i) => {
      const bw = ((d.value / max) * (w - lblW - 60));
      const y = i * rowH + 6;
      html += `<text x="0" y="${y + 14}" font-family="JetBrains Mono" font-size="11" fill="#4b5365">${d.label}</text>`;
      html += `<rect x="${lblW}" y="${y + 4}" width="${bw}" height="${rowH - 12}" fill="${color}" opacity="0.85" />`;
      html += `<text x="${lblW + bw + 6}" y="${y + 14}" font-family="JetBrains Mono" font-size="11" font-weight="700" fill="#0e1626">${fmt(d.value)}</text>`;
    });
    html += '</svg>';
    return html;
  }

  function donutChart(counts) {
    const entries = Object.entries(counts).sort((a,b) => b[1] - a[1]);
    const total = entries.reduce((s, [_, v]) => s + v, 0);
    const w = 320, h = 220, cx = 110, cy = h/2, R = 80, r = 50;
    const colors = ['#0e1626','#b8651f','#4a5d3a','#6b3a4a','#c5b884','#9aa0aa','#e6c79b'];
    let angle = -Math.PI / 2;
    let html = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">`;
    entries.forEach(([k, v], i) => {
      const pct = v / total;
      const next = angle + pct * Math.PI * 2;
      const large = pct > 0.5 ? 1 : 0;
      const x1 = cx + R*Math.cos(angle), y1 = cy + R*Math.sin(angle);
      const x2 = cx + R*Math.cos(next),  y2 = cy + R*Math.sin(next);
      const x3 = cx + r*Math.cos(next),  y3 = cy + r*Math.sin(next);
      const x4 = cx + r*Math.cos(angle), y4 = cy + r*Math.sin(angle);
      const d = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`;
      html += `<path d="${d}" fill="${colors[i % colors.length]}" />`;
      angle = next;
    });
    // legend
    entries.forEach(([k, v], i) => {
      const y = 14 + i * 22;
      html += `<rect x="220" y="${y - 9}" width="12" height="12" fill="${colors[i % colors.length]}" />`;
      html += `<text x="240" y="${y}" font-family="JetBrains Mono" font-size="11" fill="#0e1626">${k}</text>`;
      html += `<text x="240" y="${y + 12}" font-family="JetBrains Mono" font-size="10" fill="#6c7180">${Math.round(v/total*100)}% · ${v}</text>`;
    });
    html += '</svg>';
    return html;
  }

  function lineChart(data, axis, color, ymin, ymax) {
    const w = 460, h = 200, pad = 30;
    const max = ymax || Math.max(...data.map(d => d.value));
    const min = ymin || 0;
    const range = max - min;
    let html = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">`;
    // grid
    [0, 0.25, 0.5, 0.75, 1].forEach(p => {
      const y = pad + p * (h - 2*pad);
      html += `<line x1="${pad}" y1="${y}" x2="${w - pad}" y2="${y}" stroke="#d8cdb6" stroke-width="0.8" />`;
      html += `<text x="${pad - 4}" y="${y + 3}" font-family="JetBrains Mono" font-size="9" fill="#9aa0aa" text-anchor="end">${Math.round(max - p*range)}</text>`;
    });
    const pts = data.map((d, i) => {
      const x = pad + (i / (data.length - 1)) * (w - 2*pad);
      const y = pad + (1 - (d.value - min) / range) * (h - 2*pad);
      return [x, y, d];
    });
    const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ' ' + p[1]).join(' ');
    html += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" />`;
    pts.forEach(p => {
      html += `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="${color}" />`;
      html += `<text x="${p[0]}" y="${h - 10}" font-family="JetBrains Mono" font-size="10" fill="#4b5365" text-anchor="middle">${p[2].label}</text>`;
      html += `<text x="${p[0]}" y="${p[1] - 8}" font-family="JetBrains Mono" font-size="10" font-weight="700" fill="#0e1626" text-anchor="middle">${p[2].value}${axis === '%' ? '%' : ''}</text>`;
    });
    html += '</svg>';
    return html;
  }

  // ────────────────────────── INTEGRATIONS ────────────────
  function renderIntegrations() {
    const cats = [
      {
        name: 'HRIS write-back · 18 partners',
        items: [
          ['Workday HCM','live'], ['BambooHR','live'], ['Personio','live'], ['SuccessFactors','beta'],
          ['Oracle HCM','beta'], ['Sapling','live'], ['Namely','live'], ['Rippling','live'],
          ['JustWorks','planned'], ['Paychex','planned'], ['ADP-WFN','live'], ['Gusto','live'],
          ['ZenefitsPro','planned'], ['HiBob','live'], ['Sage HR','planned'], ['Paycom','planned'],
          ['Paylocity','planned'], ['UKG Pro','beta']
        ]
      },
      {
        name: 'Assessment platforms · 12 partners',
        items: [
          ['HackerRank','live'], ['Codility','live'], ['CoderPad','live'], ['Karat','live'],
          ['TestGorilla','live'], ['Plum','beta'], ['Kandio','beta'], ['Mettl','live'],
          ['Pymetrics','live'], ['McQuaig','planned'], ['Wonderlic','planned'], ['Criteria','live']
        ]
      },
      {
        name: 'Background check · 8 partners',
        items: [
          ['Checkr','live'], ['Sterling','live'], ['GoodHire','live'], ['HireRight','live'],
          ['IntelliCorp','live'], ['Accurate','beta'], ['First Advantage','live'], ['Verified Credentials','beta']
        ]
      },
      {
        name: 'Sourcing',
        items: [
          ['LinkedIn Recruiter','live'], ['Gem','live'], ['Loxo','live'], ['HireEZ','beta']
        ]
      },
      {
        name: 'Calendar',
        items: [
          ['Google Calendar','live'], ['Outlook 365','live'], ['Calendly','live']
        ]
      },
      {
        name: 'Communications',
        items: [
          ['Slack','live'], ['Microsoft Teams','live'], ['Email · SMTP','live']
        ]
      },
      {
        name: 'Identity',
        items: [
          ['Okta','live'], ['Azure AD','live'], ['Google Workspace','live'], ['OneLogin','planned']
        ]
      },
    ];
    $('#integration-cats').innerHTML = cats.map(c => `
      <section>
        <div class="int-cat-head">
          <span>§ ${c.name}</span>
          <span class="meta">${c.items.filter(i => i[1] === 'live').length} live · ${c.items.filter(i => i[1] === 'beta').length} beta · ${c.items.filter(i => i[1] === 'planned').length} planned</span>
        </div>
        <div class="int-grid">
          ${c.items.map(([n, s]) => `
            <div class="int-card">
              <div class="int-name">${n}</div>
              <div class="int-foot">
                <span class="status-pill ${s}">${s}</span>
                <button class="int-connect">${s === 'live' ? 'manage →' : s === 'beta' ? 'try beta →' : 'request →'}</button>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `).join('');
  }

  // ────────────────────────── SETTINGS ───────────────────
  function renderSettings() {
    const audits = [
      { t: '2026-05-13 09:14', ev: 'Sofia Vargas signed in · IP 84.92.x.x · device: Mac · Chrome 138' },
      { t: '2026-05-12 17:02', ev: 'AI policy updated · sourcing outreach: drafts only (no auto-send) · by Elena Vasquez' },
      { t: '2026-05-12 11:38', ev: 'New API key issued for the Workday integration · pk_live_…4k2x' },
      { t: '2026-05-11 09:47', ev: 'EU AI Act transparency log exported · 1,284 candidate-impacting decisions · YTD' },
      { t: '2026-05-10 14:12', ev: 'NYC AEDT bias audit run · no disparate impact above the 80% threshold · by Marcus Liu' },
      { t: '2026-05-09 10:01', ev: 'GDPR data deletion request fulfilled · CAND-00839 · all PII purged from primary + backups' },
    ];
    $('#audit-list').innerHTML = audits.map(a => `
      <li>
        <div class="time">${a.t.split(' ')[1]}</div>
        <div class="ev"><strong>${a.t.split(' ')[0]}</strong> · ${a.ev}</div>
      </li>
    `).join('');
  }

  // ────────────────────────── DRAWER ─────────────────────
  function initDrawer() {
    $('#drawer-backdrop').addEventListener('click', closeDrawer);
    $('#drawer-close').addEventListener('click', closeDrawer);
  }

  function openDrawer() {
    $('#drawer-backdrop').classList.add('is-open');
    $('#drawer').classList.add('is-open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    state.drawerOpen = true;
  }
  function closeDrawer() {
    $('#drawer-backdrop').classList.remove('is-open');
    $('#drawer').classList.remove('is-open');
    $('#drawer').setAttribute('aria-hidden', 'true');
    state.drawerOpen = false;
  }

  // REQ DRAWER
  function openReqDrawer(id) {
    const r = state.reqsById[id];
    if (!r) return;
    const hm = state.peopleById[r.hiring_manager_id];
    const rec = state.peopleById[r.recruiter_id];
    const reqCands = state.candidates.filter(c => c.requisition_id === id);

    $('#drawer-head').innerHTML = `
      <div class="drawer-eyebrow">§ Requisition · ${r.id}</div>
      <h2 class="drawer-title">${r.title}</h2>
      <div class="drawer-subtitle">${r.department} · ${r.team} · ${r.location} (${r.remote})</div>
      <div class="drawer-meta">
        <span class="drawer-meta-item"><span class="k">Level</span><span class="v">${r.level}</span></span>
        <span class="drawer-meta-item"><span class="k">Comp P50</span><span class="v">$${(r.comp_band_p50/1000).toFixed(0)}K</span></span>
        <span class="drawer-meta-item"><span class="k">Priority</span><span class="v">${r.priority}</span></span>
        <span class="drawer-meta-item"><span class="k">Open</span><span class="v">${r.days_open}d</span></span>
        <span class="drawer-meta-item"><span class="k">Status</span><span class="v">${r.status}</span></span>
      </div>
    `;
    state.drawerActiveTab = 'overview';
    renderReqDrawerBody(r, hm, rec, reqCands);
    openDrawer();
  }

  function renderReqDrawerBody(r, hm, rec, reqCands) {
    const aiSummary = aiSummaryForReq(r, reqCands);
    const total = Object.values(r.stage_counts).reduce((a,b) => a+b, 0);

    $('#drawer-body').innerHTML = `
      <div class="drawer-tabs">
        ${['overview','candidates','activity','settings'].map(t => `
          <button class="dtab ${t === state.drawerActiveTab ? 'is-active' : ''}" data-tab="${t}">${t}</button>
        `).join('')}
      </div>
      <div id="dtab-body"></div>
    `;
    $$('.dtab').forEach(t => t.addEventListener('click', () => {
      state.drawerActiveTab = t.dataset.tab;
      $$('.dtab').forEach(x => x.classList.toggle('is-active', x === t));
      renderReqDrawerTab(r, hm, rec, reqCands);
    }));
    renderReqDrawerTab(r, hm, rec, reqCands);
  }

  function renderReqDrawerTab(r, hm, rec, reqCands) {
    const body = $('#dtab-body');
    const tab = state.drawerActiveTab;
    if (tab === 'overview') {
      const total = Object.values(r.stage_counts).reduce((a,b) => a+b, 0);
      body.innerHTML = `
        <div class="drawer-section">
          <div class="dsec-label"><span class="ai-mark">AI</span> Summary</div>
          <div class="ai-summary">${aiSummaryForReq(r, reqCands)}</div>
        </div>
        <div class="drawer-section">
          <div class="dsec-label">§ Pipeline · ${total} candidates</div>
          <div class="mini-funnel">
            ${['applied','screen','interview','offer','accepted'].map(s => `
              <div class="mini-funnel-cell">
                <div class="mini-funnel-stage">${s}</div>
                <div class="mini-funnel-n">${r.stage_counts[s] || 0}</div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="drawer-section">
          <div class="dsec-label">§ Team</div>
          <div class="dsec-body">
            <p><strong>Hiring manager:</strong> ${hm ? hm.display_name + ' · ' + hm.title : '—'}</p>
            <p><strong>Recruiter:</strong> ${rec ? rec.display_name + ' · ' + rec.title : '—'}</p>
            <p><strong>Bar-raisers required:</strong> ${r.bar_raisers_required ? 'Yes' : 'No'}</p>
          </div>
        </div>
        <div class="drawer-section">
          <div class="dsec-label">§ Timeline</div>
          <div class="dsec-body">
            <p>Opened <strong>${r.opened_date}</strong> · target close <strong>${r.target_close_date}</strong></p>
            <p>SLA status: <span class="status-pill ${r.sla_status}">${r.sla_status.replace('_',' ')}</span></p>
          </div>
        </div>
        <div class="drawer-actions">
          <button class="btn btn-ink">View pipeline</button>
          <button class="btn btn-ghost">Edit requisition</button>
          <button class="btn btn-ghost">Put on hold</button>
        </div>
      `;
      $$('.btn-ink', body)[0]?.addEventListener('click', () => {
        state.filters.kb.req = r.id;
        $('#kb-req').value = r.id;
        closeDrawer();
        switchView('pipeline');
      });
    } else if (tab === 'candidates') {
      const stages = ['applied','screen','interview','offer','accepted'];
      const byStage = {};
      stages.forEach(s => byStage[s] = reqCands.filter(c => c.stage === s));
      body.innerHTML = `
        <div class="drawer-section">
          ${stages.map(s => byStage[s].length ? `
            <div class="stage-group">
              <div class="stage-group-head">§ ${s} · ${byStage[s].length}</div>
              ${byStage[s].slice(0, 8).map(c => `
                <div class="stage-cand-row" data-id="${c.id}">
                  <div class="cand-avatar" style="width:24px;height:24px;font-size:9px;">${initials(c.display_name)}</div>
                  <span class="n">${c.display_name} · <span style="color:var(--ink-mute);font-family:var(--mono);font-size:11px;">${c.current_title || ''}</span></span>
                  <span class="days">${c.days_in_stage}d</span>
                  <span class="match-chip ${matchTier(matchScore(c))}">${matchScore(c)}</span>
                </div>
              `).join('')}
              ${byStage[s].length > 8 ? `<div style="font-family:var(--mono);font-size:10.5px;color:var(--ink-mute);padding:.3rem 0;">+${byStage[s].length - 8} more</div>` : ''}
            </div>
          ` : '').join('')}
        </div>
      `;
      $$('.stage-cand-row', body).forEach(r => r.addEventListener('click', () => openCandDrawer(r.dataset.id)));
    } else if (tab === 'activity') {
      body.innerHTML = `
        <div class="drawer-section">
          <ul class="activity">
            <li><div class="time">2h ago</div><div class="ev"><strong>Liu Chen</strong> moved Interview → Offer</div></li>
            <li><div class="time">5h ago</div><div class="ev"><strong>Tomás Reyes</strong> submitted a scorecard · lean_hire</div></li>
            <li><div class="time">1d ago</div><div class="ev"><strong>Bar-raiser</strong> Elena Park assigned to panel</div></li>
            <li><div class="time">2d ago</div><div class="ev"><strong>Comp band</strong> updated · P50 raised by 6%</div></li>
            <li><div class="time">5d ago</div><div class="ev"><strong>Hiring manager</strong> approved JD draft v3</div></li>
            <li><div class="time">${r.opened_date}</div><div class="ev">Requisition opened by ${hm?.display_name || '—'}</div></li>
          </ul>
        </div>
      `;
    } else if (tab === 'settings') {
      body.innerHTML = `
        <div class="drawer-section">
          <div class="dsec-label">§ Approval workflow</div>
          <div class="approval-strip">
            <div class="ap-step"><span class="badge">✓</span>Hiring manager · approved 2026-${r.opened_date.slice(5)}</div>
            <div class="ap-step"><span class="badge">✓</span>Finance partner · approved</div>
            <div class="ap-step"><span class="badge">✓</span>HRBP · approved</div>
            <div class="ap-step ${r.status === 'open' ? '' : 'future'}"><span class="badge">${r.status === 'open' ? '●' : '✓'}</span>Recruitment activated</div>
          </div>
        </div>
        <div class="drawer-section">
          <div class="dsec-label">§ Scorecard template</div>
          <div class="dsec-body">
            Currently using the <strong>Engineering · IC</strong> template with bar-raiser overlay.
            6 dimensions: technical depth, system design, code quality, collaboration, judgment, raise.
          </div>
        </div>
        <div class="drawer-section">
          <div class="dsec-label">§ Visibility</div>
          <div class="dsec-body">
            Visible to: Talent Acquisition · Engineering leadership · CHRO · 1 external Workday sync.
          </div>
        </div>
      `;
    }
  }

  function aiSummaryForReq(r, reqCands) {
    const stages = r.stage_counts;
    const inFunnel = Object.values(stages).reduce((a,b)=>a+b,0);
    const accepted = stages.accepted || 0;
    const offer = stages.offer || 0;
    const interview = stages.interview || 0;
    const stuck = r.sla_status === 'stuck';
    const aging = r.sla_status === 'aging';

    let lines = [];
    if (accepted >= 1 && stages.applied === 0 && stages.screen === 0) {
      lines.push(`This requisition is effectively filled — ${accepted} candidate${accepted>1?'s':''} accepted and the front of the funnel is empty.`);
    } else if (stuck) {
      lines.push(`This req is <strong>stuck</strong> at the ${interview > 0 ? 'interview' : 'screen'} stage. Top blocker: ${interview > 0 ? 'scorecard turnaround averaging 4.2d (target: 1d)' : 'low sourcing volume at this level / location'}.`);
    } else if (aging) {
      lines.push(`This req is aging past its 60-day SLA. ${interview} candidates in interview, with the oldest at 18+ days in stage.`);
    } else {
      lines.push(`${inFunnel} candidates in the funnel · ${offer} active offers · pipeline tracking in-pace at ${r.days_open} days open.`);
    }
    if (r.priority === 'critical' || r.priority === 'high') {
      lines.push(`Priority is <strong>${r.priority}</strong> — Sofia is the assigned recruiter and has set ${stuck ? 'a daily standup with the hiring manager' : 'weekly checkpoints'}.`);
    }
    lines.push(`Next best action: ${stuck ? 'add a second sourcer; widen geo to include Lisbon and Madrid; refresh JD.' : aging ? 'unblock scorecards; nudge interviewers; consider raising the comp band.' : 'continue weekly cadence; expect 1-2 offers in the next 14 days.'}`);
    return lines.join(' ');
  }

  // CAND DRAWER
  function openCandDrawer(id) {
    const c = state.candidates.find(x => x.id === id);
    if (!c) return;
    const r = state.reqsById[c.requisition_id];
    const match = matchScore(c);

    $('#drawer-head').innerHTML = `
      <div class="drawer-eyebrow">§ Candidate · ${c.id}</div>
      <h2 class="drawer-title">${c.display_name}</h2>
      <div class="drawer-subtitle">${c.current_title || 'Independent'}${c.current_company ? ' · ' + c.current_company : ''}</div>
      <div class="drawer-meta">
        <span class="drawer-meta-item"><span class="k">Stage</span><span class="v">${c.stage}</span></span>
        <span class="drawer-meta-item"><span class="k">Match</span><span class="v">${match}</span></span>
        <span class="drawer-meta-item"><span class="k">Exp</span><span class="v">${c.total_experience_years}y</span></span>
        <span class="drawer-meta-item"><span class="k">Location</span><span class="v">${c.location_preference || c.country}</span></span>
        <span class="drawer-meta-item"><span class="k">Comp exp</span><span class="v">$${((c.expected_comp||0)/1000).toFixed(0)}K</span></span>
        <span class="drawer-meta-item"><span class="k">Source</span><span class="v">${c.source || '—'}</span></span>
      </div>
    `;
    state.drawerActiveTab = 'overview';
    renderCandDrawerBody(c, r, match);
    openDrawer();
  }

  function renderCandDrawerBody(c, r, match) {
    $('#drawer-body').innerHTML = `
      <div class="drawer-tabs">
        ${['overview','scorecards','communications','activity','documents'].map(t => `
          <button class="dtab ${t === state.drawerActiveTab ? 'is-active' : ''}" data-tab="${t}">${t}</button>
        `).join('')}
      </div>
      <div id="dtab-body"></div>
    `;
    $$('.dtab').forEach(t => t.addEventListener('click', () => {
      state.drawerActiveTab = t.dataset.tab;
      $$('.dtab').forEach(x => x.classList.toggle('is-active', x === t));
      renderCandTab(c, r, match);
    }));
    renderCandTab(c, r, match);
  }

  function renderCandTab(c, r, match) {
    const body = $('#dtab-body');
    const tab = state.drawerActiveTab;

    if (tab === 'overview') {
      body.innerHTML = `
        <div class="drawer-section">
          <div class="dsec-label"><span class="ai-mark">AI</span> Summary</div>
          <div class="ai-summary">${aiSummaryForCand(c, r)}</div>
        </div>
        <div class="drawer-section">
          <div class="dsec-label"><span class="ai-mark">AI</span> Match reasoning · score ${match}</div>
          <div class="ai-summary">${aiMatchReasoning(c, r, match)}</div>
        </div>
        <div class="drawer-section">
          <div class="dsec-label">§ Applied to</div>
          <div class="dsec-body">
            <p><strong>${r ? r.title : c.requisition_id}</strong> · ${r ? r.department + ' · ' + r.location : ''}</p>
            <p>Entered ${c.stage} on <strong>${c.stage_entered}</strong> · ${c.days_in_stage}d in stage.</p>
            <p>Predicted offer acceptance probability: <strong style="color:var(--ochre);">${Math.round((c.predicted_offer_acceptance_probability||0.6)*100)}%</strong></p>
          </div>
        </div>
        <div class="drawer-section">
          <div class="dsec-label">§ Background</div>
          <div class="dsec-body">
            <p><strong>Experience:</strong> ${c.total_experience_years}y · indicated level ${c.highest_level_indicated || '—'}</p>
            <p><strong>Location:</strong> ${c.location_preference || c.country}</p>
            <p><strong>Referred:</strong> ${c.is_referral ? 'Yes' : 'No'}${c.referrer_id ? ' · by ' + (state.peopleById[c.referrer_id]?.display_name || c.referrer_id) : ''}</p>
            <p><strong>Internal candidate:</strong> ${c.is_internal ? 'Yes' : 'No'}</p>
          </div>
        </div>
        <div class="drawer-actions">
          <button class="btn btn-ochre" data-act="advance">Move to next stage →</button>
          <button class="btn btn-ink" data-act="schedule">Schedule interview</button>
          <button class="btn btn-ghost" data-act="extend">Extend offer</button>
          <button class="btn btn-ghost" data-act="reject">Reject</button>
        </div>
      `;
      body.querySelector('[data-act="advance"]').addEventListener('click', () => {
        const stages = ['applied','screen','interview','offer','accepted'];
        const i = stages.indexOf(c.stage);
        if (i >= 0 && i < stages.length - 1) {
          const next = stages[i + 1];
          c.stage = next;
          c.days_in_stage = 0;
          toast(`${c.display_name} moved to ${next}`);
          openCandDrawer(c.id);
          if (state.currentView === 'pipeline') renderKanban();
          if (state.currentView === 'candidates') renderCandTable();
        }
      });
      body.querySelector('[data-act="schedule"]').addEventListener('click', () => {
        toast('Interview scheduled · panel suggestion sent');
      });
      body.querySelector('[data-act="extend"]').addEventListener('click', () => {
        c.stage = 'offer';
        toast(`Offer extended to ${c.display_name}`);
        openCandDrawer(c.id);
      });
      body.querySelector('[data-act="reject"]').addEventListener('click', () => {
        c.stage = 'rejected';
        toast(`${c.display_name} rejected`);
        closeDrawer();
        if (state.currentView === 'pipeline') renderKanban();
        if (state.currentView === 'candidates') renderCandTable();
      });
    } else if (tab === 'scorecards') {
      const scorecards = [
        { who: 'Tomás Reyes · Tech screen · 2026-05-08', rec: 'lean_hire', body: 'Strong systems intuition; designed a sharded counter system end-to-end in 45 min. Communication clear but occasionally jumps ahead of the question. Would be a solid hire at IC3 today, with a path to IC4 in 12mo.' },
        { who: 'Priya Nair · Hiring manager · 2026-05-11', rec: 'hire', body: 'Best candidate I have seen in this loop. Practical bias, asked sharp clarifying questions about the JD and gave concrete examples of where they have shipped under ambiguity. References checked out (3/3 strong).' }
      ];
      body.innerHTML = `
        <div class="drawer-section">
          ${scorecards.map(s => `
            <div class="scorecard">
              <div class="scorecard-head">
                <div class="scorecard-who">${s.who}</div>
                <div class="scorecard-rec ${s.rec}">${s.rec.replace('_',' ')}</div>
              </div>
              <div class="scorecard-body">${s.body}</div>
            </div>
          `).join('')}
          <p style="font-family:var(--mono);font-size:10.5px;color:var(--ink-mute);margin-top:1rem;">2 more scorecards pending from Wei Chen and Diego Marin.</p>
        </div>
      `;
    } else if (tab === 'communications') {
      const emails = [
        { who: `Sofia Vargas → ${c.display_name}`, when: '2026-05-09 09:14', subj: `Step 2 — tech screen with ${r ? r.title : 'us'}`, body: `Hi ${c.given_name || c.display_name.split(' ')[0]} — congrats on clearing the recruiter call. I have asked our engineering team to set up a 60-min technical screen this week or next. Do any of the following times work for you?\n\n• Tue 14:00 GMT\n• Wed 10:30 GMT\n• Thu 16:00 GMT\n\nWe will send a calendar invite once you pick a slot. — Sofia` },
        { who: `${c.display_name} → Sofia Vargas`, when: '2026-05-09 11:38', subj: `Re: Step 2 — tech screen`, body: `Hi Sofia — thank you! Wed 10:30 GMT works best for me. Looking forward to it.` },
        { who: `Tomás Reyes (interviewer) → Sofia Vargas`, when: '2026-05-11 17:22', subj: `Scorecard submitted · ${c.display_name}`, body: `Done. Recommendation lean_hire. Strong technical signal; would love to see one more round with a senior IC partner before making a final call. Notes are in the system.` }
      ];
      body.innerHTML = `
        <div class="drawer-section">
          ${emails.map(e => `
            <div class="email-thread">
              <div class="email-head"><span>${e.who}</span><span>${e.when}</span></div>
              <div class="email-subj">${e.subj}</div>
              <div class="email-body">${e.body.replace(/\n/g, '<br>')}</div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (tab === 'activity') {
      body.innerHTML = `
        <div class="drawer-section">
          <ul class="activity">
            <li><div class="time">${c.stage_entered}</div><div class="ev">Entered <strong>${c.stage}</strong></div></li>
            <li><div class="time">2026-05-08</div><div class="ev">Tech screen completed · ${c.id}</div></li>
            <li><div class="time">2026-05-04</div><div class="ev">Recruiter call scheduled · 30 min</div></li>
            <li><div class="time">2026-05-02</div><div class="ev">Applied via ${c.source || 'inbound'}${c.is_referral ? ' · referred' : ''}</div></li>
          </ul>
        </div>
      `;
    } else if (tab === 'documents') {
      body.innerHTML = `
        <div class="drawer-section">
          <div class="dsec-body">
            <p>📄 <strong>Resume</strong> · ${c.display_name.toLowerCase().replace(/\s/g,'_')}_resume.pdf · 2 pages</p>
            <p>📄 <strong>Cover letter</strong> · uploaded 2026-05-02</p>
            <p>📄 <strong>Code sample</strong> · github.com/${(c.given_name||'sam').toLowerCase()}/distributed-counter</p>
            <p style="margin-top:1rem;color:var(--ink-mute);font-size:13px;">Background check and reference docs will appear here after offer extension.</p>
          </div>
        </div>
      `;
    }
  }

  function aiSummaryForCand(c, r) {
    const role = r ? r.title : 'the role';
    const yrs = c.total_experience_years;
    const exp = c.current_title && c.current_company ? `${c.current_title} at ${c.current_company}` : (c.current_title || 'an independent role');
    const fit = matchScore(c);
    let third = '';
    if (c.stage === 'offer') third = `Offer is in flight at the band P50; estimated acceptance probability ${Math.round((c.predicted_offer_acceptance_probability||0.6)*100)}%.`;
    else if (c.stage === 'interview') third = `Currently in interview; one panel completed with a lean_hire recommendation.`;
    else if (c.stage === 'rejected') third = `Rejected ${c.days_in_stage}d ago for ${c.rejected_reason || 'fit'}; auto-archived.`;
    else if (c.stage === 'accepted') third = `Accepted — onboarding kickoff scheduled for ${c.stage_entered}.`;
    else third = `Currently in ${c.stage}; ${c.days_in_stage}d in this stage.`;
    return `${c.display_name} has ${yrs}y of experience as ${exp}, applying for ${role}${r ? ' (' + r.level + ' · ' + r.location + ')' : ''}. Composite match score is <strong>${fit}/100</strong> — ${fit >= 85 ? 'a strong fit on level, comp band, and location.' : fit >= 70 ? 'a directional fit with minor gaps in experience signal or location.' : 'a stretch fit; recommend stronger qualifying screen.'} ${third}`;
  }

  function aiMatchReasoning(c, r, m) {
    const role = r ? r.title : 'the role';
    const lvl = r ? r.level : 'the target level';
    const bandOK = !c.expected_comp || !r || c.expected_comp <= r.comp_band_p50 * 1.15;
    const locOK = !r ? true : (c.country === r.location.slice(0,2).toUpperCase() || (c.location_preference || '').includes(r.location));

    return `${c.display_name} has <strong>${c.total_experience_years}y</strong> of ${c.current_title || 'relevant'} experience${c.current_company ? ' at ' + c.current_company : ''}, mapping to ${c.highest_level_indicated || lvl} — ${c.highest_level_indicated === lvl ? 'an exact level match' : 'one level off, within range with a stretch hire path'}. ` +
      `Comp expectations ${bandOK ? '<strong>align with the band</strong>' : '<strong>are above the band</strong>'} ($${((c.expected_comp||0)/1000).toFixed(0)}K vs P50 $${((r?.comp_band_p50||0)/1000).toFixed(0)}K). ` +
      `Location-flexibility check: <strong>${locOK ? 'pass' : 'requires conversation'}</strong> (candidate prefers ${c.location_preference || c.country}). ` +
      `${c.is_referral ? 'Referred by an internal employee · referrers are 3.2× more likely to accept. ' : ''}` +
      `${c.is_internal ? 'Internal candidate — fast-tracked through resume screen. ' : ''}` +
      `Source <strong>${c.source || 'inbound'}</strong> historically converts at ${c.source === 'referral' ? '34%' : c.source === 'outbound' ? '18%' : '12%'} from applied → offer. ` +
      `Final score reflects: experience (40%), level fit (20%), comp band (15%), location (10%), source signal (10%), and historical acceptance (5%).`;
  }

  // OFFER DRAWER
  function openOfferDrawer(id) {
    const c = state.candidates.find(x => x.id === id);
    if (!c) return;
    const r = state.reqsById[c.requisition_id];
    const comp = c.offered_comp || c.expected_comp || (r ? r.comp_band_p50 : 100000);
    const bonus = Math.round(comp * 0.15);
    const equity = Math.round(comp * 0.5);
    const signon = 15000;
    const prob = Math.round((c.predicted_offer_acceptance_probability || 0.6) * 100);

    $('#drawer-head').innerHTML = `
      <div class="drawer-eyebrow">§ Offer · ${c.id}</div>
      <h2 class="drawer-title">${c.display_name}</h2>
      <div class="drawer-subtitle">${r ? r.title : c.requisition_id} · ${r ? r.location : ''}</div>
      <div class="drawer-meta">
        <span class="drawer-meta-item"><span class="k">Status</span><span class="v">extended</span></span>
        <span class="drawer-meta-item"><span class="k">Sent</span><span class="v">${c.stage_entered}</span></span>
        <span class="drawer-meta-item"><span class="k">Expires</span><span class="v">2026-05-20</span></span>
        <span class="drawer-meta-item"><span class="k">P(accept)</span><span class="v">${prob}%</span></span>
      </div>
    `;
    $('#drawer-body').innerHTML = `
      <div class="drawer-section">
        <div class="dsec-label">§ Comp breakdown</div>
        <div class="offer-comp-breakdown">
          <div><div class="lbl">Base</div><div class="v">$${(comp/1000).toFixed(0)}K</div></div>
          <div><div class="lbl">Bonus (target)</div><div class="v">$${(bonus/1000).toFixed(0)}K</div></div>
          <div><div class="lbl">Equity (4y)</div><div class="v">$${(equity/1000).toFixed(0)}K</div></div>
          <div><div class="lbl">Sign-on</div><div class="v">$${(signon/1000).toFixed(0)}K</div></div>
        </div>
        <div class="offer-esign">
          <span class="lbl">E-sign · DocuSign envelope ${c.id.slice(-6)}</span>
          <span class="status">SENT · awaiting signature</span>
        </div>
      </div>
      <div class="drawer-section">
        <div class="dsec-label"><span class="ai-mark">AI</span> Offer letter · generated from template</div>
        <div class="offer-letter">Dear ${c.given_name || c.display_name.split(' ')[0]},

We are delighted to extend an offer for the position of <strong>${r ? r.title : 'this role'}</strong> at Tessera Bank, reporting to ${r && state.peopleById[r.hiring_manager_id] ? state.peopleById[r.hiring_manager_id].display_name : 'your hiring manager'} on the ${r ? r.team : ''} team based in <strong>${r ? r.location : '—'}</strong>.

The compensation package is:
  • Base salary: $${comp.toLocaleString()} USD
  • Target annual bonus: $${bonus.toLocaleString()} USD (paid at the discretion of management against agreed objectives)
  • Equity grant: $${equity.toLocaleString()} USD value, vesting 25% / 25% / 25% / 25% over four years with a one-year cliff
  • Sign-on bonus: $${signon.toLocaleString()} USD, payable on Day 1, with a 12-month clawback

Your proposed start date is 2026-06-15. This offer remains open until 2026-05-20. To accept, please countersign the attached agreement via DocuSign.

We are very excited about what you can build with us.

Sincerely,
Sofia Vargas
Talent Acquisition · Tessera Bank</div>
      </div>
      <div class="drawer-section">
        <div class="dsec-label"><span class="ai-mark">AI</span> Acceptance predictor</div>
        <div class="ai-summary"><strong>${prob}% predicted acceptance probability.</strong> Reasoning: base sits at P${comp < (r?.comp_band_p50||0) ? '40' : '55'} of the band (candidate's expected was $${((c.expected_comp||0)/1000).toFixed(0)}K). Competing-offer signal from LinkedIn activity is <strong>moderate</strong>. Sign-on of $15K offsets 12-month equity gap from current employer. Risk: candidate has not engaged with offer email in 38h — recommend a personal call from the hiring manager today.</div>
      </div>
      <div class="drawer-actions">
        <button class="btn btn-ink">Send reminder email</button>
        <button class="btn btn-ochre">Counter-offer</button>
        <button class="btn btn-ghost">Withdraw offer</button>
      </div>
    `;
    openDrawer();
  }

  // ────────────────────────── MODAL · NEW REQ ──────────────
  function initModal() {
    $('#modal-backdrop').addEventListener('click', closeModal);
    $('#modal-close').addEventListener('click', closeModal);
  }
  function openModal() {
    $('#modal-backdrop').classList.add('is-open');
    $('#modal').classList.add('is-open');
  }
  function closeModal() {
    $('#modal-backdrop').classList.remove('is-open');
    $('#modal').classList.remove('is-open');
  }

  function openNewReqModal() {
    $('#modal-body').innerHTML = `
      <div class="modal-inner">
        <div class="modal-eyebrow">§ New requisition</div>
        <h2 class="modal-title">Open a <em>new role.</em></h2>

        <label class="modal-label">Describe the role in one sentence</label>
        <input type="text" class="modal-input" id="new-req-prompt" placeholder="Senior backend engineer for our payments platform, based in London…" />
        <button class="btn btn-ochre" id="ai-draft-btn" style="margin-bottom:1.2rem;"><span class="ai-mark">AI</span> Draft the JD</button>

        <label class="modal-label">JD draft</label>
        <textarea class="modal-textarea" id="new-req-jd" rows="6" placeholder="The AI-generated draft will appear here. Edit freely."></textarea>

        <div class="modal-grid-2">
          <div class="field">
            <label class="modal-label">Title</label>
            <input type="text" class="modal-input" id="new-req-title" placeholder="Senior Software Engineer · Payments" />
          </div>
          <div class="field">
            <label class="modal-label">Level</label>
            <select class="modal-input" id="new-req-level">
              <option>IC1</option><option>IC2</option><option>IC3</option>
              <option selected>IC4</option><option>IC5</option>
              <option>M1</option><option>M2</option><option>M3</option>
            </select>
          </div>
          <div class="field">
            <label class="modal-label">Department</label>
            <select class="modal-input" id="new-req-dept">
              ${uniqueSorted(state.reqs.map(r => r.department)).map(d => `<option>${d}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label class="modal-label">Location</label>
            <select class="modal-input" id="new-req-loc">
              ${uniqueSorted(state.reqs.map(r => r.location)).map(l => `<option>${l}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label class="modal-label">Comp band P50 (USD)</label>
            <input type="text" class="modal-input" id="new-req-comp" placeholder="$150,000" />
          </div>
          <div class="field">
            <label class="modal-label">Hiring manager</label>
            <select class="modal-input" id="new-req-hm">
              ${state.people.filter(p => p.is_manager).slice(0, 50).map(p => `<option>${p.display_name} · ${p.title}</option>`).join('')}
            </select>
          </div>
        </div>

        <label class="modal-label">Approval workflow</label>
        <div class="approval-strip">
          <div class="ap-step pending"><span class="badge">●</span>Hiring manager · waiting</div>
          <div class="ap-step future"><span class="badge">·</span>Finance partner</div>
          <div class="ap-step future"><span class="badge">·</span>HRBP</div>
          <div class="ap-step future"><span class="badge">·</span>Recruitment activated</div>
        </div>

        <div class="modal-row">
          <button type="button" class="btn btn-ghost" id="new-req-cancel">Cancel</button>
          <span style="flex:1"></span>
          <button type="button" class="btn btn-ghost">Save as draft</button>
          <button type="button" class="btn btn-ochre" id="new-req-submit">Open requisition →</button>
        </div>
      </div>
    `;
    $('#new-req-cancel').addEventListener('click', closeModal);
    $('#ai-draft-btn').addEventListener('click', () => {
      const prompt = $('#new-req-prompt').value.trim() || 'Senior software engineer · platform';
      const jd = `About the role\n\nWe are hiring a ${prompt.toLowerCase().includes('manager') ? 'people manager' : 'senior individual contributor'} to ${prompt}. You will own end-to-end delivery of a critical surface area, partnering closely with product, design, and security to ship work that materially moves the business.\n\nWhat you will do\n• Design, build, and operate systems with thousands of concurrent users\n• Lead technical decisions and mentor 2-3 engineers\n• Drive engineering excellence: testing, observability, on-call posture\n• Partner with product to convert vague problems into shipped solutions\n\nWhat you bring\n• 6+ years of full-stack or backend engineering experience\n• Track record shipping production systems at scale\n• Clear written and verbal communication\n• Bias toward learning, ownership, and shipping`;
      $('#new-req-jd').value = jd;
      toast('JD draft generated · review before opening');
    });
    $('#new-req-submit').addEventListener('click', () => {
      toast('Requisition created · sent for hiring-manager approval');
      closeModal();
    });
    openModal();
  }

  // ────────────────────────── SHORTCUTS ──────────────────
  function initShortcuts() {
    let prefix = null;
    let prefixTimer = null;
    window.addEventListener('keydown', e => {
      // Ignore when typing in inputs
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input','textarea','select'].includes(tag)) return;

      if (e.key === '?') { e.preventDefault(); toggleShortcuts(true); return; }
      if (e.key === 'Escape') {
        if ($('#shortcuts').classList.contains('is-open')) toggleShortcuts(false);
        else if (state.drawerOpen) closeDrawer();
        else if ($('#modal').classList.contains('is-open')) closeModal();
        return;
      }
      if (e.key === 'g') {
        prefix = 'g';
        clearTimeout(prefixTimer);
        prefixTimer = setTimeout(() => prefix = null, 1200);
        return;
      }
      if (prefix === 'g') {
        const map = { d:'dashboard', r:'requisitions', p:'pipeline', c:'candidates', s:'scheduling', o:'offers', a:'analytics', i:'integrations' };
        if (map[e.key]) { e.preventDefault(); switchView(map[e.key]); }
        prefix = null;
      }
    });
    $('#shortcuts-close').addEventListener('click', () => toggleShortcuts(false));
    $('#shortcuts').addEventListener('click', e => {
      if (e.target === $('#shortcuts')) toggleShortcuts(false);
    });
  }
  function toggleShortcuts(on) {
    $('#shortcuts').classList.toggle('is-open', on);
  }

  // ────────────────────────── TOAST ───────────────────────
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 2400);
  }

  // ────────────────────────── GO ──────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
