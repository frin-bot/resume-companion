// Keep the public agent profile in sync.
//
// llms.txt is the source. index.md and AGENTS.md are exact copies, served
// at efrain.me alongside llms.txt. Do not edit the copies by hand.
//
//   node scripts/sync-agent-profile.mjs
//   node scripts/sync-agent-profile.mjs --check
//
// --check writes nothing. It exits non-zero when a copy differs from
// llms.txt, when a job or GEMMACON promotion title or date range from
// resume-data.js is missing, or when the "*Last updated: YYYY-MM-DD"
// line is missing.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const llmsPath = path.join(root, 'llms.txt');
const dataPath = path.join(root, 'resume-data.js');
const copyNames = ['index.md', 'AGENTS.md'];

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function loadTimeline() {
  const code = readText(dataPath);
  if (code == null) {
    throw new Error('resume-data.js is missing');
  }
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${code}\nthis.TIMELINE = TIMELINE;`, ctx);
  if (!Array.isArray(ctx.TIMELINE)) {
    throw new Error('resume-data.js did not define TIMELINE');
  }
  return ctx.TIMELINE;
}

// 'Mar 2013 — Mar 2017' -> 'Mar 2013 to Mar 2017'
// 'Apr 2025 — Present' -> 'Apr 2025 to present'
function normalizeDates(dates) {
  return String(dates)
    .replace(/—/g, 'to')
    .replace(/\bpresent\b/gi, 'present');
}

function containsCaseInsensitive(haystack, needle) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function checkCopies(llms) {
  const errors = [];
  for (const name of copyNames) {
    const text = readText(path.join(root, name));
    if (text == null) {
      errors.push(`${name} is missing; it must be an exact copy of llms.txt`);
    } else if (text !== llms) {
      errors.push(`${name} differs from llms.txt`);
    }
  }
  return errors;
}

function checkLastUpdated(llms) {
  if (/^\*Last updated: \d{4}-\d{2}-\d{2}\b/m.test(llms)) return [];
  return ['Missing "*Last updated: YYYY-MM-DD" line in llms.txt'];
}

// ' — ', ' – ', and ', ' are the same separator in a role title.
function normalizeTitle(text) {
  return String(text).replace(/ — /g, ', ').replace(/ – /g, ', ');
}

function checkTitle(llms, title, label) {
  if (title == null || String(title).trim() === '') {
    return [`Missing title for ${label} in resume-data.js`];
  }
  if (!normalizeTitle(llms).includes(normalizeTitle(title))) {
    return [`Missing title for ${label} in llms.txt: expected "${title}"`];
  }
  return [];
}

function checkDates(llms, dates, label) {
  if (dates == null || String(dates).trim() === '') {
    return [`Missing dates for ${label} in resume-data.js`];
  }
  const normalized = normalizeDates(dates);
  if (!containsCaseInsensitive(llms, normalized)) {
    return [`Missing dates for ${label} in llms.txt: expected "${normalized}"`];
  }
  return [];
}

function checkFacts(llms) {
  const errors = [];
  for (const item of loadTimeline()) {
    if (item.type !== 'job') continue;
    const job = `job "${item.title}" (${item.org})`;
    errors.push(...checkTitle(llms, item.title, job));
    errors.push(...checkDates(llms, item.dates, job));
    if (!/GEMMACON/i.test(item.org || '')) continue;
    const promotions = Array.isArray(item.promotions) ? item.promotions : [];
    for (const promo of promotions) {
      const label = `GEMMACON promotion "${promo.title}"`;
      errors.push(...checkTitle(llms, promo.title, label));
      errors.push(...checkDates(llms, promo.dates, label));
    }
  }
  return errors;
}

function writeCopies(llms) {
  for (const name of copyNames) {
    fs.writeFileSync(path.join(root, name), llms);
  }
  console.log('Wrote index.md and AGENTS.md from llms.txt');
}

const llms = readText(llmsPath);
if (llms == null) {
  console.error('llms.txt is missing');
  process.exit(1);
}

if (process.argv.includes('--check')) {
  const errors = [...checkCopies(llms), ...checkLastUpdated(llms), ...checkFacts(llms)];
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exit(1);
  }
  console.log('Agent profile matches llms.txt');
} else {
  writeCopies(llms);
}
