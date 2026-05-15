#!/usr/bin/env python3
"""
nav_rollout.py — Nav dispatch 2: insert canonical site-nav into 63 pages.
Tessera · T+~48d · 2026-05-15

Strategy:
- Insert CSS block just before </style> or </head> (wherever the existing
  <style> block closes), OR just before </head> if no <style> block.
  Actually: simpler to append <style>…</style> standalone right before </head>.
- Insert the HTML nav block right after the skip-link if present, else right
  after <body>.
- Insert the JS block right before </body>.
- Skip any file that already has 'class="site-nav"'.
"""

import re, sys, os

# ─── FILES ───────────────────────────────────────────────────────────────────
BASE = "/Users/mp/git-repos/poc-autonomous-hcm"

# Section indices (one level deep — all use "../" prefix hrefs)
SECTION_INDICES = [
    "about/index.html",
    "accessibility/index.html",
    "agents/index.html",
    "ai/index.html",
    "api/index.html",
    "board/index.html",
    "careers/index.html",
    "chairman/index.html",
    "changelog/index.html",
    "compare/index.html",
    "console/index.html",
    "customers/index.html",
    "day-two/index.html",
    "deck/index.html",
    "engineering/index.html",
    "essays/index.html",
    "eval/index.html",
    "events/index.html",
    "faq/index.html",
    "financials/index.html",
    "handbook/index.html",
    "headcount/index.html",
    "implementation/index.html",
    "intel/index.html",
    "investors/index.html",
    "ledger/index.html",
    "library/index.html",
    "limitations/index.html",
    "metrics/index.html",
    "newsroom/index.html",
    "office-hours/index.html",
    "ops/index.html",
    "partners/index.html",
    "press/index.html",
    "pricing/index.html",
    "privacy/index.html",
    "real-time/index.html",
    "recruiter/index.html",
    "recruiting/index.html",
    "research/index.html",
    "roadmap/index.html",
    "security/index.html",
    "status/index.html",
    "terms/index.html",
    "tour/index.html",
    "trust/index.html",
    "whats-new/index.html",
    "wins/index.html",
    "year-one/index.html",
]

# Briefings 001–014 (also one level deep, same "../" prefix)
BRIEFINGS = [f"briefings/{str(n).zfill(3)}.html" for n in range(1, 15)]

ALL_FILES = SECTION_INDICES + BRIEFINGS

