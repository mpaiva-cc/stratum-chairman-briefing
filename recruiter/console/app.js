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

      // ── LLM chrome ──
      bindLLMUI();
      refreshDemoBanner();
      const wantsDemo = /[?&]demo=1/.test(location.search) || location.hash === '#demo';
      if (!LLM.settings.apiKey && !sessionStorage.getItem('stratum_recruiter_skipped_onboarding') && !wantsDemo) {
        setTimeout(() => openOnboarding(), 600);
      }
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
  // ────────────────────────── SCHEDULING ──────────────────
  // Scheduling state (lazily initialized)
  const schedState = {
    initialized: false,
    pending: [],          // candidates needing scheduling
    events: [],           // {col,row,candidateId,interviewers,room,tone,kind}
    activeCandidateId: null,
    selectedInterviewerIds: [],
    selectedSlot: null,   // {col,row}
    venue: 'Conference A · 14 Liberty St',
    useZoom: false,
    message: '',
  };

  function initSchedStateOnce() {
    if (schedState.initialized) return;
    // Synthesize "needs scheduling" flag — ~40% of interview-stage candidates.
    const interviewCands = state.candidates.filter(c => c.stage === 'interview');
    interviewCands.forEach((c, i) => {
      c.next_interview_scheduled = (i % 5 >= 2); // ~60% scheduled, 40% pending
    });
    schedState.pending = interviewCands.filter(c => !c.next_interview_scheduled).slice(0, 10);

    // Synthesize ~12 weekly interviews from the scheduled ones.
    const scheduled = interviewCands.filter(c => c.next_interview_scheduled).slice(0, 12);
    const tones = ['ink', 'moss', 'ochre'];
    const rooms = ['Conference A', 'Conference B', 'Library', 'Quiet Room', 'Zoom · main', 'Annex 3'];
    const kinds = ['screen', 'tech', 'panel', 'culture', 'final', 'loop'];
    const used = new Set();
    scheduled.forEach((c, i) => {
      let col, row, key, attempts = 0;
      do {
        col = (i + attempts) % 5;
        row = Math.floor((i + attempts * 3) / 5) % 6;
        key = `${col}-${row}`;
        attempts++;
      } while (used.has(key) && attempts < 30);
      used.add(key);
      const intIdx1 = (i * 7) % state.people.length;
      const intIdx2 = (i * 11 + 3) % state.people.length;
      schedState.events.push({
        col, row,
        candidateId: c.id,
        candidateName: c.display_name,
        interviewers: [state.people[intIdx1], state.people[intIdx2]].filter(Boolean),
        room: rooms[i % rooms.length],
        tone: tones[i % tones.length],
        kind: kinds[i % kinds.length],
      });
    });
    schedState.initialized = true;
  }

  function renderScheduling() {
    initSchedStateOnce();
    renderPendingList();
    renderCalendar();
    renderSchedBottom();

    const pcEl = $('#sched-pending-count'); if (pcEl) pcEl.textContent = schedState.pending.length;
    const wcEl = $('#sched-week-count'); if (wcEl) wcEl.textContent = schedState.events.length;
    const pmEl = $('#pending-meta'); if (pmEl) pmEl.textContent = `${schedState.pending.length} awaiting panel`;
    const cmEl = $('#cal-meta'); if (cmEl) cmEl.textContent = `${schedState.events.length} interviews scheduled`;
  }

  function renderPendingList() {
    const list = $('#pending-list');
    if (!list) return;
    if (schedState.pending.length === 0) {
      list.innerHTML = `<li class="pending-empty">All caught up. No candidates waiting on a panel.</li>`;
      return;
    }
    list.innerHTML = schedState.pending.map(c => {
      const r = state.reqsById[c.requisition_id];
      return `
        <li class="pending-item" data-id="${c.id}">
          <div class="pn-row">
            <div class="pn-name">${c.display_name}</div>
            <button class="pn-btn" data-id="${c.id}">Schedule →</button>
          </div>
          <div class="pn-meta">${r ? r.title : c.requisition_id} · ${c.days_in_stage}d waiting · needs 4-person panel</div>
        </li>
      `;
    }).join('');
    $$('.pn-btn').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      openScheduleWorkflow(b.dataset.id);
    }));
  }

  function renderCalendar() {
    const days = ['Mon 11', 'Tue 12', 'Wed 13', 'Thu 14', 'Fri 15'];
    const times = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00'];
    const eventsMap = {};
    schedState.events.forEach(ev => {
      const k = `${ev.col}-${ev.row}`;
      eventsMap[k] = eventsMap[k] || [];
      eventsMap[k].push(ev);
    });

    let html = '<div class="cal-grid">';
    html += `<div class="cal-cell header"></div>`;
    days.forEach(d => html += `<div class="cal-cell header">${d}</div>`);
    times.forEach((t, row) => {
      html += `<div class="cal-cell time">${t}</div>`;
      days.forEach((_, col) => {
        const evs = eventsMap[`${col}-${row}`] || [];
        const inner = evs.map(e => {
          const candInit = initials(e.candidateName);
          const intInits = e.interviewers.map(p => initials(p.display_name).slice(0, 2)).join(', ');
          const tip = `${e.candidateName} · ${e.kind}\nInterviewers: ${e.interviewers.map(p => p.display_name).join(', ')}\nRoom: ${e.room}`;
          return `<div class="cal-event ${e.tone === 'ochre' ? '' : e.tone}" title="${tip.replace(/"/g, '&quot;')}">${candInit} · ${e.kind}<span class="cal-event-sub">${intInits} · ${e.room}</span></div>`;
        }).join('');
        html += `<div class="cal-cell">${inner}</div>`;
      });
    });
    html += '</div>';
    $('#cal-wrap').innerHTML = html;
  }

  function renderSchedBottom() {
    const card = $('#sched-bottom-card');
    if (!card) return;
    if (schedState.activeCandidateId) {
      renderScheduleWorkflow(card);
    } else {
      renderPanelSuggest(card);
    }
  }

  function renderPanelSuggest(card) {
    const openReqs = state.reqs.filter(r => r.status === 'open').slice(0, 30);
    card.classList.add('ai-card');
    card.innerHTML = `
      <div class="card-head">
        <div class="card-eyebrow ai"><span class="ai-mark">AI</span> Panel suggestion</div>
        <span class="card-meta">balances availability · diversity · interview load</span>
      </div>
      <div class="panel-suggest-controls">
        <label class="modal-label" for="ai-panel-req">Get AI panel suggestion for</label>
        <div class="ps-row">
          <select class="modal-input" id="ai-panel-req">
            ${openReqs.map(r => `<option value="${r.id}">${r.id} · ${r.title}</option>`).join('')}
          </select>
          <button class="btn btn-ochre" id="ai-panel-go"><span class="ai-mark">AI</span> Suggest</button>
        </div>
      </div>
      <div class="panel-suggest" id="panel-suggest"></div>
    `;
    $('#ai-panel-go').addEventListener('click', () => {
      const reqId = $('#ai-panel-req').value;
      renderPanelSuggestCards(reqId);
      toast('Panel suggestions generated · 3 options ranked by fit');
    });
    if (openReqs[0]) renderPanelSuggestCards(openReqs[0].id);
  }

  function renderPanelSuggestCards(reqId) {
    const r = state.reqsById[reqId];
    const dept = r ? r.department : null;
    let eligible = state.people.filter(p => p.is_manager || p.level?.startsWith('IC4') || p.level?.startsWith('IC5'));
    if (dept) {
      const sameDept = eligible.filter(p => p.department === dept);
      if (sameDept.length >= 12) eligible = sameDept;
    }
    const sample = eligible
      .sort((a,b) => (a.id + b.id).localeCompare(b.id + a.id))
      .slice(0, 12);

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
    // Optional: live AI panel suggestions
    const reqOptions = state.reqs.filter(r => r.status === 'open').slice(0, 50);
    const panelHeader = $('#panel-suggest');
    panelHeader.dataset.canned = '1';
    panelHeader.innerHTML = `
      <div class="panel-toolbar" style="display:flex;gap:.5rem;align-items:center;margin-bottom:.8rem;padding:.5rem .7rem;background:var(--paper-warm);border:1px solid var(--paper-rule);border-radius:3px;font-family:var(--mono);font-size:11px;">
        <span style="color:var(--ink-mute);letter-spacing:.06em;">REQ</span>
        <select id="panel-req-sel" class="select-inline" style="flex:1;min-width:0;">
          ${reqOptions.map(r => `<option value="${r.id}">${r.id} · ${r.title.slice(0,42)}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-ochre btn-sm" id="panel-suggest-btn" style="font-size:10.5px;padding:.25rem .7rem;">
          <span class="ai-mark" id="panel-ai-mark">AI</span> Suggest panel
        </button>
      </div>
      <div id="panel-cards"></div>
    `;
    $('#panel-suggest-btn').addEventListener('click', () => {
      const reqId = $('#panel-req-sel').value;
      if (LLM.settings.apiKey) {
        LLM.streamPanelSuggestion(reqId, '#panel-cards', '#panel-ai-mark');
      } else {
        toast('Connect a Claude API key to suggest panels with AI.');
        openOnboarding('Connect to suggest interview panels with Claude.');
      }
    });
    $('#panel-cards').innerHTML = panels.map(p => `
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

  function openScheduleWorkflow(candId) {
    schedState.activeCandidateId = candId;
    schedState.selectedInterviewerIds = [];
    schedState.selectedSlot = null;
    const c = state.candidates.find(c => c.id === candId);
    const r = c ? state.reqsById[c.requisition_id] : null;
    schedState.message = `Hi ${c ? c.display_name.split(' ')[0] : 'there'},\n\nThanks for your interest in the ${r ? r.title : 'role'} role at Tessera Bank. We'd like to schedule the next round of interviews. Please confirm the time below works for you, and let us know if you need any accommodations.\n\nLooking forward to it.\n\nSofia\nStratum Recruiter`;
    renderSchedBottom();
    setTimeout(() => $('#sched-bottom-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function cancelScheduleWorkflow() {
    schedState.activeCandidateId = null;
    schedState.selectedInterviewerIds = [];
    schedState.selectedSlot = null;
    renderSchedBottom();
  }

  function renderScheduleWorkflow(card) {
    const c = state.candidates.find(c => c.id === schedState.activeCandidateId);
    if (!c) { cancelScheduleWorkflow(); return; }
    const r = state.reqsById[c.requisition_id];
    card.classList.remove('ai-card');

    const deptMatch = r ? state.people.filter(p => p.department === r.department) : state.people;
    const eligible = (deptMatch.length >= 8 ? deptMatch : state.people)
      .filter(p => p.is_manager || p.level?.startsWith('IC3') || p.level?.startsWith('IC4') || p.level?.startsWith('IC5'))
      .sort((a,b) => (a.id + c.id).localeCompare(b.id + c.id))
      .slice(0, 8);

    const availability = {};
    eligible.forEach((p, i) => {
      const hash = (p.id.charCodeAt(p.id.length - 1) + i) % 10;
      availability[p.id] = hash < 7;
    });

    const takenSlots = new Set(schedState.events.map(e => `${e.col}-${e.row}`));
    const days = ['Mon 18', 'Tue 19', 'Wed 20', 'Thu 21', 'Fri 22'];
    const slots = ['09:00', '11:00', '13:00', '15:00'];

    card.innerHTML = `
      <div class="card-head">
        <div class="card-eyebrow">§ Schedule interview · ${c.display_name}</div>
        <button class="btn btn-ghost" id="sw-cancel">Cancel</button>
      </div>

      <div class="sched-workflow">
        <div class="sw-step">
          <div class="sw-step-num">1</div>
          <div class="sw-step-body">
            <div class="sw-step-title">Candidate &amp; requisition</div>
            <div class="sw-confirm">
              <div><span class="sw-k">Candidate</span><span class="sw-v">${c.display_name} · ${c.email || (c.display_name.toLowerCase().split(' ').join('.') + '@example.com')}</span></div>
              <div><span class="sw-k">Requisition</span><span class="sw-v">${r ? `${r.id} · ${r.title}` : c.requisition_id}</span></div>
              <div><span class="sw-k">Stage</span><span class="sw-v">${c.stage} · day ${c.days_in_stage}</span></div>
            </div>
          </div>
        </div>

        <div class="sw-step">
          <div class="sw-step-num">2</div>
          <div class="sw-step-body">
            <div class="sw-step-title">Pick an interview panel <span class="sw-hint">choose 4</span></div>
            <div class="sw-interviewers" id="sw-interviewers">
              ${eligible.map(p => {
                const avail = availability[p.id];
                return `
                  <label class="sw-int ${avail ? '' : 'is-unavailable'}">
                    <input type="checkbox" data-id="${p.id}" ${avail ? '' : 'disabled'} />
                    <span class="sw-int-av">${initials(p.display_name)}</span>
                    <span class="sw-int-meta">
                      <span class="sw-int-name">${p.display_name}</span>
                      <span class="sw-int-role">${p.title}</span>
                    </span>
                    <span class="sw-int-status ${avail ? 'ok' : 'busy'}">${avail ? 'available' : 'unavailable'}</span>
                  </label>
                `;
              }).join('')}
            </div>
            <div class="sw-int-count" id="sw-int-count">0 of 4 selected</div>
          </div>
        </div>

        <div class="sw-step">
          <div class="sw-step-num">3</div>
          <div class="sw-step-body">
            <div class="sw-step-title">Pick a time slot</div>
            <div class="sw-cal" id="sw-cal">
              <div class="sw-cal-head"></div>
              ${days.map(d => `<div class="sw-cal-head">${d}</div>`).join('')}
              ${slots.map((s, row) => {
                let row_html = `<div class="sw-cal-time">${s}</div>`;
                days.forEach((_, col) => {
                  const key = `${col}-${row}`;
                  const taken = takenSlots.has(key);
                  row_html += `<button class="sw-cal-slot ${taken ? 'is-taken' : ''}" data-col="${col}" data-row="${row}" ${taken ? 'disabled' : ''}>${taken ? '·' : ''}</button>`;
                });
                return row_html;
              }).join('')}
            </div>
          </div>
        </div>

        <div class="sw-step">
          <div class="sw-step-num">4</div>
          <div class="sw-step-body">
            <div class="sw-step-title">Venue</div>
            <div class="sw-venue-row">
              <label class="sw-toggle">
                <input type="checkbox" id="sw-zoom" ${schedState.useZoom ? 'checked' : ''} />
                <span class="sw-toggle-track"><span class="sw-toggle-thumb"></span></span>
                <span>Use Zoom link</span>
              </label>
              <input type="text" class="modal-input" id="sw-venue" value="${schedState.useZoom ? 'Zoom · auto-generated link' : schedState.venue}" placeholder="Conference A · 14 Liberty St" ${schedState.useZoom ? 'disabled' : ''} />
            </div>
          </div>
        </div>

        <div class="sw-step">
          <div class="sw-step-num">5</div>
          <div class="sw-step-body">
            <div class="sw-step-title">Message to candidate</div>
            <textarea class="modal-textarea" id="sw-message" rows="6">${schedState.message}</textarea>
          </div>
        </div>

        <div class="sw-actions">
          <button class="btn btn-ghost" id="sw-cancel-2">Cancel</button>
          <span style="flex:1"></span>
          <button class="btn btn-ochre" id="sw-send" disabled>Send invite →</button>
        </div>
      </div>
    `;

    $$('#sw-interviewers input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        const selected = $$('#sw-interviewers input[type=checkbox]:checked');
        if (selected.length > 4) { cb.checked = false; toast('Maximum 4 interviewers'); return; }
        schedState.selectedInterviewerIds = selected.map(x => x.dataset.id);
        $('#sw-int-count').textContent = `${schedState.selectedInterviewerIds.length} of 4 selected`;
        updateSendBtn();
      });
    });

    $$('#sw-cal .sw-cal-slot').forEach(b => {
      b.addEventListener('click', () => {
        if (b.disabled) return;
        $$('#sw-cal .sw-cal-slot').forEach(x => x.classList.remove('is-selected'));
        b.classList.add('is-selected');
        schedState.selectedSlot = { col: +b.dataset.col, row: +b.dataset.row };
        updateSendBtn();
      });
    });

    $('#sw-zoom').addEventListener('change', e => {
      schedState.useZoom = e.target.checked;
      $('#sw-venue').disabled = schedState.useZoom;
      $('#sw-venue').value = schedState.useZoom ? 'Zoom · auto-generated link' : schedState.venue;
    });
    $('#sw-venue').addEventListener('input', e => { if (!schedState.useZoom) schedState.venue = e.target.value; });
    $('#sw-message').addEventListener('input', e => { schedState.message = e.target.value; });
    $('#sw-cancel').addEventListener('click', cancelScheduleWorkflow);
    $('#sw-cancel-2').addEventListener('click', cancelScheduleWorkflow);
    $('#sw-send').addEventListener('click', () => submitSchedule(c, r));

    function updateSendBtn() {
      const ok = schedState.selectedInterviewerIds.length === 4 && schedState.selectedSlot;
      $('#sw-send').disabled = !ok;
    }
  }

  function submitSchedule(candidate, req) {
    const slot = schedState.selectedSlot;
    if (!slot || schedState.selectedInterviewerIds.length !== 4) {
      toast('Pick 4 interviewers and a time slot');
      return;
    }
    schedState.pending = schedState.pending.filter(c => c.id !== candidate.id);
    candidate.next_interview_scheduled = true;

    const interviewers = schedState.selectedInterviewerIds
      .map(id => state.peopleById[id])
      .filter(Boolean);

    // Place into this-week grid for visual feedback (find first free slot)
    const taken = new Set(schedState.events.map(e => `${e.col}-${e.row}`));
    let placed = false;
    for (let col = 0; col < 5 && !placed; col++) {
      for (let row = 0; row < 6 && !placed; row++) {
        const k = `${col}-${row}`;
        if (!taken.has(k)) {
          schedState.events.push({
            col, row,
            candidateId: candidate.id,
            candidateName: candidate.display_name,
            interviewers,
            room: schedState.useZoom ? 'Zoom · main' : (schedState.venue || 'Conference A'),
            tone: 'ochre',
            kind: 'panel',
          });
          placed = true;
        }
      }
    }

    const candEmail = candidate.email || (candidate.display_name.toLowerCase().split(' ').join('.') + '@example.com');
    toast(`Interview scheduled. Invite sent to ${candEmail} and ${interviewers.length} interviewers.`);

    schedState.activeCandidateId = null;
    schedState.selectedInterviewerIds = [];
    schedState.selectedSlot = null;
    renderScheduling();
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
        name: 'Career site',
        items: [
          ['Public career site (live)','live','../careers/'],
          ['Custom domain · jobs.tessera.example','live'],
          ['Job board syndication · LinkedIn, Indeed, Glassdoor','live']
        ]
      },
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
          ${c.items.map(([n, s, href]) => `
            <div class="int-card">
              <div class="int-name">${n}</div>
              <div class="int-foot">
                <span class="status-pill ${s}">${s}</span>
                ${href
                  ? `<a class="int-connect" href="${href}" target="_blank" rel="noopener" style="text-decoration:none;">open →</a>`
                  : `<button class="int-connect">${s === 'live' ? 'manage →' : s === 'beta' ? 'try beta →' : 'request →'}</button>`}
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `).join('');
  }

  // ────────────────────────── SETTINGS ───────────────────
  const SETTINGS_KEY = 'stratum_recruiter_settings';

  function defaultSettings() {
    return {
      account: {
        email: 'sofia.vargas@stratum.example',
        displayName: 'Sofia Vargas',
        timezone: 'America/Los_Angeles',
      },
      team: [],
      branding: {
        companyName: 'Tessera Bank',
        primaryColor: '#b8651f',
        logo: '',
      },
      ai: {
        allowAutoReject: false,
        showMatchReasoning: true,
        surfacePanelSuggestionsFirst: true,
        enableOfferDrafting: true,
        reasoningDepth: 'standard',
      },
      connectedApps: { slack: true, teams: true, google: true, okta: true },
      auditLog: [],
    };
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return defaultSettings();
      const parsed = JSON.parse(raw);
      const d = defaultSettings();
      return {
        ...d, ...parsed,
        account: { ...d.account, ...(parsed.account || {}) },
        branding: { ...d.branding, ...(parsed.branding || {}) },
        ai: { ...d.ai, ...(parsed.ai || {}), allowAutoReject: false },
        connectedApps: { ...d.connectedApps, ...(parsed.connectedApps || {}) },
        team: Array.isArray(parsed.team) ? parsed.team : d.team,
        auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : d.auditLog,
      };
    } catch (e) {
      console.warn('Failed to load settings', e);
      return defaultSettings();
    }
  }

  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); return true; }
    catch (e) { console.warn('Failed to save settings', e); return false; }
  }

  function logAudit(s, msg) {
    s.auditLog = s.auditLog || [];
    s.auditLog.unshift({ ts: new Date().toISOString(), event: msg });
    if (s.auditLog.length > 40) s.auditLog = s.auditLog.slice(0, 40);
  }

  function seedTeamIfEmpty(s) {
    if (s.team.length > 0) return;
    const peopleDept = state.people.filter(p => p.department === 'People');
    const recruiters = peopleDept.filter(p => /recruit|talent|sourcer|partner/i.test(p.title)).slice(0, 3);
    const managers = peopleDept.filter(p => p.is_manager || /manager|director|lead/i.test(p.title)).slice(0, 2);
    let picks = [...recruiters, ...managers];
    if (picks.length < 5) {
      const filler = state.people.filter(p => p.is_manager && !picks.includes(p)).slice(0, 5 - picks.length);
      picks = picks.concat(filler);
    }
    s.team = picks.slice(0, 5).map(p => ({
      id: p.id,
      name: p.display_name,
      role: p.title,
      email: p.email || `${p.display_name.toLowerCase().split(' ').join('.')}@stratum.example`,
    }));
  }

  function seedAuditIfEmpty(s) {
    if (s.auditLog.length > 0) return;
    const now = Date.now();
    const events = [
      'Candidate CAND-00731 moved from screen to interview',
      'Offer sent · CAND-00482 · $148K base',
      'Requisition REQ-00112 opened by Marcus Liu',
      'AI policy: match reasoning enabled by Sofia Vargas',
      'EU AI Act transparency log exported · YTD',
      'NYC AEDT bias audit completed · no disparate impact',
      'Candidate CAND-00604 advanced to final',
      'Offer accepted · CAND-00318',
      'Sofia Vargas signed in · IP 84.92.x.x',
      'API key rotated · pk_live_…4k2x',
      'Calendar integration refreshed (Google)',
      'Interviewer panel approved · REQ-00088',
      'Candidate CAND-00829 rejected by hiring manager',
      'GDPR deletion fulfilled · CAND-00721',
      'New requisition draft saved · REQ-00141',
      'Reminder sent · 3 stale candidates in screen',
      'Slack integration health check passed',
      'Offer extended · CAND-00501 · accept deadline 2026-05-20',
      'Interview rescheduled · CAND-00633',
      'Saved view created: "EMEA · open senior eng"',
    ];
    s.auditLog = events.map((e, i) => ({
      ts: new Date(now - i * 1000 * 60 * 47).toISOString(),
      event: e,
    }));
  }

  function fmtRelTime(iso) {
    const t = new Date(iso).getTime();
    const diff = Math.max(1, Math.floor((Date.now() - t) / 1000));
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function downloadCsv(filename, rows) {
    const csv = rows.map(r => r.map(c => {
      const s = String(c == null ? '' : c);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  }

  function renderSettings() {
    const s = loadSettings();
    seedTeamIfEmpty(s);
    seedAuditIfEmpty(s);
    saveSettings(s);

    const grid = $('#settings-grid');
    if (!grid) return;
    grid.innerHTML = `
      <article class="card">
        <div class="card-head"><div class="card-eyebrow">§ Account</div></div>
        <div class="set-form">
          <div class="set-field"><label class="modal-label">Email</label>
            <input type="email" class="modal-input" id="set-email" value="${s.account.email}" readonly />
          </div>
          <div class="set-field"><label class="modal-label">Display name</label>
            <input type="text" class="modal-input" id="set-name" value="${s.account.displayName}" />
          </div>
          <div class="set-field"><label class="modal-label">Time zone</label>
            <select class="modal-input" id="set-tz">
              ${[
                ['America/Los_Angeles', 'PT · Los Angeles'],
                ['America/Denver', 'MT · Denver'],
                ['America/Chicago', 'CT · Chicago'],
                ['America/New_York', 'ET · New York'],
                ['Europe/London', 'GMT · London'],
                ['Europe/Berlin', 'CET · Berlin'],
                ['Asia/Singapore', 'SGT · Singapore'],
                ['Asia/Tokyo', 'JST · Tokyo'],
                ['Australia/Sydney', 'AET · Sydney'],
              ].map(([v, l]) => `<option value="${v}" ${v === s.account.timezone ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-ochre" id="set-account-save">Update profile</button>
        </div>
      </article>

      <article class="card">
        <div class="card-head">
          <div class="card-eyebrow">§ Team</div>
          <button class="btn btn-ghost" id="set-team-invite">+ Invite teammate</button>
        </div>
        <ul class="team-list" id="team-list"></ul>
      </article>

      <article class="card">
        <div class="card-head"><div class="card-eyebrow">§ Branding</div></div>
        <div class="set-form">
          <div class="set-field"><label class="modal-label">Company name</label>
            <input type="text" class="modal-input" id="set-brand-name" value="${s.branding.companyName}" />
          </div>
          <div class="set-field"><label class="modal-label">Primary accent</label>
            <div class="color-row">
              <input type="color" class="set-color" id="set-brand-color" value="${s.branding.primaryColor}" />
              <span class="color-hex" id="set-brand-hex">${s.branding.primaryColor}</span>
            </div>
          </div>
          <div class="set-field"><label class="modal-label">Logo</label>
            <input type="file" class="set-file" id="set-brand-logo" accept="image/*" />
            <div class="file-status" id="set-brand-logo-status">${s.branding.logo ? `uploaded: ${s.branding.logo}` : 'no file selected'}</div>
          </div>
          <div class="set-actions">
            <button class="btn btn-ochre" id="set-brand-save">Save branding</button>
            <a class="btn btn-ghost" href="../careers/" target="_blank">Preview career site ↗</a>
          </div>
        </div>
      </article>

      <article class="card">
        <div class="card-head"><div class="card-eyebrow">§ AI policies</div></div>
        <div class="set-form">
          <label class="set-toggle is-locked">
            <input type="checkbox" disabled />
            <span class="set-toggle-track"><span class="set-toggle-thumb"></span></span>
            <span class="set-toggle-lbl">
              <strong>Allow AI to suggest candidate rejections</strong>
              <em>Stratum Recruiter does not auto-reject; this setting is permanent.</em>
            </span>
          </label>
          <label class="set-toggle">
            <input type="checkbox" id="ai-match-reasoning" ${s.ai.showMatchReasoning ? 'checked' : ''} />
            <span class="set-toggle-track"><span class="set-toggle-thumb"></span></span>
            <span class="set-toggle-lbl"><strong>Show AI match reasoning to interviewers</strong></span>
          </label>
          <label class="set-toggle">
            <input type="checkbox" id="ai-panel-first" ${s.ai.surfacePanelSuggestionsFirst ? 'checked' : ''} />
            <span class="set-toggle-track"><span class="set-toggle-thumb"></span></span>
            <span class="set-toggle-lbl"><strong>Surface AI panel suggestions before manual selection</strong></span>
          </label>
          <label class="set-toggle">
            <input type="checkbox" id="ai-offer-drafting" ${s.ai.enableOfferDrafting ? 'checked' : ''} />
            <span class="set-toggle-track"><span class="set-toggle-thumb"></span></span>
            <span class="set-toggle-lbl"><strong>Enable AI offer-drafting</strong></span>
          </label>
          <div class="set-field"><label class="modal-label">Default reasoning depth</label>
            <select class="modal-input" id="ai-depth">
              <option value="quick" ${s.ai.reasoningDepth === 'quick' ? 'selected' : ''}>Quick</option>
              <option value="standard" ${s.ai.reasoningDepth === 'standard' ? 'selected' : ''}>Standard</option>
              <option value="deep" ${s.ai.reasoningDepth === 'deep' ? 'selected' : ''}>Deep</option>
            </select>
          </div>
          <button class="btn btn-ochre" id="set-ai-save">Save AI policies</button>
        </div>
      </article>

      <article class="card">
        <div class="card-head"><div class="card-eyebrow">§ Compliance</div></div>
        <dl class="kv">
          <dt>NYC AEDT audit</dt><dd>Ready · last run ${new Date().toISOString().slice(0,10)}</dd>
          <dt>EU AI Act</dt><dd>Limited risk · renewed quarterly</dd>
          <dt>California SB 1162</dt><dd>Comp band auto-disclosed</dd>
          <dt>EEO-1 reporting</dt><dd>Ready for export</dd>
        </dl>
        <div class="set-actions" style="margin-top:1rem;">
          <button class="btn btn-ochre" id="set-export-eeo">Export EEO-1 report</button>
        </div>
      </article>

      <article class="card">
        <div class="card-head"><div class="card-eyebrow">§ API keys</div></div>
        <div class="set-form">
          <div class="set-field"><label class="modal-label">Stratum API key</label>
            <input type="text" class="modal-input mono-input" value="sk_recruiter_••••••••sof2" readonly />
          </div>
          <div class="set-field"><label class="modal-label">Anthropic API key (BYOK) <span class="status-pill live">connected</span></label>
            <input type="text" class="modal-input mono-input" value="sk-ant-••••••••••sof2" readonly />
          </div>
          <button class="btn btn-ghost" id="set-regen-key">Regenerate Stratum key</button>
        </div>
      </article>

      <article class="card">
        <div class="card-head"><div class="card-eyebrow">§ Connected apps</div></div>
        <ul class="apps-list" id="apps-list"></ul>
      </article>

      <article class="card span-3">
        <div class="card-head">
          <div class="card-eyebrow">§ Audit log</div>
          <button class="btn btn-ghost" id="set-export-audit">Export audit log</button>
        </div>
        <ul class="activity" id="audit-list"></ul>
      </article>

      <article class="card span-3 danger-zone">
        <div class="card-head"><div class="card-eyebrow danger">§ Danger zone</div></div>
        <div class="dz-grid">
          <div class="dz-row">
            <div>
              <strong>Reset all settings to default</strong>
              <p>Clears every preference, team list, AI policy, and audit log entry.</p>
            </div>
            <button class="btn btn-danger" id="set-reset">Reset settings</button>
          </div>
          <div class="dz-row">
            <div>
              <strong>Delete account</strong>
              <p>Disabled in demo build. Contact your workspace admin.</p>
            </div>
            <button class="btn btn-danger" disabled>Delete account</button>
          </div>
        </div>
      </article>
    `;

    // Account
    $('#set-account-save').addEventListener('click', () => {
      const name = $('#set-name').value.trim();
      if (!name) { toast('Display name is required'); return; }
      s.account.displayName = name;
      s.account.timezone = $('#set-tz').value;
      logAudit(s, `Profile updated · name="${s.account.displayName}", tz=${s.account.timezone}`);
      saveSettings(s);
      toast('Profile updated · saved to this workspace');
    });

    // Team
    renderTeamList(s);
    $('#set-team-invite').addEventListener('click', () => openInviteTeammateModal(s));

    // Branding
    $('#set-brand-color').addEventListener('input', e => {
      $('#set-brand-hex').textContent = e.target.value;
    });
    $('#set-brand-logo').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) { $('#set-brand-logo-status').textContent = `uploaded: ${f.name}`; s.branding.logo = f.name; }
    });
    $('#set-brand-save').addEventListener('click', () => {
      const name = $('#set-brand-name').value.trim();
      if (!name) { toast('Company name is required'); return; }
      s.branding.companyName = name;
      s.branding.primaryColor = $('#set-brand-color').value;
      logAudit(s, `Branding updated · ${s.branding.companyName} · ${s.branding.primaryColor}`);
      saveSettings(s);
      toast('Branding saved');
    });

    // AI policies
    $('#set-ai-save').addEventListener('click', () => {
      s.ai.showMatchReasoning = $('#ai-match-reasoning').checked;
      s.ai.surfacePanelSuggestionsFirst = $('#ai-panel-first').checked;
      s.ai.enableOfferDrafting = $('#ai-offer-drafting').checked;
      s.ai.reasoningDepth = $('#ai-depth').value;
      logAudit(s, `AI policies updated · depth=${s.ai.reasoningDepth}`);
      saveSettings(s);
      toast('AI policies saved');
    });

    // Compliance export
    $('#set-export-eeo').addEventListener('click', () => {
      const rows = [
        ['report_id', 'period', 'job_category', 'gender', 'race_ethnicity', 'count'],
        ['EEO1-2026Q1', '2026-Q1', 'Professionals', 'F', 'Hispanic or Latino', '142'],
        ['EEO1-2026Q1', '2026-Q1', 'Professionals', 'M', 'Hispanic or Latino', '128'],
        ['EEO1-2026Q1', '2026-Q1', 'Professionals', 'F', 'White', '241'],
        ['EEO1-2026Q1', '2026-Q1', 'Professionals', 'M', 'White', '298'],
        ['EEO1-2026Q1', '2026-Q1', 'Professionals', 'F', 'Black or African American', '88'],
        ['EEO1-2026Q1', '2026-Q1', 'Professionals', 'M', 'Black or African American', '74'],
        ['EEO1-2026Q1', '2026-Q1', 'Professionals', 'F', 'Asian', '186'],
        ['EEO1-2026Q1', '2026-Q1', 'Professionals', 'M', 'Asian', '203'],
      ];
      downloadCsv(`eeo1-${new Date().toISOString().slice(0,10)}.csv`, rows);
      logAudit(s, 'EEO-1 report exported');
      saveSettings(s);
      toast('EEO-1 report downloaded');
    });

    // API key regen
    $('#set-regen-key').addEventListener('click', () => {
      if (!confirm('Regenerate the Stratum API key? Active integrations will need to be updated.')) return;
      logAudit(s, 'Stratum API key regenerated');
      saveSettings(s);
      toast('New API key generated · update your integrations');
    });

    // Connected apps
    renderConnectedApps(s);

    // Audit log
    renderAuditList(s);
    $('#set-export-audit').addEventListener('click', () => {
      const rows = [['timestamp', 'event'], ...s.auditLog.map(e => [e.ts, e.event])];
      downloadCsv(`audit-log-${new Date().toISOString().slice(0,10)}.csv`, rows);
      toast('Audit log downloaded');
    });

    // Danger zone
    $('#set-reset').addEventListener('click', () => {
      if (!confirm('Reset all settings to default? This cannot be undone.')) return;
      if (!confirm('Really reset? Team list, AI policies, and audit log will be cleared.')) return;
      localStorage.removeItem(SETTINGS_KEY);
      toast('All settings reset to default');
      renderSettings();
    });
  }

  function renderTeamList(s) {
    const ul = $('#team-list');
    if (!ul) return;
    if (!s.team.length) {
      ul.innerHTML = `<li class="team-empty">No teammates yet. Invite someone to get started.</li>`;
      return;
    }
    ul.innerHTML = s.team.map(m => `
      <li class="team-row">
        <span class="team-av">${initials(m.name)}</span>
        <div class="team-meta">
          <div class="team-name">${m.name}</div>
          <div class="team-role">${m.role} · ${m.email}</div>
        </div>
        <button class="btn-row-action" data-id="${m.id}">remove</button>
      </li>
    `).join('');
    $$('.btn-row-action', ul).forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id;
      const member = s.team.find(x => x.id === id);
      if (!member) return;
      if (!confirm(`Remove ${member.name} from the team?`)) return;
      s.team = s.team.filter(x => x.id !== id);
      logAudit(s, `Teammate removed · ${member.name}`);
      saveSettings(s);
      renderTeamList(s);
      toast(`${member.name} removed`);
    }));
  }

  function openInviteTeammateModal(s) {
    $('#modal-body').innerHTML = `
      <div class="modal-inner">
        <div class="modal-eyebrow">§ Invite teammate</div>
        <h2 class="modal-title">Add a <em>teammate.</em></h2>

        <label class="modal-label">Work email</label>
        <input type="email" class="modal-input" id="inv-email" placeholder="teammate@stratum.example" />

        <label class="modal-label">Display name</label>
        <input type="text" class="modal-input" id="inv-name" placeholder="Alex Chen" />

        <label class="modal-label">Role</label>
        <select class="modal-input" id="inv-role">
          <option>Recruiter</option>
          <option>Senior Recruiter</option>
          <option>Sourcer</option>
          <option>Recruiting Coordinator</option>
          <option>Hiring Manager</option>
          <option>Admin</option>
        </select>

        <div class="modal-row">
          <button type="button" class="btn btn-ghost" id="inv-cancel">Cancel</button>
          <span style="flex:1"></span>
          <button type="button" class="btn btn-ochre" id="inv-submit">Send invite →</button>
        </div>
      </div>
    `;
    $('#inv-cancel').addEventListener('click', closeModal);
    $('#inv-submit').addEventListener('click', () => {
      const email = $('#inv-email').value.trim();
      const name = $('#inv-name').value.trim();
      const role = $('#inv-role').value;
      if (!email || !/.+@.+\..+/.test(email)) { toast('Enter a valid work email'); return; }
      if (!name) { toast('Enter a display name'); return; }
      const id = `INV-${Date.now().toString(36)}`;
      s.team.push({ id, name, role, email });
      logAudit(s, `Teammate invited · ${name} <${email}> as ${role}`);
      saveSettings(s);
      renderTeamList(s);
      closeModal();
      toast(`Invite sent to ${email}`);
    });
    openModal();
  }

  function renderConnectedApps(s) {
    const ul = $('#apps-list');
    if (!ul) return;
    const apps = [
      { key: 'slack', name: 'Slack', desc: 'Pipeline alerts · scorecard nudges' },
      { key: 'teams', name: 'Microsoft Teams', desc: 'Interview invites · DMs' },
      { key: 'google', name: 'Google Workspace', desc: 'Calendar · Drive · SSO' },
      { key: 'okta', name: 'Okta', desc: 'SSO + SCIM provisioning' },
    ];
    ul.innerHTML = apps.map(a => {
      const connected = !!s.connectedApps[a.key];
      return `
        <li class="app-row">
          <div class="app-meta">
            <div class="app-name">${a.name}</div>
            <div class="app-desc">${a.desc}</div>
          </div>
          <span class="status-pill ${connected ? 'live' : 'planned'}">${connected ? 'connected' : 'disconnected'}</span>
          <button class="btn-row-action" data-key="${a.key}">${connected ? 'disconnect' : 'connect'}</button>
        </li>
      `;
    }).join('');
    $$('.btn-row-action', ul).forEach(b => b.addEventListener('click', () => {
      const key = b.dataset.key;
      const app = apps.find(a => a.key === key);
      const wasConnected = !!s.connectedApps[key];
      if (wasConnected) {
        if (!confirm(`Disconnect ${app.name}? Recruiter workflows tied to this app will pause.`)) return;
        s.connectedApps[key] = false;
        logAudit(s, `${app.name} disconnected`);
      } else {
        s.connectedApps[key] = true;
        logAudit(s, `${app.name} connected`);
      }
      saveSettings(s);
      renderConnectedApps(s);
      toast(`${app.name} ${wasConnected ? 'disconnected' : 'connected'}`);
    }));
  }

  function renderAuditList(s) {
    const ul = $('#audit-list');
    if (!ul) return;
    const show = s.auditLog.slice(0, 20);
    ul.innerHTML = show.map(a => {
      const rel = fmtRelTime(a.ts);
      const date = new Date(a.ts);
      const stamp = `${date.toISOString().slice(0,10)} ${date.toTimeString().slice(0,5)}`;
      return `
        <li>
          <div class="time">${rel}</div>
          <div class="ev"><strong>${stamp}</strong> · ${a.event}</div>
        </li>
      `;
    }).join('');
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
    // Reset AI-stream cache so re-opening the same candidate re-streams.
    if (typeof LLM !== 'undefined') {
      LLM._candCache = null;
      try { LLM.session.streamAbort && LLM.session.streamAbort.abort(); } catch (_) {}
    }
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
          <div class="dsec-label"><span class="ai-mark" id="ai-cand-summary-mark">AI</span> Summary</div>
          <div class="ai-summary" id="ai-cand-summary">${aiSummaryForCand(c, r)}</div>
        </div>
        <div class="drawer-section">
          <div class="dsec-label"><span class="ai-mark" id="ai-cand-match-mark">AI</span> Match reasoning · score ${match}</div>
          <div class="ai-match-card"><div class="ai-match-body" id="ai-cand-match">${aiMatchReasoning(c, r, match)}</div></div>
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
      // ── Real Claude: stream AI summary + match reasoning ──
      // Gate by per-candidate cache key so re-clicking the overview tab
      // doesn't re-fire (and re-bill) calls for data we already have.
      if (LLM.settings.apiKey) {
        const cacheKey = c.id + '|' + (r ? r.id : '');
        if (LLM._candCache !== cacheKey) {
          LLM._candCache = cacheKey;
          LLM.streamCandidateSummary(c, r, '#ai-cand-summary', '#ai-cand-summary-mark');
          if (r) LLM.streamMatchReasoning(c, r, match, '#ai-cand-match', '#ai-cand-match-mark');
        }
      }
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
        <div class="dsec-label">
          <span class="ai-mark" id="ai-offer-mark">AI</span> Offer letter · generated from template
          <button class="btn btn-ghost btn-sm" id="ai-offer-draft" style="margin-left:.8rem;font-size:10.5px;padding:.2rem .55rem;">AI Draft</button>
        </div>
        <div class="offer-letter" id="ai-offer-letter">Dear ${c.given_name || c.display_name.split(' ')[0]},

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
    const draftBtn = $('#ai-offer-draft');
    if (draftBtn) draftBtn.addEventListener('click', () => {
      if (!LLM.settings.apiKey) {
        toast('Connect a Claude API key to draft with AI.');
        openOnboarding('Connect to draft offer letters with Claude.');
        return;
      }
      LLM.streamOfferLetter(c, r, '#ai-offer-letter', '#ai-offer-mark');
    });
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
    $('#ai-draft-btn').addEventListener('click', async () => {
      const prompt = $('#new-req-prompt').value.trim() || 'Senior software engineer · platform';
      if (LLM.settings.apiKey) {
        await LLM.streamJDDraft(prompt);
      } else {
        const jd = `About the role\n\nWe are hiring a ${prompt.toLowerCase().includes('manager') ? 'people manager' : 'senior individual contributor'} to ${prompt}. You will own end-to-end delivery of a critical surface area, partnering closely with product, design, and security to ship work that materially moves the business.\n\nWhat you will do\n• Design, build, and operate systems with thousands of concurrent users\n• Lead technical decisions and mentor 2-3 engineers\n• Drive engineering excellence: testing, observability, on-call posture\n• Partner with product to convert vague problems into shipped solutions\n\nWhat you bring\n• 6+ years of full-stack or backend engineering experience\n• Track record shipping production systems at scale\n• Clear written and verbal communication\n• Bias toward learning, ownership, and shipping`;
        $('#new-req-jd').value = jd;
        toast('JD draft generated · review before opening (demo template)');
      }
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

  // ═════════════════════════════════════════════════════════════
  // ░░░░░░░░░░░░░░░░░░  LLM CLIENT — REAL CLAUDE  ░░░░░░░░░░░░░
  // ═════════════════════════════════════════════════════════════
  // Direct browser → api.anthropic.com calls.
  // Mirrors the HCM Console pattern, adapted for Recruiter features:
  //   · candidate summary (streamed)
  //   · match reasoning (streamed)
  //   · JD draft (streamed + tool-extracted fields)
  //   · offer letter (streamed)
  //   · interview panel suggestion (tool output)
  // ═════════════════════════════════════════════════════════════

  const LLM = {
    API_URL: 'https://api.anthropic.com/v1/messages',
    VERSION: '2023-06-01',

    MODELS: {
      'claude-sonnet-4-6':         { label: 'Sonnet 4.6 · balanced', inputPerM: 3,  outputPerM: 15, thinking: true },
      'claude-opus-4-7':           { label: 'Opus 4.7 · deepest',    inputPerM: 15, outputPerM: 75, thinking: true },
      'claude-haiku-4-5-20251001': { label: 'Haiku 4.5 · fastest',   inputPerM: 1,  outputPerM: 5,  thinking: false },
    },

    session: { cost: 0, inFlight: false, streamAbort: null },

    settings: {
      get model()    { return localStorage.getItem('stratum_recruiter_model')  || 'claude-sonnet-4-6'; },
      set model(v)   { localStorage.setItem('stratum_recruiter_model', v); },
      get effort()   { return localStorage.getItem('stratum_recruiter_effort') || 'standard'; },
      set effort(v)  { localStorage.setItem('stratum_recruiter_effort', v); },
      get apiKey()   { return localStorage.getItem('anthropic_api_key') || ''; },
      set apiKey(v)  { if (v) localStorage.setItem('anthropic_api_key', v); else localStorage.removeItem('anthropic_api_key'); },
      get thinkingBudget() {
        const e = this.effort;
        if (e === 'quick') return 0;
        if (e === 'deep')  return 8000;
        return 2000;
      },
    },

    computeCost(model, usage) {
      const m = LLM.MODELS[model] || LLM.MODELS['claude-sonnet-4-6'];
      const inp    = (usage.input_tokens || 0)                * m.inputPerM  / 1e6;
      const cacheW = (usage.cache_creation_input_tokens || 0) * m.inputPerM * 1.25 / 1e6;
      const cacheR = (usage.cache_read_input_tokens || 0)     * m.inputPerM * 0.1  / 1e6;
      const out    = (usage.output_tokens || 0)               * m.outputPerM / 1e6;
      return inp + cacheW + cacheR + out;
    },

    // ── System prompt (Recruiter agent) ──
    buildSystem() {
      const asOf = '2026-05-13';
      return [{
        type: 'text',
        text:
`You are the Stratum Recruiter assistant — an AI for enterprise recruiters working in the Stratum Recruiter ATS. You help with: summarizing candidates, explaining why a candidate matches a requisition, drafting job descriptions from a brief, drafting offer letters, and suggesting interview panels.

Constraints:
- Never auto-reject a candidate. If asked to, respond with a recommendation to advance OR a flagging note for the recruiter to review.
- Never invent comp data. If you don't have the comp band, ask for it.
- Always cite the data you used (candidate id, requisition id, comp band id).
- Keep tone professional, warm, specific. You are speaking to a busy recruiter who needs the answer in 3 sentences when possible.
- For panel suggestions, balance diversity, load, and seniority.

Today is ${asOf}. The workspace is Tessera Bank — ${state.reqs.length} requisitions, ${state.candidates.length} candidates, ${state.people.length} employees in the people graph.

Workflow:
1. Call data-fetch tools (\`summarize_candidate\`, \`match_candidate_to_req\`, \`get_candidate_offer_context\`, \`get_panel_candidates\`) to gather grounded context.
2. Produce the answer as streamed text, OR — for JD drafts and panel suggestions — call the structured output tools (\`draft_jd_fields\`, \`propose_panels\`).
3. Cite ids in your final text.`,
        cache_control: { type: 'ephemeral' },
      }];
    },

    // ── Tools ──
    buildTools() {
      return [
        {
          name: 'summarize_candidate',
          description: 'Get a candidate record (and the matched requisition, if any) for summary generation.',
          input_schema: {
            type: 'object',
            required: ['candidate_id'],
            properties: { candidate_id: { type: 'string', description: 'Candidate id, e.g. CAND-00123' } }
          }
        },
        {
          name: 'match_candidate_to_req',
          description: 'Get a candidate and a specific requisition record together for match reasoning.',
          input_schema: {
            type: 'object',
            required: ['candidate_id', 'requisition_id'],
            properties: {
              candidate_id:   { type: 'string' },
              requisition_id: { type: 'string' }
            }
          }
        },
        {
          name: 'get_candidate_offer_context',
          description: 'Get the candidate + requisition + comp band info needed to draft an offer letter.',
          input_schema: {
            type: 'object',
            required: ['candidate_id', 'requisition_id'],
            properties: {
              candidate_id:   { type: 'string' },
              requisition_id: { type: 'string' }
            }
          }
        },
        {
          name: 'get_panel_candidates',
          description: 'Get the hiring manager and a pool of potential interviewer candidates from the people graph for a given requisition.',
          input_schema: {
            type: 'object',
            required: ['requisition_id'],
            properties: { requisition_id: { type: 'string' } }
          }
        },
        // ── Structured-output tools ──
        {
          name: 'draft_jd_fields',
          description: 'Emit a structured JD draft. Call this once with the full draft; the recruiter will see fields populate in the form.',
          input_schema: {
            type: 'object',
            required: ['title', 'summary', 'responsibilities', 'requirements'],
            properties: {
              title:             { type: 'string', description: 'Role title' },
              summary:           { type: 'string', description: '2-3 sentence overview' },
              responsibilities:  { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 },
              requirements:      { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 },
              nice_to_haves:     { type: 'array', items: { type: 'string' } }
            }
          }
        },
        {
          name: 'propose_panels',
          description: 'Emit 3 interview panel suggestions for a requisition. Each panel has 4 interviewers chosen from the candidate pool.',
          input_schema: {
            type: 'object',
            required: ['panels'],
            properties: {
              panels: {
                type: 'array',
                minItems: 3, maxItems: 3,
                items: {
                  type: 'object',
                  required: ['title', 'members', 'reasoning', 'score'],
                  properties: {
                    title:     { type: 'string', description: 'Panel label, e.g. "Panel A · balanced"' },
                    score:     { type: 'string', description: 'Fit score 0.00–1.00' },
                    members: {
                      type: 'array', minItems: 4, maxItems: 4,
                      items: {
                        type: 'object',
                        required: ['id', 'name', 'role'],
                        properties: {
                          id:   { type: 'string', description: 'Employee id from the people graph' },
                          name: { type: 'string' },
                          role: { type: 'string', description: 'Title or function on this panel' }
                        }
                      }
                    },
                    reasoning: { type: 'string', description: '1-2 sentences explaining the panel composition' }
                  }
                }
              }
            },
            // cache breakpoint
          },
          cache_control: { type: 'ephemeral' }
        },
      ];
    },

    // ── Tool dispatcher (client-side) ──
    pending: { jd: null, panels: null },
    dispatch(name, input) {
      try {
        switch (name) {
          case 'summarize_candidate':         return LLM.tool_summarizeCandidate(input);
          case 'match_candidate_to_req':      return LLM.tool_matchToReq(input);
          case 'get_candidate_offer_context': return LLM.tool_offerContext(input);
          case 'get_panel_candidates':        return LLM.tool_panelCandidates(input);
          case 'draft_jd_fields':             LLM.pending.jd = input; return { ok: true };
          case 'propose_panels':              LLM.pending.panels = input; return { ok: true };
          default: return { error: 'unknown tool: ' + name };
        }
      } catch (e) {
        return { error: String(e && e.message || e) };
      }
    },

    tool_summarizeCandidate({ candidate_id }) {
      const c = state.candidates.find(x => x.id === candidate_id);
      if (!c) return { error: `Candidate ${candidate_id} not found.` };
      const r = c.requisition_id ? state.reqsById[c.requisition_id] : null;
      return {
        candidate: LLM.projectCandidate(c),
        requisition: r ? LLM.projectReq(r) : null,
      };
    },
    tool_matchToReq({ candidate_id, requisition_id }) {
      const c = state.candidates.find(x => x.id === candidate_id);
      const r = state.reqsById[requisition_id];
      if (!c) return { error: `Candidate ${candidate_id} not found.` };
      if (!r) return { error: `Requisition ${requisition_id} not found.` };
      return {
        candidate: LLM.projectCandidate(c),
        requisition: LLM.projectReq(r),
        composite_match_score: matchScore(c),
        comp_band: { p50_usd: r.comp_band_p50, expected_usd: c.expected_comp || null },
      };
    },
    tool_offerContext({ candidate_id, requisition_id }) {
      const c = state.candidates.find(x => x.id === candidate_id);
      const r = state.reqsById[requisition_id];
      if (!c) return { error: `Candidate ${candidate_id} not found.` };
      if (!r) return { error: `Requisition ${requisition_id} not found.` };
      const hm = state.peopleById[r.hiring_manager_id];
      const baseComp = c.offered_comp || c.expected_comp || r.comp_band_p50;
      return {
        candidate: LLM.projectCandidate(c),
        requisition: LLM.projectReq(r),
        hiring_manager: hm ? { id: hm.id, name: hm.display_name, title: hm.title } : null,
        comp_band: {
          id: r.id + '-band',
          base_usd: baseComp,
          band_p50_usd: r.comp_band_p50,
          target_bonus_pct: 15,
          equity_multiple_of_base: 0.5,
          sign_on_usd: 15000,
          equity_vesting: '25/25/25/25 over 4y, 1y cliff',
          start_date: '2026-06-15',
          expiry_date: '2026-05-20',
        },
        employer: { legal_name: 'Tessera Bank', sender: 'Sofia Vargas · Talent Acquisition' },
      };
    },
    tool_panelCandidates({ requisition_id }) {
      const r = state.reqsById[requisition_id];
      if (!r) return { error: `Requisition ${requisition_id} not found.` };
      const hm = state.peopleById[r.hiring_manager_id];
      // Sample 8 plausible interviewers from the same department, level IC4+ or managers.
      const pool = state.people
        .filter(p => p.id !== r.hiring_manager_id)
        .filter(p => p.department === r.department || p.is_manager || /^(IC4|IC5|IC6|IC7|M1|M2|M3|M4)$/.test(p.level || ''))
        .sort(() => 0.5 - ((r.id.charCodeAt(0) % 7) / 10))
        .slice(0, 12)
        .map(p => ({
          id: p.id,
          name: p.display_name,
          title: p.title,
          level: p.level,
          team: p.team,
          location: p.location,
          interview_load_this_week: ((p.id.charCodeAt(p.id.length-1) || 0) % 4),
          bar_raiser_certified: ((p.id.charCodeAt(0) || 0) % 3) === 0,
        }));
      return {
        requisition: LLM.projectReq(r),
        hiring_manager: hm ? { id: hm.id, name: hm.display_name, title: hm.title, level: hm.level } : null,
        interviewer_pool: pool,
      };
    },

    projectCandidate(c) {
      return {
        id: c.id, name: c.display_name,
        current_title: c.current_title, current_company: c.current_company,
        total_experience_years: c.total_experience_years,
        highest_level_indicated: c.highest_level_indicated,
        location_preference: c.location_preference, country: c.country,
        source: c.source, source_detail: c.source_detail,
        stage: c.stage, days_in_stage: c.days_in_stage,
        is_referral: c.is_referral, is_internal: c.is_internal,
        expected_comp: c.expected_comp, offered_comp: c.offered_comp,
        predicted_offer_acceptance_probability: c.predicted_offer_acceptance_probability,
        requisition_id: c.requisition_id,
      };
    },
    projectReq(r) {
      return {
        id: r.id, title: r.title,
        department: r.department, team: r.team,
        level: r.level, location: r.location, region: r.region, remote: r.remote,
        status: r.status, priority: r.priority,
        days_open: r.days_open, comp_band_p50: r.comp_band_p50,
        hiring_manager_id: r.hiring_manager_id,
        stage_counts: r.stage_counts, sla_status: r.sla_status,
      };
    },

    // ─────────────────────────────────────────────────────────
    // ASK LOOP — multi-turn tool use
    // ─────────────────────────────────────────────────────────
    async ask(userMessage, opts = {}) {
      if (!LLM.settings.apiKey) throw new Error('No API key configured.');
      const { onText, onThinking, onStatus, onUsage, toolsAllowed } = opts;
      LLM.pending = { jd: null, panels: null };
      LLM.session.inFlight = true;

      const messages = [{ role: 'user', content: userMessage }];
      const sys = LLM.buildSystem();
      let tools = LLM.buildTools();
      if (toolsAllowed && Array.isArray(toolsAllowed) && toolsAllowed.length) {
        const allow = new Set(toolsAllowed);
        tools = tools.filter(t => allow.has(t.name));
        // Re-apply cache_control to the last tool for caching.
        if (tools.length) tools[tools.length - 1].cache_control = { type: 'ephemeral' };
      }
      const model = LLM.settings.model;
      const useThink = LLM.MODELS[model]?.thinking && LLM.settings.thinkingBudget > 0;

      let finalText = '';
      let aggUsage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
      const MAX_TURNS = 6;

      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          onStatus && onStatus(turn === 0 ? 'thinking' : `tool turn ${turn}`);
          const maxOut = useThink ? Math.max(2048, LLM.settings.thinkingBudget + 1024) : 2048;
          const body = { model, max_tokens: maxOut, system: sys, messages, tools, stream: true };
          if (useThink) body.thinking = { type: 'enabled', budget_tokens: LLM.settings.thinkingBudget };

          const turnResult = await LLM.callStream(body, { onText, onThinking, onStatus });
          Object.keys(aggUsage).forEach(k => { aggUsage[k] += (turnResult.usage[k] || 0); });
          onUsage && onUsage({ model, usage: aggUsage, turnUsage: turnResult.usage });

          messages.push({ role: 'assistant', content: turnResult.content });

          if (turnResult.stop_reason === 'tool_use') {
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
            }
            messages.push({ role: 'user', content: results });
            continue;
          }

          // Final turn — collect text
          turnResult.content.forEach(b => { if (b.type === 'text') finalText += b.text; });
          LLM.session.inFlight = false;
          return {
            text: finalText, usage: aggUsage, model,
            stop_reason: turnResult.stop_reason,
            jd: LLM.pending.jd, panels: LLM.pending.panels,
          };
        }
        LLM.session.inFlight = false;
        return { text: finalText || '(agent looped too long)', usage: aggUsage, model, stop_reason: 'tool_loop_limit', jd: LLM.pending.jd, panels: LLM.pending.panels, truncated: true };
      } catch (e) {
        LLM.session.inFlight = false;
        throw e;
      }
    },

    // ── Streaming SSE parser ──
    async callStream(body, { onText, onThinking, onStatus }) {
      const controller = new AbortController();
      LLM.session.streamAbort = controller;
      const res = await LLM.fetchWithRetry(body, controller.signal);
      if (!res.ok) {
        const txt = await res.text();
        throw Object.assign(new Error(`HTTP ${res.status}: ${txt.slice(0,400)}`), { status: res.status, body: txt, requestId: res.headers.get('request-id') });
      }
      const blocks = [];
      const partial = new Map();
      let stop_reason = null;
      let usage = {};
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, idx); buf = buf.slice(idx + 2);
          if (!raw.trim()) continue;
          let eventName = 'message';
          const dataLines = [];
          raw.split('\n').forEach(line => {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          });
          if (!dataLines.length) continue;
          let data;
          try { data = JSON.parse(dataLines.join('\n')); } catch (e) { continue; }
          if (eventName === 'ping') continue;
          if (eventName === 'error') throw Object.assign(new Error(data.error?.message || 'stream error'), { sse: data });
          if (eventName === 'message_start') { usage = Object.assign({}, data.message?.usage || {}); }
          else if (eventName === 'content_block_start') {
            const b = data.content_block;
            const w = JSON.parse(JSON.stringify(b));
            if (w.type === 'text')     w.text = w.text || '';
            if (w.type === 'thinking') { w.thinking = w.thinking || ''; w.signature = w.signature || ''; }
            if (w.type === 'tool_use') w._inputBuf = '';
            partial.set(data.index, w);
          }
          else if (eventName === 'content_block_delta') {
            const w = partial.get(data.index);
            if (!w) continue;
            const d = data.delta;
            if (d.type === 'text_delta')          { w.text += d.text; onText && onText(d.text, w); }
            else if (d.type === 'thinking_delta'){ w.thinking += d.thinking; onThinking && onThinking(d.thinking, w); }
            else if (d.type === 'signature_delta'){ w.signature += d.signature; }
            else if (d.type === 'input_json_delta'){ w._inputBuf += d.partial_json; }
          }
          else if (eventName === 'content_block_stop') {
            const w = partial.get(data.index);
            if (!w) continue;
            if (w.type === 'tool_use') {
              try { w.input = w._inputBuf ? JSON.parse(w._inputBuf) : {}; } catch(_) { w.input = {}; }
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
          else if (eventName === 'message_stop') { /* terminal */ }
        }
      }
      return { content: blocks.filter(Boolean), stop_reason, usage };
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
          if (res.status === 401) return res; // surface to caller for re-onboarding
          if (res.status === 429) { await new Promise(r => setTimeout(r, 5000)); continue; }
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
        if (!res.ok && res.status !== 400) {
          const t = await res.text();
          return { ok: false, reason: `HTTP ${res.status}: ${t.slice(0,200)}` };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    },

    // ─────────────────────────────────────────────────────────
    // FEATURE WRAPPERS — render to DOM
    // ─────────────────────────────────────────────────────────

    async streamCandidateSummary(c, r, targetSel, markSel) {
      const target = $(targetSel);
      const mark = markSel ? $(markSel) : null;
      if (!target) return;
      target.textContent = '';
      target.appendChild(_cursorEl());
      mark && mark.classList.add('is-live');

      const userMsg =
`Summarize candidate ${c.id} (${c.display_name}) for the recruiter. ` +
(c.requisition_id ? `They are being considered for requisition ${c.requisition_id} (${r ? r.title : 'unknown role'}). ` : '') +
`Call summarize_candidate first to get the data, then write a 3-sentence summary covering experience, fit for the role, and any flags. End with a one-line recommendation. Cite candidate id and requisition id.`;

      try {
        await LLM.ask(userMsg, {
          toolsAllowed: ['summarize_candidate'],
          onText: (txt) => _appendStreamText(target, txt),
          onStatus: () => {},
          onUsage: ({ model, turnUsage }) => bumpTopbarCost(LLM.computeCost(model, turnUsage || {})),
        });
        _finalizeStream(target);
      } catch (e) {
        _renderAIError(target, e);
      } finally {
        mark && mark.classList.remove('is-live');
      }
    },

    async streamMatchReasoning(c, r, score, targetSel, markSel) {
      const target = $(targetSel);
      const mark = markSel ? $(markSel) : null;
      if (!target || !r) return;
      target.textContent = '';
      target.appendChild(_cursorEl());
      mark && mark.classList.add('is-live');

      const userMsg =
`Explain why candidate ${c.id} (${c.display_name}) matches requisition ${r.id} (${r.title}, ${r.level}, ${r.location}). ` +
`Call match_candidate_to_req for the data. Produce a structured explanation with:
  · Strengths: 2 bullets
  · Gaps / risks: 2 bullets
  · Recommended next step: 1 sentence
Use plain HTML (<strong>, <ul><li>, <p>) — no markdown. Cite ids in the final paragraph.`;

      try {
        await LLM.ask(userMsg, {
          toolsAllowed: ['match_candidate_to_req'],
          onText: (txt) => _appendStreamText(target, txt),
          onUsage: ({ model, turnUsage }) => bumpTopbarCost(LLM.computeCost(model, turnUsage || {})),
        });
        _finalizeStream(target);
      } catch (e) {
        _renderAIError(target, e);
      } finally {
        mark && mark.classList.remove('is-live');
      }
    },

    async streamJDDraft(brief) {
      const jdField = $('#new-req-jd');
      const titleField = $('#new-req-title');
      if (!jdField) return;
      jdField.value = '';
      jdField.placeholder = 'Drafting with Claude…';

      const userMsg =
`A recruiter wants a job description for: "${brief}".
Stream the prose for the JD into your text response (sections: About the role / What you will do / What you bring), AND call draft_jd_fields once with structured fields {title, summary, responsibilities[3-6], requirements[3-6], nice_to_haves[]} so the form auto-populates.`;

      try {
        await LLM.ask(userMsg, {
          toolsAllowed: ['draft_jd_fields'],
          onText: (txt) => { jdField.value += txt; },
          onUsage: ({ model, turnUsage }) => bumpTopbarCost(LLM.computeCost(model, turnUsage || {})),
        });
        if (LLM.pending.jd) {
          const jd = LLM.pending.jd;
          if (titleField && jd.title) titleField.value = jd.title;
          // If text was empty, render structured fields into the textarea.
          if (!jdField.value.trim()) {
            const parts = [];
            if (jd.summary) parts.push('About the role\n\n' + jd.summary);
            if (jd.responsibilities && jd.responsibilities.length) parts.push('\n\nWhat you will do\n' + jd.responsibilities.map(s => '• ' + s).join('\n'));
            if (jd.requirements && jd.requirements.length) parts.push('\n\nWhat you bring\n' + jd.requirements.map(s => '• ' + s).join('\n'));
            if (jd.nice_to_haves && jd.nice_to_haves.length) parts.push('\n\nNice to have\n' + jd.nice_to_haves.map(s => '• ' + s).join('\n'));
            jdField.value = parts.join('');
          }
        }
        toast('JD draft generated by Claude · review before opening');
      } catch (e) {
        jdField.value = '[Draft failed: ' + (e.message || e) + ']';
        _handleAuthError(e);
      } finally {
        jdField.placeholder = 'The AI-generated draft will appear here. Edit freely.';
      }
    },

    async streamOfferLetter(c, r, targetSel, markSel) {
      const target = $(targetSel);
      const mark = markSel ? $(markSel) : null;
      if (!target) return;
      target.textContent = '';
      target.appendChild(_cursorEl());
      mark && mark.classList.add('is-live');

      const userMsg =
`Draft a formal offer letter for candidate ${c.id} (${c.display_name}) for requisition ${r ? r.id : c.requisition_id} (${r ? r.title : 'role'}). ` +
`Call get_candidate_offer_context first to retrieve the comp band, hiring manager, start date, and expiry. Then produce a complete offer letter with: greeting, role + reporting line, full comp breakdown (base, bonus, equity, sign-on), start date, expiry, and a warm closing signed by Sofia Vargas. Use plain text — no markdown, no HTML. Keep tone professional and specific.`;

      try {
        await LLM.ask(userMsg, {
          toolsAllowed: ['get_candidate_offer_context'],
          onText: (txt) => _appendStreamText(target, txt, /*plainText*/ true),
          onUsage: ({ model, turnUsage }) => bumpTopbarCost(LLM.computeCost(model, turnUsage || {})),
        });
        _finalizeStream(target);
      } catch (e) {
        _renderAIError(target, e);
      } finally {
        mark && mark.classList.remove('is-live');
      }
    },

    async streamPanelSuggestion(reqId, targetSel, markSel) {
      const target = $(targetSel);
      const mark = markSel ? $(markSel) : null;
      if (!target) return;
      target.innerHTML = '<div class="panel-card" style="opacity:.65;"><div class="panel-card-head"><span class="lbl">Loading…</span></div><div class="panel-reason">Asking Claude to balance availability, diversity, and load…</div></div>';
      mark && mark.classList.add('is-live');

      const userMsg =
`Suggest 3 interview panels (4 interviewers each) for requisition ${reqId}. Call get_panel_candidates first to retrieve the hiring manager and interviewer pool. Then call propose_panels with exactly 3 panels:
  · Panel A · balanced (highest availability + bar-raiser mix)
  · Panel B · technical depth
  · Panel C · diversity-weighted
Use only ids that appear in the interviewer_pool you received. Each panel's reasoning should be 1-2 specific sentences citing load, certification, or region. Then write a one-paragraph summary noting which panel you would default to and why, citing the requisition id.`;

      try {
        await LLM.ask(userMsg, {
          toolsAllowed: ['get_panel_candidates'],
          onUsage: ({ model, turnUsage }) => bumpTopbarCost(LLM.computeCost(model, turnUsage || {})),
        });
        const panels = LLM.pending.panels && LLM.pending.panels.panels;
        if (!panels || !panels.length) {
          target.innerHTML = '<div class="ai-error">Claude did not return panel suggestions.</div>';
          return;
        }
        target.innerHTML = panels.map(p => `
          <div class="panel-card">
            <div class="panel-card-head">
              <span class="lbl">${escapeHtml(p.title)}</span>
              <span class="score">fit ${escapeHtml(String(p.score))}</span>
            </div>
            <div class="panel-members">
              ${(p.members || []).map(m => `
                <div class="panel-member">
                  <span class="m-name">${escapeHtml(m.name)}</span>
                  <span class="m-role">${escapeHtml(m.role || '')}</span>
                </div>
              `).join('')}
            </div>
            <div class="panel-reason">${escapeHtml(p.reasoning || '')}</div>
          </div>
        `).join('');
      } catch (e) {
        target.innerHTML = '';
        _renderAIError(target, e);
      } finally {
        mark && mark.classList.remove('is-live');
      }
    },
  };

  // ─── small helpers ────────────────────────────────────────
  function _cursorEl() {
    const span = document.createElement('span');
    span.className = 'streaming-cursor';
    return span;
  }
  function _appendStreamText(el, txt, plainText = false) {
    // Accumulate the delta into a buffer attached to the element, then
    // re-render the whole buffer as markdown. Avoids the trailing-table
    // partial-parse problem and gives proper headings / lists / tables.
    if (!el._streamBuf) el._streamBuf = '';
    el._streamBuf += txt;
    if (plainText) {
      el.textContent = el._streamBuf;
    } else {
      el.innerHTML = _renderMd(el._streamBuf);
    }
    el.appendChild(_cursorEl());
  }

  // Mini-markdown renderer for the Recruiter's streaming AI outputs.
  // Handles: ATX headings, pipe tables, horizontal rules, lists,
  // blockquotes, code fences, inline bold / italic / inline-code.
  function _renderMd(s) {
    if (!s) return '';
    function inline(t) {
      return t
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    }
    function esc(t) {
      return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    const lines = esc(s).split('\n');
    const out = [];
    let i = 0, inCode = false, codeBuf = [], paraBuf = [], listBuf = [], listType = null;
    function flushPara() {
      if (paraBuf.length) { out.push('<p>' + inline(paraBuf.join('<br>')) + '</p>'); paraBuf = []; }
    }
    function flushList() {
      if (listBuf.length) {
        const tag = listType === 'ol' ? 'ol' : 'ul';
        out.push('<' + tag + '>' + listBuf.map(li => '<li>' + inline(li) + '</li>').join('') + '</' + tag + '>');
        listBuf = []; listType = null;
      }
    }
    function flushAll() { flushPara(); flushList(); }
    function isSep(l) { return /^\s*\|?[\s\-:|]+\|?\s*$/.test(l) && /-/.test(l); }
    function splitRow(l) {
      let t = l.trim();
      if (t.startsWith('|')) t = t.slice(1);
      if (t.endsWith('|')) t = t.slice(0, -1);
      return t.split('|').map(c => c.trim());
    }
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        if (inCode) { out.push('<pre><code>' + codeBuf.join('\n') + '</code></pre>'); codeBuf = []; inCode = false; }
        else { flushAll(); inCode = true; }
        i++; continue;
      }
      if (inCode) { codeBuf.push(line); i++; continue; }
      if (/^\s*$/.test(line)) { flushAll(); i++; continue; }
      if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { flushAll(); out.push('<hr>'); i++; continue; }
      const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (h) {
        flushAll();
        const level = Math.min(6, h[1].length + 2);
        out.push('<h' + level + '>' + inline(h[2]) + '</h' + level + '>');
        i++; continue;
      }
      if (/^\s*\|/.test(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
        flushAll();
        const headers = splitRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i]) && !isSep(lines[i])) { rows.push(splitRow(lines[i])); i++; }
        let html = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
        headers.forEach(h => html += '<th>' + inline(h) + '</th>');
        html += '</tr></thead><tbody>';
        rows.forEach(r => {
          html += '<tr>';
          for (let c = 0; c < headers.length; c++) html += '<td>' + inline(r[c] || '') + '</td>';
          html += '</tr>';
        });
        html += '</tbody></table></div>';
        out.push(html);
        continue;
      }
      const ul = /^\s*[-*]\s+(.+)$/.exec(line);
      if (ul) { flushPara(); if (listType && listType !== 'ul') flushList(); listType = 'ul'; listBuf.push(ul[1]); i++; continue; }
      const ol = /^\s*\d+\.\s+(.+)$/.exec(line);
      if (ol) { flushPara(); if (listType && listType !== 'ol') flushList(); listType = 'ol'; listBuf.push(ol[1]); i++; continue; }
      if (/^\s*>\s?/.test(line)) { flushList(); paraBuf.push('<span class="md-quote-mark">›</span> ' + line.replace(/^\s*>\s?/, '')); i++; continue; }
      flushList();
      paraBuf.push(line);
      i++;
    }
    if (inCode) out.push('<pre><code>' + codeBuf.join('\n') + '</code></pre>');
    flushAll();
    return out.join('\n');
  }
  function _finalizeStream(el) {
    const cur = el.querySelector('.streaming-cursor');
    if (cur) cur.remove();
  }
  function _renderAIError(target, e) {
    if (!target) return;
    _finalizeStream(target);
    const rid = (e && e.requestId) ? ` · request-id ${escapeHtml(e.requestId)}` : '';
    const msg = (e && e.message) || String(e);
    target.innerHTML = `<div class="ai-error">
      <details><summary>AI request failed</summary>
        <pre>${escapeHtml(msg)}${rid}</pre>
      </details>
    </div>`;
    _handleAuthError(e);
  }
  function _handleAuthError(e) {
    if (e && e.status === 401) {
      LLM.settings.apiKey = '';
      refreshDemoBanner();
      setTimeout(() => openOnboarding('Your API key was rejected. Please reconnect.'), 400);
    }
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ═════════════════════════════════════════════════════════════
  // ░░░░░░░░░░░░░  TOPBAR · COST METER · DEMO BANNER  ░░░░░░░░░░
  // ═════════════════════════════════════════════════════════════
  let _topbarCostTotal = 0;
  function bumpTopbarCost(delta, reset = false) {
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
      b.innerHTML = `<span class="dot"></span>Demo mode · AI features use canned responses. <button class="banner-cta" type="button" id="banner-connect">Connect Claude</button>`;
      const btn = $('#banner-connect');
      btn && btn.addEventListener('click', () => openOnboarding());
    } else {
      b.style.display = 'none';
    }
  }

  // ═════════════════════════════════════════════════════════════
  // ░░░░░░░░░░░░░░  ONBOARDING + SETTINGS MODALS  ░░░░░░░░░░░░░░
  // ═════════════════════════════════════════════════════════════
  function openOnboarding(reasonText) {
    const m = $('#onboard-modal');
    if (!m) return;
    m.classList.add('is-open');
    m.querySelector('.modal').classList.add('is-open');
    m.setAttribute('aria-hidden', 'false');
    const reasonEl = $('#onboard-reason');
    if (reasonEl) {
      reasonEl.textContent = reasonText || '';
      reasonEl.style.display = reasonText ? 'block' : 'none';
    }
    setTimeout(() => { const k = $('#onboard-key'); k && k.focus(); }, 60);
  }
  function closeOnboarding() {
    const m = $('#onboard-modal');
    if (!m) return;
    m.classList.remove('is-open');
    m.querySelector('.modal').classList.remove('is-open');
    m.setAttribute('aria-hidden', 'true');
  }
  async function handleOnboardSubmit(e) {
    e.preventDefault();
    const key = $('#onboard-key').value.trim();
    if (!key) return;
    const status = $('#onboard-status');
    const submit = $('#onboard-submit');
    status.textContent = 'Validating key…';
    submit.disabled = true;
    const v = await LLM.validateKey(key);
    submit.disabled = false;
    if (!v.ok) {
      status.innerHTML = `<span class="err">${escapeHtml(v.reason)}</span>`;
      return;
    }
    LLM.settings.apiKey = key;
    status.textContent = 'Connected.';
    setTimeout(() => {
      closeOnboarding();
      refreshDemoBanner();
      toast('Claude connected · live AI features enabled');
    }, 350);
  }

  function openSettings() {
    const m = $('#settings-modal-r');
    if (!m) return;
    $('#set-model').value = LLM.settings.model;
    $('#set-effort').value = LLM.settings.effort;
    $('#set-key-status').textContent = LLM.settings.apiKey
      ? `Connected · …${LLM.settings.apiKey.slice(-6)}`
      : 'Not connected';
    m.classList.add('is-open');
    m.querySelector('.modal').classList.add('is-open');
    m.setAttribute('aria-hidden', 'false');
  }
  function closeSettings() {
    const m = $('#settings-modal-r');
    if (!m) return;
    m.classList.remove('is-open');
    m.querySelector('.modal').classList.remove('is-open');
    m.setAttribute('aria-hidden', 'true');
  }

  function bindLLMUI() {
    // Gear button
    $('#topbar-gear')?.addEventListener('click', openSettings);
    $('#settings-close')?.addEventListener('click', closeSettings);
    $('#set-done')?.addEventListener('click', closeSettings);
    $('#settings-modal-r')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeSettings();
    });
    $('#set-model')?.addEventListener('change', (e) => { LLM.settings.model = e.target.value; });
    $('#set-effort')?.addEventListener('change', (e) => { LLM.settings.effort = e.target.value; });
    $('#set-forget')?.addEventListener('click', () => {
      if (confirm('Forget your API key? Stratum Recruiter will fall back to demo mode.')) {
        LLM.settings.apiKey = '';
        $('#set-key-status').textContent = 'Not connected';
        refreshDemoBanner();
        toast('API key forgotten · demo mode active');
      }
    });
    $('#set-reset')?.addEventListener('click', () => {
      if (confirm('Reset session? This clears the cost meter (the API key stays).')) {
        LLM.session.cost = 0;
        bumpTopbarCost(0, true);
        closeSettings();
        toast('Session reset');
      }
    });

    // Onboarding modal
    $('#onboard-close')?.addEventListener('click', closeOnboarding);
    $('#onboard-modal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeOnboarding();
    });
    $('#onboard-form')?.addEventListener('submit', handleOnboardSubmit);
    $('#onboard-skip-demo')?.addEventListener('click', () => {
      sessionStorage.setItem('stratum_recruiter_skipped_onboarding', '1');
      closeOnboarding();
      refreshDemoBanner();
    });

    // Escape closes modals
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if ($('#onboard-modal')?.classList.contains('is-open')) closeOnboarding();
      else if ($('#settings-modal-r')?.classList.contains('is-open')) closeSettings();
    });
  }


  // ────────────────────────── GO ──────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
