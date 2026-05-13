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

  // Stamp the live dateline
  const dateline = document.querySelector('.dateline');
  if (dateline) {
    const now = new Date();
    const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    dateline.textContent = `${now.toLocaleDateString('en-US', opts)} · Palo Alto`;
  }
})();
