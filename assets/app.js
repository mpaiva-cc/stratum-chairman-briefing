// Stratum — Chairman's Briefing
// Minimal client-side enhancement. The page is fully functional
// without JS; this only adds smooth scroll and a live dateline.

(() => {
  // Smooth scroll for the masthead nav
  document.querySelectorAll('.masthead-nav a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', id);
    });
  });

  // Live T+ stamp on the masthead dateline (anchored at T+0 = first commit)
  const T0 = new Date('2026-05-12T22:25:46-04:00');
  const dateline = document.querySelector('.dateline');
  function fmtT(deltaMs) {
    const ms = Math.max(0, deltaMs);
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const milli = ms % 1000;
    const time = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(milli).padStart(3,'0')}`;
    return d > 0 ? `T+${d}d ${time}` : `T+${time}`;
  }
  if (dateline) {
    const tick = () => { dateline.textContent = `Live · ${fmtT(Date.now() - T0.getTime())} · Palo Alto`; };
    tick();
    setInterval(tick, 87); // ~11Hz updates feel alive without thrashing layout
  }
})();