# ─── CSS BLOCK ───────────────────────────────────────────────────────────────
# Verbatim from briefings/015.html lines 851–910.
# Uses CSS custom properties — every target page defines them in :root.
# If a page is missing tokens, the .site-nav block declares local fallbacks
# via scoped custom properties below.
NAV_CSS = """
<style>
/* ── SITE-NAV — injected by nav_rollout.py · T+~48d ── */
/* Scoped token fallbacks — safe even on pages missing root vars */
.site-nav {
  --paper:      #f4ecda;
  --paper-rule: #d8cdb6;
  --ink:        #0e1626;
  --ink-2:      rgba(14,22,38,.65);
  --ink-3:      rgba(14,22,38,.42);
  --ochre:      #b8651f;
}
.site-nav{position:relative;background:var(--paper);border-bottom:1px solid var(--paper-rule);z-index:500}
.sn-inner{width:min(1180px,92vw);margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:1rem;height:48px}
.sn-mark{font-family:'Fraunces',Georgia,serif;font-size:1.05rem;font-weight:500;font-variation-settings:"opsz" 24,"WONK" 0;color:var(--ink);text-decoration:none;letter-spacing:-.01em;flex-shrink:0;line-height:1;padding:.3rem 0;border-bottom:0}
.sn-mark:hover{color:var(--ochre);border-bottom:0}
.sn-dot{color:var(--ochre)}
.sn-cats{display:flex;align-items:center;gap:.15rem;flex:1;padding-left:1.4rem}
.sn-cat{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2);padding:.2rem .5rem;white-space:nowrap;user-select:none}
@media (max-width:900px){.sn-cats{display:none}}
.sn-index-btn{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink);background:transparent;border:1px solid var(--paper-rule);padding:.45rem .85rem;cursor:pointer;display:flex;align-items:center;gap:.4rem;min-height:36px;min-width:44px;flex-shrink:0;transition:border-color .15s,color .15s;border-bottom:1px solid var(--paper-rule)}
.sn-index-btn:hover{border-color:var(--ochre);color:var(--ochre)}
.sn-index-btn:focus-visible{outline:2px solid var(--ochre);outline-offset:2px}
.sn-arr{transition:transform .15s;display:inline-block}
.sn-index-btn[aria-expanded="true"] .sn-arr{transform:rotate(180deg)}
@media (prefers-reduced-motion:no-preference){.sn-arr{transition:transform .15s}}
@media (prefers-reduced-motion:reduce){.sn-arr{transition:none}}
.sn-hamburger{display:none;background:transparent;border:1px solid var(--paper-rule);padding:.5rem .6rem;cursor:pointer;min-height:44px;min-width:44px;align-items:center;justify-content:center;flex-direction:column;gap:4px;flex-shrink:0}
.sn-hamburger:focus-visible{outline:2px solid var(--ochre);outline-offset:2px}
.sn-hb-line{display:block;width:18px;height:1.5px;background:var(--ink);border-radius:1px;transition:transform .18s,opacity .18s}
@media (prefers-reduced-motion:reduce){.sn-hb-line{transition:none}}
.sn-hamburger[aria-expanded="true"] .sn-hb-line:nth-child(1){transform:translateY(5.5px) rotate(45deg)}
.sn-hamburger[aria-expanded="true"] .sn-hb-line:nth-child(2){opacity:0}
.sn-hamburger[aria-expanded="true"] .sn-hb-line:nth-child(3){transform:translateY(-5.5px) rotate(-45deg)}
@media (max-width:900px){.sn-hamburger{display:flex}.sn-index-btn{display:none}}
.sn-panel{position:absolute;top:100%;left:0;right:0;background:var(--paper);border-bottom:2px solid var(--ink);box-shadow:0 8px 32px rgba(14,22,38,.12);z-index:501}
.sn-panel[hidden]{display:none}
.sn-panel-inner{width:min(1180px,92vw);margin:0 auto;padding:1.6rem 0 2rem;display:grid;grid-template-columns:repeat(6,1fr);gap:0}
@media (prefers-reduced-motion:no-preference){.sn-panel{animation:sn-fade-in .14s ease}}
@keyframes sn-fade-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
@media (max-width:1100px){.sn-panel-inner{grid-template-columns:repeat(3,1fr)}}
@media (max-width:700px){.sn-panel-inner{grid-template-columns:repeat(2,1fr)}}
.sn-col{padding:.4rem 1.2rem .4rem .4rem;border-right:1px solid var(--paper-rule)}
.sn-col:last-child{border-right:none}
.sn-col-head{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:9.5px;letter-spacing:.24em;text-transform:uppercase;font-weight:700;color:var(--ochre);margin-bottom:.7rem;padding:.2rem 0}
.sn-col a{display:block;font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.06em;color:var(--ink);text-decoration:none;padding:.32rem 0;border-bottom:0;line-height:1.3;min-height:28px;display:flex;align-items:center}
.sn-col a:hover{color:var(--ochre)}
.sn-col a:focus-visible{outline:2px solid var(--ochre);outline-offset:2px}
.sn-col a[aria-current="page"]{color:var(--ochre);font-weight:700}
.sn-mobile{position:fixed;inset:0;background:var(--paper);z-index:600;overflow-y:auto;-webkit-overflow-scrolling:touch}
.sn-mobile[hidden]{display:none}
.sn-mobile-head{display:flex;align-items:center;justify-content:space-between;padding:.7rem min(1180px,92vw) .7rem;padding-left:calc((100vw - min(1180px,92vw))/2);padding-right:calc((100vw - min(1180px,92vw))/2);border-bottom:1px solid var(--paper-rule);height:48px}
.sn-mobile-mark{font-family:'Fraunces',Georgia,serif;font-size:1.05rem;font-weight:500;color:var(--ink);letter-spacing:-.01em}
.sn-mobile-close{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:13px;background:transparent;border:1px solid var(--paper-rule);color:var(--ink);padding:.35rem .7rem;cursor:pointer;min-height:44px;min-width:44px;display:flex;align-items:center;justify-content:center;border-bottom:1px solid var(--paper-rule)}
.sn-mobile-close:focus-visible{outline:2px solid var(--ochre);outline-offset:2px}
.sn-mobile-body{padding:1.2rem calc((100vw - min(1180px,92vw))/2)}
.sn-mob-section{border-bottom:1px solid var(--paper-rule)}
.sn-mob-section summary{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;font-weight:700;color:var(--ochre);padding:1rem 0;cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;min-height:44px}
.sn-mob-section summary::-webkit-details-marker{display:none}
.sn-mob-section summary::after{content:"↓";font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:11px;color:var(--ink-3);transition:transform .15s}
.sn-mob-section[open] summary::after{transform:rotate(180deg)}
@media (prefers-reduced-motion:reduce){.sn-mob-section summary::after{transition:none}}
.sn-mob-section summary:focus-visible{outline:2px solid var(--ochre);outline-offset:2px}
.sn-mob-links{padding:.2rem 0 1rem}
.sn-mob-links a{display:block;font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.06em;color:var(--ink);text-decoration:none;padding:.55rem 0;border-bottom:0;min-height:44px;display:flex;align-items:center}
.sn-mob-links a:hover,.sn-mob-links a:focus-visible{color:var(--ochre)}
.sn-mob-links a:focus-visible{outline:2px solid var(--ochre);outline-offset:2px}
.sn-mob-links a[aria-current="page"]{color:var(--ochre);font-weight:700}
</style>"""

