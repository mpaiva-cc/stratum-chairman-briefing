#!/usr/bin/env node
// Injects Open Graph + Twitter Card meta tags and a JSON-LD Article block
// into every legacy page's <head>. The values are emitted as Liquid
// expressions so Jekyll fills them in at build time from each page's
// front-matter (title, description, date).
//
// Sentinel comments make this idempotent — re-runs replace the existing
// block rather than appending a second copy.
//
// Skips pages that already have og:title (e.g., new pages using the
// shared default layout, which gets OG via _includes/head.html).
//
// Usage:
//   node scripts/inject-og-jsonld.js          # dry run
//   node scripts/inject-og-jsonld.js --write  # apply
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['_site', '_includes', '_layouts', 'node_modules',
  'agent-outbox', '.git', '.claude', '.githooks', 'scripts', 'vendor']);
const WRITE = process.argv.includes('--write');

const OPEN  = '<!-- og-jsonld:start -->';
const CLOSE = '<!-- og-jsonld:end -->';

// Liquid-templated payload. Jekyll renders {{ ... }} at build time per page.
// Includes the plain <meta name="description"> alongside OG/Twitter so SEO
// tools (and Lighthouse's `meta-description` audit) find a description.
const PAYLOAD = `${OPEN}
<meta name="description" content="{{ page.description | default: site.description | escape }}">
<meta property="og:title" content="{{ page.title | default: site.title | escape }}">
<meta property="og:description" content="{{ page.description | default: site.description | escape }}">
<meta property="og:url" content="{{ site.url }}{{ page.url }}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="{{ site.title | escape }}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{{ page.title | default: site.title | escape }}">
<meta name="twitter:description" content="{{ page.description | default: site.description | escape }}">
{%- if page.title -%}
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":{{ page.title | jsonify }},"description":{{ page.description | default: site.description | jsonify }},"url":"{{ site.url }}{{ page.url }}"{% if page.date %},"datePublished":{{ page.date | date_to_xmlschema | jsonify }}{% endif %}}</script>
{%- endif -%}
${CLOSE}`;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && p.endsWith('.html')) out.push(p);
  }
  // Also include collection directories.
  for (const collDir of ['_briefings', '_essays', '_customers']) {
    const cd = path.join(ROOT, collDir);
    if (fs.existsSync(cd)) {
      for (const ent of fs.readdirSync(cd, { withFileTypes: true })) {
        if (ent.isFile() && ent.name.endsWith('.html')) out.push(path.join(cd, ent.name));
      }
    }
  }
  return [...new Set(out)];
}

function processFile(abs) {
  const before = fs.readFileSync(abs, 'utf8');
  // Skip if page already has the og: payload from the shared head include
  // (i.e., its head already contains <meta property="og:title"> NOT inside our sentinel).
  // We detect by looking for `og:title` outside our markers.
  const sentinelRe = new RegExp(
    OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' +
    CLOSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    'g'
  );
  const withoutSentinel = before.replace(sentinelRe, '');
  if (/<meta\s+property="og:title"/i.test(withoutSentinel)) {
    return { abs, action: 'skip-has-own-og', changed: false };
  }

  let html;
  if (sentinelRe.test(before)) {
    // Replace existing block (re-run / update).
    html = before.replace(sentinelRe, PAYLOAD);
  } else {
    // Insert after <meta charset...> or after <head>.
    const charsetMatch = before.match(/<meta\s+charset[^>]*>/i);
    if (charsetMatch) {
      const at = charsetMatch.index + charsetMatch[0].length;
      html = before.slice(0, at) + '\n' + PAYLOAD + before.slice(at);
    } else {
      const headMatch = before.match(/<head\b[^>]*>/i);
      if (!headMatch) return { abs, action: 'no-head', changed: false };
      const at = headMatch.index + headMatch[0].length;
      html = before.slice(0, at) + '\n' + PAYLOAD + before.slice(at);
    }
  }
  if (html === before) return { abs, action: 'no-change', changed: false };
  if (WRITE) fs.writeFileSync(abs, html);
  return { abs, action: 'injected', changed: true };
}

function main() {
  const files = walk(ROOT);
  const counts = {};
  for (const f of files) {
    const r = processFile(f);
    counts[r.action] = (counts[r.action] || 0) + 1;
  }
  console.log(`${WRITE ? 'WROTE' : 'DRY RUN'} — scanned ${files.length} files`);
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  if (!WRITE) console.log(`\nRe-run with --write to apply.`);
}

main();
