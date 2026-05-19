#!/usr/bin/env node
// One-shot migrator: prepend Jekyll front-matter to every .html page in the
// repo and replace its existing top navigation block with a Liquid include.
//
// Idempotent: if a file already starts with `---` (front-matter), the file is
// re-scanned for unreplaced navs but front-matter is not duplicated.
//
// Pages keep their own <head>...</head> and inline <style> blocks intact.
// Phase 2 will consolidate those.
//
// Usage: node scripts/jekyll-migrate.js          # dry run, prints diff summary
//        node scripts/jekyll-migrate.js --write  # apply changes
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');
const VERBOSE = process.argv.includes('--verbose');

// Directories to skip entirely.
const SKIP_DIRS = new Set([
  '_site', '_includes', '_layouts', 'node_modules', 'agent-outbox',
  '.git', '.claude', '.githooks', 'scripts', 'vendor',
]);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && p.endsWith('.html')) out.push(p);
  }
  return out;
}

// Decode common HTML entities in attribute-extracted strings.
function decode(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(m[1].replace(/\s+/g, ' ').trim()) : '';
}

function extractDescription(html) {
  const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
         || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  return m ? decode(m[1].trim()) : '';
}

// Find the matching </nav> for a <nav ...> that begins at `start`.
// Returns the index just past </nav>.
function findNavEnd(html, start) {
  // Most navs are non-nested; just find the next </nav> after start.
  const idx = html.indexOf('</nav>', start);
  return idx >= 0 ? idx + '</nav>'.length : -1;
}

// Replace the nav region. Returns { html, replaced }.
// We:
//   - find the first <nav class="site-nav" OR <nav class="nav" id="nav">
//   - extend the region forward to swallow any following <div class="sn-mobile" ...> ... </div>
//   - replace with the include
//   - if a SECOND nav block exists (legacy double-nav pages like recruiter),
//     remove that block too (with its sn-mobile sibling, if any)
function replaceNavBlock(html) {
  const navPatterns = [
    /<nav[^>]+class="site-nav"[^>]*>/i,
    /<nav[^>]+class="nav"\s+id="nav"[^>]*>/i,
    /<nav[^>]+id="nav"\s+class="nav"[^>]*>/i,
    /<nav[^>]+class="masthead-nav"[^>]*>/i,
  ];

  function findFirstNav(src) {
    let best = null;
    for (const re of navPatterns) {
      const m = re.exec(src);
      if (m && (best === null || m.index < best.index)) {
        best = { index: m.index, match: m[0] };
      }
    }
    return best;
  }

  // Also strip any preceding skip-link if it's the canonical one we re-emit.
  function stripPrecedingSkipLink(src, navStart) {
    const back = src.slice(Math.max(0, navStart - 200), navStart);
    const skipRe = /<a[^>]+href="#main"[^>]+class="skip"[^>]*>[\s\S]*?<\/a>\s*(?:<!--[\s\S]*?-->\s*)?$/i;
    const m = back.match(skipRe);
    if (m) {
      return { newStart: navStart - m[0].length, stripped: m[0] };
    }
    return { newStart: navStart, stripped: '' };
  }

  // Swallow trailing sn-mobile overlay if present.
  function extendThroughSnMobile(src, end) {
    const tail = src.slice(end, end + 60);
    const ws = tail.match(/^\s*(?:<!--[\s\S]*?-->\s*)?/);
    const skip = ws ? ws[0].length : 0;
    const after = end + skip;
    if (/^<div[^>]+class="sn-mobile"/i.test(src.slice(after, after + 80))) {
      const closeIdx = src.indexOf('</div>', after);
      if (closeIdx < 0) return end;
      // sn-mobile has nested <div>s; we need depth counting.
      let depth = 1;
      let cursor = src.indexOf('>', after) + 1;
      while (cursor < src.length && depth > 0) {
        const nextOpen = src.indexOf('<div', cursor);
        const nextClose = src.indexOf('</div>', cursor);
        if (nextClose < 0) break;
        if (nextOpen >= 0 && nextOpen < nextClose) {
          depth++;
          cursor = nextOpen + 4;
        } else {
          depth--;
          cursor = nextClose + '</div>'.length;
          if (depth === 0) return cursor;
        }
      }
    }
    return end;
  }

  const INCLUDE = '{% include site-nav.html %}';
  let out = html;
  let replaced = 0;

  // First pass: replace the primary nav.
  let first = findFirstNav(out);
  if (!first) return { html: out, replaced };

  const end1 = findNavEnd(out, first.index);
  if (end1 < 0) return { html: out, replaced };
  const { newStart } = stripPrecedingSkipLink(out, first.index);
  const extendedEnd = extendThroughSnMobile(out, end1);
  out = out.slice(0, newStart) + INCLUDE + out.slice(extendedEnd);
  replaced++;

  // Second pass: if there's another nav block (duplicate-nav legacy pages),
  // remove it entirely (no include — we already have one).
  const second = findFirstNav(out);
  if (second && !out.slice(second.index, second.index + INCLUDE.length).includes('include site-nav')) {
    const end2 = findNavEnd(out, second.index);
    if (end2 > 0) {
      const ext2 = extendThroughSnMobile(out, end2);
      // Strip the second one without re-including.
      out = out.slice(0, second.index) + out.slice(ext2);
      replaced++;
    }
  }

  return { html: out, replaced };
}