# ─── HTML BLOCK (nav + mobile overlay) ───────────────────────────────────────
# Hrefs use PREFIX placeholder — replaced with "../" for all pages (they're all
# one level deep, whether section/index.html or briefings/NNN.html).
NAV_HTML_TEMPLATE = """<!-- ── SITE-NAV ── -->
<nav class="site-nav" id="site-nav" role="navigation" aria-label="Site">
  <div class="sn-inner">
    <a href="{PREFIX}" class="sn-mark" aria-label="Stratum home">Stratum<span class="sn-dot" aria-hidden="true">.</span></a>
    <div class="sn-cats" aria-hidden="true">
      <span class="sn-cat">Product</span>
      <span class="sn-cat">·</span>
      <span class="sn-cat">Articles</span>
      <span class="sn-cat">·</span>
      <span class="sn-cat">Company</span>
      <span class="sn-cat">·</span>
      <span class="sn-cat">Resources</span>
      <span class="sn-cat">·</span>
      <span class="sn-cat">Trust</span>
      <span class="sn-cat">·</span>
      <span class="sn-cat">Open data</span>
    </div>
    <button class="sn-index-btn" type="button" aria-expanded="false" aria-controls="sn-panel">
      All of Stratum <span class="sn-arr" aria-hidden="true">↓</span>
    </button>
    <button class="sn-hamburger" type="button" aria-expanded="false" aria-controls="sn-mobile" aria-label="Open site menu">
      <span class="sn-hb-line" aria-hidden="true"></span>
      <span class="sn-hb-line" aria-hidden="true"></span>
      <span class="sn-hb-line" aria-hidden="true"></span>
    </button>
  </div>
  <div class="sn-panel" id="sn-panel" hidden>
    <div class="sn-panel-inner">
      <div class="sn-col">
        <div class="sn-col-head">Product</div>
        <a href="{PREFIX}product/">Overview</a>
        <a href="{PREFIX}console/">Console</a>
        <a href="{PREFIX}recruiter/">Recruiter</a>
        <a href="{PREFIX}graph/">People graph</a>
        <a href="{PREFIX}api/">API</a>
        <a href="{PREFIX}tour/">Tour</a>
        <a href="{PREFIX}compare/">Compare</a>
        <a href="{PREFIX}pricing/">Pricing</a>
        <a href="{PREFIX}partners/">Partners</a>
        <a href="{PREFIX}recruiting/">Recruiting</a>
      </div>
      <div class="sn-col">
        <div class="sn-col-head">Articles</div>
        <a href="{PREFIX}briefings/">Briefings</a>
        <a href="{PREFIX}essays/">Essays</a>
        <a href="{PREFIX}engineering/">Engineering</a>
        <a href="{PREFIX}customers/">Customer notes</a>
        <a href="{PREFIX}intel/">Intel</a>
        <a href="{PREFIX}research/">Research</a>
        <a href="{PREFIX}chairman/">Dear Chairman</a>
        <a href="{PREFIX}office-hours/">Office hours</a>
        <a href="{PREFIX}newsroom/">Newsroom</a>
        <a href="{PREFIX}press/">Press kit</a>
        <a href="{PREFIX}whats-new/">What's new</a>
      </div>
      <div class="sn-col">
        <div class="sn-col-head">Company</div>
        <a href="{PREFIX}about/">About</a>
        <a href="{PREFIX}agents/">The Agents</a>
        <a href="{PREFIX}careers/">Careers</a>
        <a href="{PREFIX}board/">Board</a>
        <a href="{PREFIX}investors/">Investors</a>
        <a href="{PREFIX}financials/">Financials</a>
        <a href="{PREFIX}deck/">Deck</a>
        <a href="{PREFIX}year-one/">Year one plan</a>
        <a href="{PREFIX}events/">Events</a>
      </div>
      <div class="sn-col">
        <div class="sn-col-head">Resources</div>
        <a href="{PREFIX}library/">Library</a>
        <a href="{PREFIX}handbook/">Handbook</a>
        <a href="{PREFIX}eval/">Eval set</a>
        <a href="{PREFIX}roadmap/">Roadmap</a>
        <a href="{PREFIX}changelog/">Changelog</a>
        <a href="{PREFIX}faq/">FAQ</a>
        <a href="{PREFIX}ai/">AI principles</a>
        <a href="{PREFIX}implementation/">Implementation</a>
      </div>
      <div class="sn-col">
        <div class="sn-col-head">Trust &amp; Legal</div>
        <a href="{PREFIX}trust/">Trust center</a>
        <a href="{PREFIX}security/">Security</a>
        <a href="{PREFIX}privacy/">Privacy</a>
        <a href="{PREFIX}terms/">Terms</a>
        <a href="{PREFIX}accessibility/">Accessibility</a>
        <a href="{PREFIX}limitations/">Limitations</a>
      </div>
      <div class="sn-col">
        <div class="sn-col-head">Open data</div>
        <a href="{PREFIX}metrics/">Metrics</a>
        <a href="{PREFIX}real-time/">Real-time</a>
        <a href="{PREFIX}ledger/">Decisions ledger</a>
        <a href="{PREFIX}ops/">Ops</a>
        <a href="{PREFIX}headcount/">Headcount</a>
        <a href="{PREFIX}status/">Status</a>
        <a href="{PREFIX}day-two/">Day two</a>
        <a href="{PREFIX}wins/">Wins</a>
      </div>
    </div>
  </div>
</nav>
<!-- MOBILE MENU OVERLAY -->
<div class="sn-mobile" id="sn-mobile" hidden aria-label="Site menu">
  <div class="sn-mobile-head">
    <span class="sn-mobile-mark">Stratum<span class="sn-dot">.</span></span>
    <button class="sn-mobile-close" type="button" aria-label="Close site menu">✕</button>
  </div>
  <div class="sn-mobile-body">
    <details class="sn-mob-section">
      <summary>Product</summary>
      <div class="sn-mob-links">
        <a href="{PREFIX}product/">Overview</a>
        <a href="{PREFIX}console/">Console</a>
        <a href="{PREFIX}recruiter/">Recruiter</a>
        <a href="{PREFIX}graph/">People graph</a>
        <a href="{PREFIX}api/">API</a>
        <a href="{PREFIX}tour/">Tour</a>
        <a href="{PREFIX}compare/">Compare</a>
        <a href="{PREFIX}pricing/">Pricing</a>
        <a href="{PREFIX}partners/">Partners</a>
        <a href="{PREFIX}recruiting/">Recruiting</a>
      </div>
    </details>
    <details class="sn-mob-section">
      <summary>Articles</summary>
      <div class="sn-mob-links">
        <a href="{PREFIX}briefings/">Briefings</a>
        <a href="{PREFIX}essays/">Essays</a>
        <a href="{PREFIX}engineering/">Engineering</a>
        <a href="{PREFIX}customers/">Customer notes</a>
        <a href="{PREFIX}intel/">Intel</a>
        <a href="{PREFIX}research/">Research</a>
        <a href="{PREFIX}chairman/">Dear Chairman</a>
        <a href="{PREFIX}office-hours/">Office hours</a>
        <a href="{PREFIX}newsroom/">Newsroom</a>
        <a href="{PREFIX}press/">Press kit</a>
        <a href="{PREFIX}whats-new/">What's new</a>
      </div>
    </details>
    <details class="sn-mob-section">
      <summary>Company</summary>
      <div class="sn-mob-links">
        <a href="{PREFIX}about/">About</a>
        <a href="{PREFIX}agents/">The Agents</a>
        <a href="{PREFIX}careers/">Careers</a>
        <a href="{PREFIX}board/">Board</a>
        <a href="{PREFIX}investors/">Investors</a>
        <a href="{PREFIX}financials/">Financials</a>
        <a href="{PREFIX}deck/">Deck</a>
        <a href="{PREFIX}year-one/">Year one plan</a>
        <a href="{PREFIX}events/">Events</a>
      </div>
    </details>
    <details class="sn-mob-section">
      <summary>Resources</summary>
      <div class="sn-mob-links">
        <a href="{PREFIX}library/">Library</a>
        <a href="{PREFIX}handbook/">Handbook</a>
        <a href="{PREFIX}eval/">Eval set</a>
        <a href="{PREFIX}roadmap/">Roadmap</a>
        <a href="{PREFIX}changelog/">Changelog</a>
        <a href="{PREFIX}faq/">FAQ</a>
        <a href="{PREFIX}ai/">AI principles</a>
        <a href="{PREFIX}implementation/">Implementation</a>
      </div>
    </details>
    <details class="sn-mob-section">
      <summary>Trust &amp; Legal</summary>
      <div class="sn-mob-links">
        <a href="{PREFIX}trust/">Trust center</a>
        <a href="{PREFIX}security/">Security</a>
        <a href="{PREFIX}privacy/">Privacy</a>
        <a href="{PREFIX}terms/">Terms</a>
        <a href="{PREFIX}accessibility/">Accessibility</a>
        <a href="{PREFIX}limitations/">Limitations</a>
      </div>
    </details>
    <details class="sn-mob-section">
      <summary>Open data</summary>
      <div class="sn-mob-links">
        <a href="{PREFIX}metrics/">Metrics</a>
        <a href="{PREFIX}real-time/">Real-time</a>
        <a href="{PREFIX}ledger/">Decisions ledger</a>
        <a href="{PREFIX}ops/">Ops</a>
        <a href="{PREFIX}headcount/">Headcount</a>
        <a href="{PREFIX}status/">Status</a>
        <a href="{PREFIX}day-two/">Day two</a>
        <a href="{PREFIX}wins/">Wins</a>
      </div>
    </details>
  </div>
</div>"""

