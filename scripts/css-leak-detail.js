#!/usr/bin/env node
// Drill-down on a single styles.css selector: list every page that uses the
// class/element in markup but doesn't define its own conflicting <style> rule.
// Those pages are unprotected — styles.css's rule applies to them.
//
// Usage: node scripts/css-leak-detail.js <selector>
//   e.g. node scripts/css-leak-detail.js .pill
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['_site','_includes','_layouts','node_modules','agent-outbox','.git','.claude','.githooks','scripts','vendor']);

const sel = process.argv[2];
if (!sel) { console.error('usage: css-leak-detail.js <.class|element>'); process.exit(1); }
const ident = sel.startsWith('.') ? sel.slice(1) : sel;
const isClass = sel.startsWith('.');

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

const files = walk(ROOT);
// Strict class-token match — class="foo bar baz" with the token bounded
// by start, space, or quote. Avoids matching "spark-line" when looking
// for "line", because hyphens are word characters here.
const reMarkup = isClass
  ? new RegExp('class\\s*=\\s*"(?:[^"]*\\s)?' + ident + '(?:\\s[^"]*)?"', 'i')
  : new RegExp('<' + ident + '\\b', 'i');
const reCss = isClass
  ? new RegExp('(^|[\\s,>+~}])\\.' + ident + '\\b\\s*[,{]', 'm')
  : new RegExp('(^|[\\s,>+~}])' + ident + '\\b\\s*[,{]', 'm');

const using = [];
const usingButProtected = [];
const usingAndExposed = [];

for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  if (!reMarkup.test(html)) continue;
  using.push(f);
  const styleBlocks = (html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) || []).join('\n');
  const protectedFromLeak = reCss.test(styleBlocks);
  (protectedFromLeak ? usingButProtected : usingAndExposed).push(f);
}

console.log(`Selector: ${sel}`);
console.log(`Pages using class/element in markup: ${using.length}`);
console.log(`  protected by their own inline <style> rule: ${usingButProtected.length}`);
console.log(`  EXPOSED to styles.css's rule:               ${usingAndExposed.length}`);
console.log('\nExposed pages:');
for (const f of usingAndExposed) console.log('  ', path.relative(ROOT, f));
