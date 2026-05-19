// Sitewide search for Stratum. Loads search.json once, scores matches client-side.
// No external library — a tiny BM25-ish scorer keeps the bundle <2KB and avoids
// CDN dependency. For 126 documents this is plenty fast.
(function () {
  'use strict';

  const input = document.getElementById('q');
  const list  = document.getElementById('results');
  const meta  = document.getElementById('meta');
  const empty = document.getElementById('empty');
  if (!input || !list) return;

  let docs = null;
  let loadErr = null;

  // Honor ?q= in URL.
  const initial = new URLSearchParams(location.search).get('q') || '';
  if (initial) input.value = initial;

  // search.json lives at the site root. On GitHub Pages this is under
  // the /stratum/ baseurl; locally `make serve` uses --baseurl="" so
  // the prefix is empty. Read baseurl from the <link rel="stylesheet">
  // tag which already has the correctly-rewritten path.
  const css = document.querySelector('link[rel=stylesheet][href*="assets/styles.css"]');
  const m = css && css.getAttribute('href').match(/^(.*?)\/assets\/styles\.css/);
  const baseurl = (m && m[1]) || '';
  const searchJsonUrl = baseurl + '/search.json';
  fetch(searchJsonUrl, { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => { docs = j; run(input.value); })
    .catch(e => { loadErr = e; meta.textContent = 'Index unavailable: ' + e.message; });

  let timer = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => run(input.value), 80);
  });

  function tokenize(s) {
    return (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1);
  }

  function score(doc, terms) {
    if (!terms.length) return 0;
    const hay = {
      title: (doc.title || '').toLowerCase(),
      desc:  (doc.description || '').toLowerCase(),
      body:  (doc.body || '').toLowerCase(),
      url:   (doc.url  || '').toLowerCase(),
    };
    let s = 0, matched = 0;
    for (const t of terms) {
      let hit = 0;
      if (hay.title.includes(t)) { hit += 10; }
      if (hay.url.includes(t))   { hit += 4; }
      if (hay.desc.includes(t))  { hit += 5; }
      // Body: count occurrences, log-scaled.
      const re = new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const m = hay.body.match(re);
      if (m) hit += Math.min(8, 2 + Math.log2(m.length + 1));
      if (hit > 0) matched++;
      s += hit;
    }
    // All-terms bonus.
    if (matched === terms.length) s *= 1.4;
    return s;
  }

  function snippet(body, terms) {
    if (!body) return '';
    const lc = body.toLowerCase();
    let idx = -1;
    for (const t of terms) {
      const i = lc.indexOf(t);
      if (i >= 0 && (idx < 0 || i < idx)) idx = i;
    }
    if (idx < 0) idx = 0;
    const start = Math.max(0, idx - 70);
    const end   = Math.min(body.length, idx + 180);
    let s = body.slice(start, end);
    if (start > 0) s = '… ' + s;
    if (end < body.length) s += ' …';
    return s;
  }

  function highlight(s, terms) {
    if (!terms.length) return escape(s);
    const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp('(' + escaped.join('|') + ')', 'gi');
    return escape(s).replace(re, '<mark>$1</mark>');
  }

  function escape(s) {
    return (s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function run(query) {
    if (loadErr) return;
    list.innerHTML = '';
    empty.hidden = true;
    if (!docs) { meta.textContent = 'Loading index…'; return; }
    const terms = tokenize(query);
    if (!terms.length) {
      meta.textContent = docs.length + ' pages indexed. Type to search.';
      return;
    }
    const scored = docs.map(d => ({ d, s: score(d, terms) })).filter(x => x.s > 0);
    scored.sort((a, b) => b.s - a.s);
    const top = scored.slice(0, 40);
    meta.textContent = top.length + ' of ' + scored.length + ' result' + (scored.length === 1 ? '' : 's') + ' for “' + query + '”';
    if (!top.length) { empty.hidden = false; return; }
    const frag = document.createDocumentFragment();
    for (const { d } of top) {
      const li = document.createElement('li');
      const tag = d.collection ? '<span class="tag">' + escape(d.collection) + '</span>' : '';
      // search.json stores bare paths like /intel/eglin/foo.html. On
      // production we must prefix the baseurl so the link goes to
      // /stratum/intel/eglin/foo.html — same baseurl we detected for the
      // fetch above. The displayed URL stays bare (no /stratum/ noise).
      const href = (d.url && d.url.charAt(0) === '/') ? baseurl + d.url : d.url;
      li.innerHTML =
        tag +
        '<a class="title" href="' + escape(href) + '">' + highlight(d.title || d.url, terms) + '</a>' +
        '<div class="url">' + escape(d.url) + '</div>' +
        '<p class="desc">' + highlight(snippet(d.description || d.body, terms), terms) + '</p>';
      frag.appendChild(li);
    }
    list.appendChild(frag);
  }
})();