// If the page has NO recognizable nav, inject the include immediately after <body>.
function injectNavAfterBody(html) {
  const m = html.match(/<body[^>]*>/i);
  if (!m) return { html, injected: false };
  const idx = m.index + m[0].length;
  return {
    html: html.slice(0, idx) + '\n{% include site-nav.html %}\n' + html.slice(idx),
    injected: true,
  };
}

function buildFrontMatter(absPath, html) {
  const rel = path.relative(ROOT, absPath).replace(/\\/g, '/');
  const url = '/' + rel; // permalink keeps the exact existing URL
  const title = extractTitle(html);
  const description = extractDescription(html);
  const lines = ['---'];
  lines.push('layout: legacy');
  if (title) lines.push(`title: ${JSON.stringify(title)}`);
  if (description) lines.push(`description: ${JSON.stringify(description)}`);
  lines.push(`permalink: ${url}`);
  lines.push('---');
  return lines.join('\n') + '\n';
}

function alreadyHasFrontMatter(html) {
  return /^﻿?---\r?\n/.test(html);
}

function processFile(abs) {
  const original = fs.readFileSync(abs, 'utf8');
  let html = original;
  let actions = [];

  // Step 1: prepend front-matter if not already present.
  if (!alreadyHasFrontMatter(html)) {
    const fm = buildFrontMatter(abs, html);
    html = fm + html;
    actions.push('front-matter');
  }

  // Step 2: replace existing nav block(s) with include.
  const { html: replaced, replaced: count } = replaceNavBlock(html);
  if (count > 0) {
    html = replaced;
    actions.push(`replaced-nav x${count}`);
  } else {
    // Step 2b: page has no nav — inject the include after <body>.
    const { html: injected, injected: didInject } = injectNavAfterBody(html);
    if (didInject) {
      html = injected;
      actions.push('injected-nav');
    }
  }

  const changed = html !== original;
  if (changed && WRITE) fs.writeFileSync(abs, html);
  return { abs, actions, changed };
}

function main() {
  const files = walk(ROOT);
  let changed = 0;
  const byAction = {};
  for (const f of files) {
    const r = processFile(f);
    if (r.changed) changed++;
    for (const a of r.actions) byAction[a] = (byAction[a] || 0) + 1;
    if (VERBOSE) console.log(path.relative(ROOT, f), '→', r.actions.join(', ') || '(no change)');
  }
  console.log(`\n${WRITE ? 'WROTE' : 'DRY RUN'} — scanned ${files.length} files, ${changed} would change`);
  for (const [k, v] of Object.entries(byAction)) console.log(`  ${k}: ${v}`);
  if (!WRITE) console.log('\nRe-run with --write to apply.');
}

main();
