#!/usr/bin/env node
// Sweep audit for the `section { width: var(--col) }` leak from
// assets/styles.css. Inspects every page's HTML + page-local <style>
// block. Pure static analysis — no browser needed.
//
// Categories:
//   NEEDS-FIX  — page has a reading column (.post / .gate-card) and
//                <section> elements inside it that don't override
//                the global section { width: var(--col) } rule
//   ok         — page either overrides `section` itself, or every
//                <section> on the page has a class with its own
//                width set in the page <style> block
//   review     — page uses bare <section> at top level and relies
//                on the global rule (probably intentional: home,
//                briefings, customer notes, etc.)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, '_site');

if (!fs.existsSync(SITE)) {
  console.error('No _site/. Run `bundle exec jekyll build` first.');
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

function analyze(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const rel = path.relative(SITE, htmlPath);

  const sectionMatches = [...html.matchAll(/<section\b([^>]*)>/gi)];
  if (sectionMatches.length === 0) return null;

  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map(m => m[1]).join('\n');

  const hasBareSectionOverride =
    /(^|[\s,{};])section\s*\{[^}]*(width|max-width)\s*:/m.test(styles);

  const hasReadingColumn =
       /<article\s+class="post"/.test(html)
    || /<article\s+class="sheet"/.test(html)
    || /<div\s+class="gate-card"/.test(html);

  const classedSections = sectionMatches.map(m => {
    const cls = (m[1].match(/class="([^"]*)"/) || [,''])[1].trim();
    return cls.split(/\s+/)[0] || '';
  });

  const classesWithOwnWidth = new Set();
  for (const cls of classedSections) {
    if (!cls) continue;
    const safe = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\.' + safe + '\\s*\\{[^}]*(width|max-width|grid-template)\\s*:', 'm');
    if (re.test(styles)) classesWithOwnWidth.add(cls);
  }

  const items = sectionMatches.map(m => {
    const cls = (m[1].match(/class="([^"]*)"/) || [,''])[1].trim();
    const firstClass = cls.split(/\s+/)[0] || '';
    let verdict = 'inherits-global';
    if (firstClass && classesWithOwnWidth.has(firstClass)) verdict = 'has-own-width';
    else if (hasBareSectionOverride) verdict = 'page-overrides-section';
    else if (hasReadingColumn) verdict = 'inside-reading-column-needs-scoping';
    return { firstClass, verdict };
  });

  const insideReading = items.some(i => i.verdict === 'inside-reading-column-needs-scoping');
  const allOK = items.every(i => i.verdict === 'has-own-width' || i.verdict === 'page-overrides-section');

  let pageStatus;
  if (insideReading) pageStatus = 'NEEDS-FIX';
  else if (allOK) pageStatus = 'ok';
  else pageStatus = 'review';

  return { rel, sectionCount: sectionMatches.length, items, pageStatus };
}

const reports = walk(SITE).map(analyze).filter(Boolean);
const needsFix = reports.filter(r => r.pageStatus === 'NEEDS-FIX');
const review   = reports.filter(r => r.pageStatus === 'review');
const ok       = reports.filter(r => r.pageStatus === 'ok');

console.log('\nSection-leak sweep · ' + reports.length + ' pages with <section>\n');
console.log('  NEEDS-FIX  ' + needsFix.length);
console.log('  review     ' + review.length);
console.log('  ok         ' + ok.length);

if (needsFix.length) {
  console.log('\n── NEEDS-FIX ──');
  for (const r of needsFix) {
    console.log('\n  ' + r.rel);
    const counts = {};
    for (const i of r.items) {
      const key = i.firstClass || '(no class)';
      counts[key] = (counts[key] || 0) + 1;
    }
    for (const [cls, n] of Object.entries(counts).sort((a,b) => b[1]-a[1])) {
      console.log('    × ' + n + '  <section class="' + cls + '">');
    }
  }
}

console.log('\n── review (probably intentional full-bleed) ──');
for (const r of review.slice(0, 60)) {
  console.log('  ' + r.sectionCount.toString().padStart(3) + '×  ' + r.rel);
}
if (review.length > 60) console.log('  … and ' + (review.length - 60) + ' more');
