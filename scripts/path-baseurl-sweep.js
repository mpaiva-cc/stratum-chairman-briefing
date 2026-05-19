#!/usr/bin/env node
// One-shot sweep: convert absolute internal URLs to Liquid `relative_url`
// expressions so GitHub Pages' /stratum-chairman-briefing/ baseurl is
// honored. Local dev with `--baseurl ""` then strips it off.
//
// Targets the patterns we know to be safe:
//   href="/assets/...   → href="{{ '/assets/...' | relative_url }}"
//   src="/assets/...    → src="{{ '/assets/...' | relative_url }}"
//   href="/search.html"
//   href="/search.json"
//   In _includes/site-nav.html: every `href="/<segment>"` and `href="/"`
//   In _includes/footer.html: every `href="/<segment>"`
//   In the og-jsonld block (in <head>): the og:url + canonical lines
//
// SKIPS strings already wrapped in {{ ... }} (idempotent) and external URLs.
//
// Usage:
//   node scripts/path-baseurl-sweep.js              # dry run
//   node scripts/path-baseurl-sweep.js --write
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');
const SKIP = new Set(['_site','node_modules','agent-outbox','.git','.claude','.githooks','scripts','vendor']);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && p.endsWith('.html')) out.push(p);
  }
  return out;
}

function wrap(orig) {
  return `{{ '${orig}' | relative_url }}`;
}

function processFile(abs) {
  const rel = path.relative(ROOT, abs);
  const isInclude = rel.startsWith('_includes/');
  let html = fs.readFileSync(abs, 'utf8');
  const before = html;
  let changes = 0;

  // Don't touch the OG block's og:url meta — that needs absolute_url, handled below.
  // The CRITICAL stylesheet link injected sitewide by Phase 2:
  html = html.replace(
    /href="\/(assets\/styles\.css\?v=\d+)"/g,
    (m, p) => { changes++; return `href="{{ '/${p}' | relative_url }}"`; }
  );

  // Echo + search assets (absolute paths on the new pages):
  html = html.replace(
    /(href|src)="\/(assets\/[\w./?=-]+)"/g,
    (m, attr, p) => { changes++; return `${attr}="{{ '/${p}' | relative_url }}"`; }
  );

  // Search routes (absolute) — only on pages that have them.
  html = html.replace(
    /href="\/search\.(html|json)"/g,
    (m, ext) => { changes++; return `href="{{ '/search.${ext}' | relative_url }}"`; }
  );

  // og:url + twitter url in the og-jsonld block — needs absolute_url so the
  // host (https://mpaiva-cc.github.io) plus baseurl prepends correctly.
  // The pre-Phase-3 lines look like:  content="{{ site.url }}{{ page.url }}"
  html = html.replace(
    /content="\{\{ site\.url \}\}\{\{ page\.url \}\}"/g,
    () => { changes++; return `content="{{ page.url | absolute_url }}"`; }
  );

  // JSON-LD "url": "{{ site.url }}{{ page.url }}"
  html = html.replace(
    /"url":"\{\{ site\.url \}\}\{\{ page\.url \}\}"/g,
    () => { changes++; return `"url":"{{ page.url | absolute_url }}"`; }
  );

  // Sitewide: every bare-absolute href="/something" and src="/something"
  // in HTML body content. Includes get the same treatment. Skip any value
  // already wrapped in {{ ... }} — it's caught by the literal-bracket regex,
  // so the substitution is naturally idempotent. Also skip the protocol-
  // relative `//host/path` form.
  html = html.replace(
    /\b(href|src)="(\/[a-zA-Z0-9][a-zA-Z0-9._?=&%/#-]*)"/g,
    (m, attr, p) => {
      // Don't touch protocol-relative.
      if (p.startsWith('//')) return m;
      // Don't touch anchor-only.
      if (p === '/') {
        changes++;
        return `${attr}="{{ '/' | relative_url }}"`;
      }
      changes++;
      return `${attr}="{{ '${p}' | relative_url }}"`;
    }
  );

  if (html === before) return { rel, changes: 0 };
  if (WRITE) fs.writeFileSync(abs, html);
  return { rel, changes };
}

function main() {
  const files = walk(ROOT);
  let touched = 0, totalChanges = 0;
  for (const f of files) {
    const r = processFile(f);
    if (r.changes > 0) { touched++; totalChanges += r.changes; }
  }
  console.log(`${WRITE ? 'WROTE' : 'DRY RUN'} — ${files.length} files scanned, ${touched} touched, ${totalChanges} total substitutions`);
  if (!WRITE) console.log('Re-run with --write to apply.');
}

main();
