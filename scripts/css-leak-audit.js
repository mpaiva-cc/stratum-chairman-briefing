#!/usr/bin/env node
// Audit which styles.css selectors are "broad enough to leak" onto pages
// that never linked styles.css before Phase 2.
//
// Two passes:
//   1. Parse styles.css, list every TOP-LEVEL selector that is either
//      - a bare element (`section`, `a`, `em`, `h1`)
//      - a single-class selector (`.dot`, `.hero`, `.card`)
//      Skip selectors that are already scoped (`.x .y`, `.x > .y`,
//      `:where()`, attribute selectors, etc.)
//   2. For each candidate selector, count how many legacy pages use
//      that class/element in markup AND have their own conflicting
//      inline <style> rule for the same selector. High counts =
//      likely leak source.
//
// Excluded: rules inside the PROMOTED-DUPS auto-generated block, since
//   those came from legacy inline CSS and are page-coordinated by design.
//
// Output: ranked list of risky selectors with affected page counts.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const STYLES = path.join(ROOT, 'assets/styles.css');
const SKIP = new Set(['_site','_includes','_layouts','node_modules','agent-outbox','.git','.claude','.githooks','scripts','vendor']);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && p.endsWith('.html')) out.push(p);
  }
  for (const coll of ['_briefings','_essays','_customers']) {
    const cd = path.join(ROOT, coll);
    if (!fs.existsSync(cd)) continue;
    for (const ent of fs.readdirSync(cd, { withFileTypes: true })) {
      if (ent.isFile() && ent.name.endsWith('.html')) out.push(path.join(cd, ent.name));
    }
  }
  return [...new Set(out)];
}

function stripPromotedBlock(css) {
  return css.replace(
    /\/\* ── PROMOTED-DUPS · auto-generated[\s\S]*?\/\* ── \/PROMOTED-DUPS ── \*\//g,
    ''
  );
}

// Parse top-level CSS rules. Returns array of { selector, body }.
function parseRules(css) {
  const rules = [];
  let depth = 0, start = 0, inStr = null, inComment = false;
  for (let i = 0; i < css.length; i++) {
    const c = css[i], n = css[i+1];
    if (inComment) { if (c === '*' && n === '/') { inComment = false; i++; } continue; }
    if (c === '/' && n === '*') { inComment = true; i++; continue; }
    if (inStr) { if (c === '\\') i++; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '{') {
      depth++;
      continue;
    }
    if (c === '}') {
      depth--;
      if (depth === 0) {
        const block = css.slice(start, i + 1).trim();
        const braceAt = block.indexOf('{');
        if (braceAt > 0) {
          rules.push({
            selector: block.slice(0, braceAt).trim(),
            body: block.slice(braceAt + 1, -1).trim(),
          });
        }
        start = i + 1;
      }
    }
  }
  return rules;
}

// True if a selector is "broad" — risk of leaking onto pages that have
// their own inline conflicting styles.
function isLeakable(selector) {
  // Skip @rules (handled by their nested rules instead).
  if (selector.startsWith('@')) return false;
  // Multi-selector: each one is checked separately upstream.
  if (selector.includes(',')) return false;
  // Combinators present? Already scoped.
  if (/[\s>+~]/.test(selector.trim()) && !/^:?\w/.test(selector.replace(/[\s>+~].*$/, ''))) {
    // Actually any combinator means scoped.
    return false;
  }
  if (/[\s>+~]/.test(selector.trim())) return false;
  // :where() / :is() wrappers — handled as scoped.
  if (selector.includes(':where(') || selector.includes(':is(')) return false;
  // Bare element (one token, no leading . # [ :) → leakable.
  if (/^[a-z][a-z0-9-]*$/.test(selector)) return true;
  // Single class: `.foo`, optionally with pseudo-class/element/attr.
  if (/^\.[a-zA-Z][\w-]*(?::[\w-]+(?:\([^)]*\))?|\[[^\]]+\])*$/.test(selector)) return true;
  return false;
}

// Get the "core" identifier from a leakable selector (used for class-name match).
function selectorIdent(selector) {
  if (selector.startsWith('.')) return selector.slice(1).split(/[:[]/)[0];
  return selector.split(/[:[]/)[0]; // element name
}

function isClassSelector(selector) {
  return selector.startsWith('.');
}

function main() {
  const cssRaw = fs.readFileSync(STYLES, 'utf8');
  const css = stripPromotedBlock(cssRaw);
  const rules = parseRules(css);
  const leakable = [];
  for (const r of rules) {
    // Split multi-selectors and check each one.
    const parts = r.selector.split(',').map(s => s.trim());
    for (const p of parts) {
      if (isLeakable(p)) {
        leakable.push({ selector: p, body: r.body.slice(0, 80) });
      }
    }
  }
  // Dedupe.
  const seen = new Map();
  for (const l of leakable) {
    if (!seen.has(l.selector)) seen.set(l.selector, { ...l, count: 0 });
    seen.get(l.selector).count++;
  }

  const files = walk(ROOT);
  // For each leakable selector, count pages where:
  //   (a) the class/element actually appears in markup, AND
  //   (b) the page has its OWN inline <style> rule for the same selector.
  const usage = new Map();
  for (const [sel, info] of seen) {
    usage.set(sel, { uses: new Set(), conflicts: new Set() });
  }

  for (const f of files) {
    const html = fs.readFileSync(f, 'utf8');
    // Extract <style> blocks (skip <link>).
    const styleText = (html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) || []).join('\n');
    for (const sel of seen.keys()) {
      const ident = selectorIdent(sel);
      let usedInMarkup = false;
      if (isClassSelector(sel)) {
        // Markup uses class="...ident..." (word-boundary)
        const re = new RegExp('class\\s*=\\s*"[^"]*\\b' + ident + '\\b', 'i');
        usedInMarkup = re.test(html);
      } else {
        // Markup contains the element.
        const re = new RegExp('<' + ident + '\\b', 'i');
        usedInMarkup = re.test(html);
      }
      if (usedInMarkup) usage.get(sel).uses.add(f);
      // Does the page's inline CSS *redefine* the same selector?
      const reCss = isClassSelector(sel)
        ? new RegExp('(^|[\\s,>+~}])\\.' + ident + '\\b\\s*[,{]', 'm')
        : new RegExp('(^|[\\s,>+~}])' + ident + '\\b\\s*[,{]', 'm');
      if (reCss.test(styleText)) usage.get(sel).conflicts.add(f);
    }
  }

  // Rank by likely-leak risk: conflict count (pages that have their own
  // rule that competes with styles.css's rule).
  const rows = [...seen.entries()].map(([sel, info]) => ({
    selector: sel,
    body: info.body,
    uses: usage.get(sel).uses.size,
    conflicts: usage.get(sel).conflicts.size,
  }))
  .filter(r => r.uses > 0)
  .sort((a, b) => b.conflicts - a.conflicts || b.uses - a.uses);

  console.log(`Leakable selectors in styles.css: ${seen.size}`);
  console.log(`(excludes PROMOTED-DUPS block, scoped selectors, @rules)\n`);
  console.log('selector'.padEnd(34) + 'uses  conflicts  declares');
  console.log('─'.repeat(80));
  for (const r of rows) {
    console.log(
      r.selector.padEnd(34) +
      r.uses.toString().padStart(4) +
      r.conflicts.toString().padStart(11) + '  ' +
      r.body.slice(0, 30)
    );
  }
}

main();
