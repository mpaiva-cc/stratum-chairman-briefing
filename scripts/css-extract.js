#!/usr/bin/env node
// Audit duplicated inline CSS across the site.
//
// For every .html page, find <style>...</style> blocks, split into individual
// rules, hash each rule (full byte string), and report which rules are
// duplicated across many pages.
//
// Rules are grouped by exact byte match (including selector and declarations),
// not by selector name. This is the discipline the user asked for: rules that
// appear identical but with subtly different values must stay per-page.
//
// Usage: node scripts/css-extract.js                  # default report
//        node scripts/css-extract.js --threshold 30   # show rules in ≥30 pages
//        node scripts/css-extract.js --rule "selector"# show pages containing rule
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['_site', '_includes', '_layouts', 'node_modules',
  'agent-outbox', '.git', '.claude', '.githooks', 'scripts', 'vendor']);

const args = process.argv.slice(2);
const threshold = (() => {
  const i = args.indexOf('--threshold');
  return i >= 0 ? parseInt(args[i + 1], 10) : 20;
})();
const ruleFilter = (() => {
  const i = args.indexOf('--rule');
  return i >= 0 ? args[i + 1] : null;
})();

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && p.endsWith('.html')) out.push(p);
  }
  return out;
}

function extractStyleBlocks(html) {
  const out = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

// Tokenize CSS into top-level rules. Handles nested @media etc. by balancing braces.
// Returns array of {selector, body, full} where `full` is the verbatim "selector { body }".
function splitRules(css) {
  const rules = [];
  let depth = 0;
  let start = 0;
  let inStr = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end < 0) break;
      i = end + 1; continue;
    }
    if (c === '{') {
      depth++;
      continue;
    }
    if (c === '}') {
      depth--;
      if (depth === 0) {
        const full = css.slice(start, i + 1);
        const trimmed = full.replace(/^[\s;]+/, '');
        const braceIdx = trimmed.indexOf('{');
        if (braceIdx > 0) {
          rules.push({
            selector: trimmed.slice(0, braceIdx).trim(),
            full: trimmed,
          });
        }
        start = i + 1;
      }
    }
  }
  return rules;
}

// Normalize for hashing: strip ALL whitespace so rules that differ only in
// indentation/line-breaks are still recognized as identical.
function canonical(rule) {
  return rule.full.replace(/\s+/g, ' ').replace(/\s*([{}:;,])\s*/g, '$1').trim();
}

function hash(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
}

function main() {
  const files = walk(ROOT);
  // ruleHash -> { canonical, sample: full text, pages: Set, bytes: size of full }
  const byRule = new Map();
  // page -> total inline css bytes
  const perPage = new Map();
  let totalInlineCss = 0;
  let totalRules = 0;

  for (const f of files) {
    const html = fs.readFileSync(f, 'utf8');
    const blocks = extractStyleBlocks(html);
    let pageCss = 0;
    for (const block of blocks) {
      pageCss += block.length;
      const rules = splitRules(block);
      for (const r of rules) {
        totalRules++;
        const c = canonical(r);
        const h = hash(c);
        if (!byRule.has(h)) {
          byRule.set(h, { canonical: c, sample: r.full, pages: new Set(), bytes: r.full.length });
        }
        byRule.get(h).pages.add(f);
      }
    }
    totalInlineCss += pageCss;
    perPage.set(f, pageCss);
  }

  if (ruleFilter) {
    // Show pages containing rules whose selector matches.
    console.log(`\nRules matching selector ~/ ${ruleFilter} /:`);
    for (const [h, v] of byRule) {
      if (v.canonical.toLowerCase().includes(ruleFilter.toLowerCase())) {
        console.log(`\n  [${h}] in ${v.pages.size} pages, ${v.bytes}B/rule`);
        console.log(`  rule: ${v.canonical.slice(0, 200)}${v.canonical.length > 200 ? '…' : ''}`);
      }
    }
    return;
  }

  // Sort by total savings (pages × rule bytes), descending.
  const ranked = [...byRule.values()]
    .filter(v => v.pages.size >= threshold)
    .map(v => ({ ...v, pages: v.pages.size, savings: (v.pages.size - 1) * v.bytes }))
    .sort((a, b) => b.savings - a.savings);

  console.log(`\nScanned ${files.length} pages, ${totalRules} CSS rules total, ${(totalInlineCss/1024).toFixed(1)} KB of inline <style>.`);
  console.log(`\nTop duplicated rules (occurring in ≥${threshold} pages), ranked by promotion savings:`);
  console.log(`(savings = (pages - 1) × rule bytes; promoting this rule to /assets/styles.css)\n`);

  let totalSavings = 0;
  const rows = ranked.slice(0, 60);
  for (const r of rows) {
    const sel = r.canonical.split('{')[0].trim().slice(0, 70);
    console.log(`  ${r.pages.toString().padStart(3)}p × ${r.bytes.toString().padStart(4)}B = ${(r.savings/1024).toFixed(1).padStart(6)} KB | ${sel}`);
    totalSavings += r.savings;
  }
  console.log(`\nTotal savings from top ${rows.length} rules: ${(totalSavings/1024).toFixed(1)} KB`);
  console.log(`Total savings from ALL rules ≥${threshold}p: ${(ranked.reduce((s, r) => s + r.savings, 0)/1024).toFixed(1)} KB`);

  // Also report: how much inline CSS would remain per page after promoting
  // these top rules? Helps assess if 30% reduction target is plausible.
  let removable = 0;
  const promoteHashes = new Set(ranked.slice(0, rows.length).map(r => hash(r.canonical)));
  for (const f of files) {
    const html = fs.readFileSync(f, 'utf8');
    for (const block of extractStyleBlocks(html)) {
      for (const r of splitRules(block)) {
        if (promoteHashes.has(hash(canonical(r)))) removable += r.full.length;
      }
    }
  }
  console.log(`\nIf we promote the top ${rows.length} rules:`);
  console.log(`  removable from inline <style>: ${(removable/1024).toFixed(1)} KB (${(removable/totalInlineCss*100).toFixed(1)}% of inline CSS)`);
  console.log(`  cost added to assets/styles.css: ${(rows.reduce((s,r)=>s+r.bytes,0)/1024).toFixed(1)} KB`);

  // Per-page summary table (top 10 largest).
  console.log(`\nLargest inline <style> blocks per page (top 10):`);
  const sortedPages = [...perPage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [f, b] of sortedPages) {
    console.log(`  ${(b/1024).toFixed(1).padStart(6)} KB  ${path.relative(ROOT, f)}`);
  }
}

main();