# ─── JS BLOCK ────────────────────────────────────────────────────────────────
NAV_JS = """<script>
/* ── SITE-NAV JS ── */
(function(){
  var btn = document.querySelector('.sn-index-btn');
  var panel = document.getElementById('sn-panel');
  var hbtn = document.querySelector('.sn-hamburger');
  var mob = document.getElementById('sn-mobile');
  var closeBtn = document.querySelector('.sn-mobile-close');

  function openPanel(){
    panel.hidden = false;
    btn.setAttribute('aria-expanded','true');
    var first = panel.querySelector('a');
    if(first) first.focus();
  }
  function closePanel(){
    panel.hidden = true;
    btn.setAttribute('aria-expanded','false');
    btn.focus();
  }
  function openMob(){
    mob.hidden = false;
    hbtn.setAttribute('aria-expanded','true');
    document.body.style.overflow = 'hidden';
    var first = mob.querySelector('button,a,[tabindex]');
    if(first) first.focus();
  }
  function closeMob(){
    mob.hidden = true;
    hbtn.setAttribute('aria-expanded','false');
    document.body.style.overflow = '';
    hbtn.focus();
  }

  if(btn && panel){
    btn.addEventListener('click', function(){
      if(panel.hidden){ openPanel(); } else { closePanel(); }
    });
  }
  if(hbtn && mob){
    hbtn.addEventListener('click', function(){
      if(mob.hidden){ openMob(); } else { closeMob(); }
    });
  }
  if(closeBtn){ closeBtn.addEventListener('click', closeMob); }

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){
      if(mob && !mob.hidden){ closeMob(); }
      else if(panel && !panel.hidden){ closePanel(); }
    }
  });

  document.addEventListener('click', function(e){
    var nav = document.getElementById('site-nav');
    if(panel && !panel.hidden && nav && !nav.contains(e.target)){
      closePanel();
    }
  });
})();
</script>"""

