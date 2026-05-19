#!/usr/bin/env node
// Scan every built HTML file in _site/ for internal links and verify
// each target exists on disk. Designed to catch the broken-on-GH-Pages
// state where absolute /-rooted paths in page bodies don't honor the
// site.baseurl prefix.
//
// Builds with the production baseurl first, then walks _site/.
//
// Usage:
//   node scripts/link-audit.js          # report only
//   node scripts/link-audit.js --json   # JSON output for tooling
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, '_site');
const BASEURL = '/stratum-chairman-briefing'; // matches _config.yml

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const verbose = args.includes('--verbose');

if (!fs.existsSync(SITE)) {
  console.error('No _site/ — run `bundle exec jekyll build` first.');
  process.exit(2);
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && p.endsWith('.html')) out.push(p);
  }
  return out;
}

// Returns { ok, target, reason } for an internal absolute URL path.
// On GitHub Pages the site is served at BASEURL, so any absolute /-rooted
// path that DOESN'T begin with BASEURL is broken in production even if a
// same-named file happens to exist locally. The audit must enforce that.
function resolveLocal(urlPath) {
  urlPath = urlPath.split('?')[0].split('#')[0];
  if (!urlPath.startsWith('/')) return { ok: false, target: null, reason: 'not-internal' };
  if (urlPath !== BASEURL && !urlPath.startsWith(BASEURL + '/')) {
    // Bare /foo with no baseurl prefix → 404 on production.
    return { ok: false, target: null, reason: 'missing-baseurl' };
  }
  // Strip baseurl, resolve against _site/.
  const rel = urlPath === BASEURL ? '/' : urlPath.slice(BASEURL.length);
  let p = path.join(SITE, rel);
  if (rel.endsWith('/')) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) {
    const idxFallback = path.join(p, 'index.html');
    if (fs.existsSync(idxFallback)) p = idxFallback;
  }
  return { ok: fs.existsSync(p), target: p, reason: fs.existsSync(p) ? null : 'not-found' };
}

function resolveRelative(fromFile, urlPath) {
  // Strip query + hash.
  urlPath = urlPath.split('?')[0].split('#')[0];
  if (!urlPath) return null;
  const fromDir = path.dirname(fromFile);
  let abs = path.resolve(fromDir, urlPath);
  if (urlPath.endsWith('/')) abs = path.join(abs, 'index.html');
  if (!fs.existsSync(abs)) {
    const idxFallback = path.join(abs, 'index.html');
    if (fs.existsSync(idxFallback)) abs = idxFallback;
  }
  return abs;
}

const files = walk(SITE);
const broken = []; // {file, ref, target, kind}
const stats = {
  files_scanned: files.length,
  internal_absolute: 0,
  internal_relative: 0,
  external: 0,
  anchor: 0,
  mailto: 0,
  data: 0,
  javascript: 0,
};

// Capture every href/src attribute value. Skip cases inside an
// HTML-encoded block (e.g. code samples that show `&lt;a href="/foo"&gt;`
// as literal display text — those are not actual links).
const ATTR_RE = /(?<!&[a-z]+; ?)(?<![\w;-])(href|src|action)\s*=\s*"([^"]*)"/gi;
function isEncodedSample(html, idx) {
  // If `&lt;` appears within 40 chars before the match (no closing `&gt;`
  // between), this is inside displayed code.
  const back = html.slice(Math.max(0, idx - 60), idx);
  const lastLt = back.lastIndexOf('&lt;');
  if (lastLt < 0) return false;
  const lastGt = back.lastIndexOf('&gt;');
  return lastLt > lastGt;
}

for (const f of files) {
  // Skip XML/feed files (not HTML).
  if (f.endsWith('.xml')) continue;
  const html = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = ATTR_RE.exec(html)) !== null) {
    const url = m[2].trim();
    if (!url) continue;
    // Skip HTML-encoded code samples that show attribute syntax as text.
    if (isEncodedSample(html, m.index)) continue;

    // External
    if (/^https?:\/\//i.test(url)) { stats.external++; continue; }
    // Protocol-relative
    if (url.startsWith('//')) { stats.external++; continue; }
    // Anchor only
    if (url.startsWith('#')) { stats.anchor++; continue; }
    // mailto/tel/javascript/data
    if (url.startsWith('mailto:')) { stats.mailto++; continue; }
    if (url.startsWith('tel:')) { stats.mailto++; continue; }
    if (url.startsWith('javascript:')) { stats.javascript++; continue; }
    if (url.startsWith('data:')) { stats.data++; continue; }
    // JavaScript template literals — these are dynamic href values inside
    // <script> blocks, not real link destinations. Skip.
    if (url.includes('${')) { stats.javascript++; continue; }
    // Liquid leftovers (shouldn't happen post-build)
    if (url.includes('{{') || url.includes('{%')) {
      broken.push({ file: path.relative(SITE, f), ref: url, target: null, kind: 'liquid-leftover' });
      continue;
    }

    let target, kind, reason;
    if (url.startsWith('/')) {
      stats.internal_absolute++;
      const r = resolveLocal(url);
      target = r.target;
      kind = r.reason === 'missing-baseurl' ? 'missing-baseurl' : 'absolute';
      reason = r.reason;
      if (!r.ok) {
        broken.push({
          file: path.relative(SITE, f),
          ref: url,
          target: target ? path.relative(SITE, target) : null,
          kind,
          reason,
        });
      }
    } else {
      stats.internal_relative++;
      target = resolveRelative(f, url);
      kind = 'relative';
      if (!target || !fs.existsSync(target)) {
        broken.push({
          file: path.relative(SITE, f),
          ref: url,
          target: target ? path.relative(SITE, target) : null,
          kind,
        });
      }
    }
  }
}

if (asJson) {
  console.log(JSON.stringify({ stats, broken }, null, 2));
  process.exit(broken.length ? 1 : 0);
}

console.log('\nLink audit · _site/');
console.log('─'.repeat(70));
console.log(`Files scanned:        ${stats.files_scanned}`);
console.log(`Internal absolute:    ${stats.internal_absolute}`);
console.log(`Internal relative:    ${stats.internal_relative}`);
console.log(`External:             ${stats.external}`);
console.log(`Anchor:               ${stats.anchor}`);
console.log(`mailto/tel:           ${stats.mailto}`);
console.log('');
console.log(`BROKEN INTERNAL: ${broken.length}`);
console.log('─'.repeat(70));

if (broken.length === 0) {
  console.log('No broken internal links. ✓');
  process.exit(0);
}

// Group by source file.
const byFile = new Map();
for (const b of broken) {
  if (!byFile.has(b.file)) byFile.set(b.file, []);
  byFile.get(b.file).push(b);
}
// Group by target (most common broken targets).
const byRef = new Map();
for (const b of broken) {
  byRef.set(b.ref, (byRef.get(b.ref) || 0) + 1);
}
const topRefs = [...byRef.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);

console.log('\nMost common broken references:');
for (const [ref, n] of topRefs) {
  console.log(`  ${n.toString().padStart(4)}  ${ref}`);
}
if (verbose) {
  console.log('\nPer-file detail (first 40 files):');
  let i = 0;
  for (const [file, refs] of byFile) {
    if (++i > 40) break;
    console.log(`\n  ${file}  (${refs.length} broken)`);
    for (const r of refs.slice(0, 8)) console.log(`    → ${r.ref}`);
    if (refs.length > 8) console.log(`    … and ${refs.length - 8} more`);
  }
}

process.exit(1);