# ─── PROCESSING ──────────────────────────────────────────────────────────────

def process_file(rel_path):
    path = os.path.join(BASE, rel_path)
    if not os.path.exists(path):
        print(f"  MISSING  {rel_path}")
        return "missing"

    with open(path, "r", encoding="utf-8") as f:
        src = f.read()

    # Skip if already has site-nav
    if 'class="site-nav"' in src:
        print(f"  SKIP     {rel_path}  (already has site-nav)")
        return "skip"

    # All files in this dispatch are one level deep → "../" prefix
    prefix = "../"
    nav_html = NAV_HTML_TEMPLATE.replace("{PREFIX}", prefix)

    # ── 1. Insert CSS before </head> ────────────────────────────────────────
    if "</head>" in src:
        src = src.replace("</head>", NAV_CSS + "\n</head>", 1)
    else:
        print(f"  WARN     {rel_path}  no </head> found — CSS not inserted")
        return "warn"

    # ── 2. Insert HTML after skip-link (either class) or after <body> ───────
    # Pattern: look for a skip-link line immediately after <body>
    # Canonical order: <body> → skip → site-nav
    # Match: <body...> optionally followed by whitespace+skip-link line
    body_skip_pattern = re.compile(
        r'(<body[^>]*>)'          # group 1: <body ...>
        r'(\s*<a[^>]+class="skip(?:-link)?"[^>]*>[^<]*</a>)',  # group 2: skip-link
        re.IGNORECASE
    )
    if body_skip_pattern.search(src):
        src = body_skip_pattern.sub(
            r'\1\2\n' + nav_html,
            src, count=1
        )
    else:
        # No skip-link found — insert immediately after <body>
        body_pattern = re.compile(r'(<body[^>]*>)', re.IGNORECASE)
        if body_pattern.search(src):
            src = body_pattern.sub(r'\1\n' + nav_html, src, count=1)
        else:
            print(f"  WARN     {rel_path}  no <body> found — HTML not inserted")
            return "warn"

    # ── 3. Insert JS before </body> ─────────────────────────────────────────
    if "</body>" in src:
        src = src.replace("</body>", NAV_JS + "\n</body>", 1)
    else:
        print(f"  WARN     {rel_path}  no </body> found — JS not inserted")
        return "warn"

    with open(path, "w", encoding="utf-8") as f:
        f.write(src)

    print(f"  DONE     {rel_path}")
    return "done"

# ─── MAIN ────────────────────────────────────────────────────────────────────
counts = {"done": 0, "skip": 0, "missing": 0, "warn": 0}
for rel in ALL_FILES:
    result = process_file(rel)
    counts[result] += 1

print(f"\n── Summary ──────────────────────────────────")
print(f"  converted : {counts['done']}")
print(f"  skipped   : {counts['skip']}  (already had site-nav)")
print(f"  missing   : {counts['missing']}  (file not found)")
print(f"  warnings  : {counts['warn']}  (structural variance — needs manual fix)")
print(f"  total     : {sum(counts.values())}")
