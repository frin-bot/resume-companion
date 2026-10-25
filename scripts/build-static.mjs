// Render resume-data.js into index.html and manifest.webmanifest.
//
// Edit resume content in resume-data.js, then run:
//   node scripts/build-static.mjs
// Check that the committed page still matches the data:
//   node scripts/build-static.mjs --check
//
// Vercel runs this on deploy. The markers in index.html (<!--static:name-->)
// are the only parts this script rewrites.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'index.html');
const manifestPath = path.join(root, 'manifest.webmanifest');
const dataPath = path.join(root, 'resume-data.js');
const SITE = 'https://www.efrain.me/';

function loadData() {
  const code = fs.readFileSync(dataPath, 'utf8');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.TIMELINE = TIMELINE; this.RESUME_META = RESUME_META;', ctx);
  return { timeline: ctx.TIMELINE, meta: ctx.RESUME_META };
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function replaceRegion(html, name, content) {
  const pattern = new RegExp(`<!--static:${name}-->[\\s\\S]*?<!--/static:${name}-->`);
  if (!pattern.test(html)) {
    throw new Error(`index.html is missing <!--static:${name}-->`);
  }
  const body = content.replace(/\s+$/, '');
  return html.replace(pattern, `<!--static:${name}-->\n${body}\n<!--/static:${name}-->`);
}

function bullets(items) {
  return (items || []).map(item => `        <li>${esc(item)}</li>`).join('\n');
}

function heroMeta(meta) {
  const langs = meta.languages.map(lang => esc(lang.name)).join(' · ');
  return `    <div>
      <div class="meta-label">Based in</div>
      <div class="meta-val">${esc(meta.location)}</div>
    </div>
    <div>
      <div class="meta-label">Contact</div>
      <div class="meta-val"><a href="mailto:${esc(meta.email)}">${esc(meta.email)}</a></div>
      <div class="meta-val dim">${esc(meta.phone)}</div>
    </div>
    <div>
      <div class="meta-label">Profile</div>
      <div class="meta-val"><a href="https://${esc(meta.linkedin)}" target="_blank" rel="noopener">${esc(meta.linkedin)}</a></div>
      <div class="meta-val"><a href="https://${esc(meta.github)}" target="_blank" rel="noopener">${esc(meta.github)}</a></div>
      <div class="meta-val"><a href="https://${esc(meta.x)}" target="_blank" rel="noopener">${esc(meta.x)}</a></div>
    </div>
    <div>
      <div class="meta-label">Languages</div>
      <div class="meta-val">${langs}</div>
    </div>`;
}

function competencies(meta) {
  return meta.competencies.map((item, index) => `    <li>
      <span class="comp-num">${String(index + 1).padStart(2, '0')}</span>
      <span class="comp-text">${esc(item)}</span>
    </li>`).join('\n');
}

function skills(meta) {
  return Object.entries(meta.skills).map(([name, body]) => `    <div class="skill-block">
      <div class="skill-head">${esc(name)}</div>
      <div class="skill-body">${esc(body)}</div>
    </div>`).join('\n');
}

function highlights(meta) {
  return (meta.highlights || []).map(item => `    <div class="highlight">
      <div class="highlight-main">
        <div class="highlight-title">${esc(item.title)}</div>
        <div class="highlight-body">${esc(item.body)}</div>
      </div>
      <div class="highlight-year">${esc(item.year)}</div>
    </div>`).join('\n');
}

function projects(meta) {
  return (meta.projects || []).map(project => {
    const title = project.link
      ? `<a href="${esc(project.link)}" target="_blank" rel="noopener">${esc(project.title)}</a>`
      : esc(project.title);
    const tags = (project.tags || []).length
      ? `\n        <div class="project-tags">${project.tags.map(tag => `<span class="project-tag">${esc(tag)}</span>`).join('')}</div>`
      : '';
    const items = (project.bullets || []).map(item => `<li>${esc(item)}</li>`).join('');
    return `    <div class="project">
      <div class="project-main">
        <div class="project-title">${title}</div>
        <div class="project-role">${esc(project.role)} · ${esc(project.domain)}</div>
        <div class="project-body">${esc(project.tagline)}</div>
        <ul class="project-bullets">${items}</ul>${tags}
      </div>
      <div class="project-year">${esc(project.year)}</div>
    </div>`;
  }).join('\n');
}

function certifications(meta) {
  return (meta.certifications || []).map(item => {
    const title = item.link
      ? `<a href="${esc(item.link)}" target="_blank" rel="noopener">${esc(item.title)}</a>`
      : esc(item.title);
    return `    <div class="cert">
      <div class="cert-main">
        <div class="cert-title">${title}</div>
        <div class="cert-org">${esc(item.org)}</div>
      </div>
      <div class="cert-year">${esc(item.year)}</div>
    </div>`;
  }).join('\n');
}

function languages(meta) {
  return meta.languages.map(lang => `    <div class="lang">
      <div class="lang-name">${esc(lang.name)}</div>
      <div class="lang-level">${esc(lang.level)}</div>
    </div>`).join('\n');
}

function icon(label, paths) {
  return `<span class="k">
      <svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>
      <span class="visually-hidden">${esc(label)}</span>
    </span>`;
}

function contact(meta) {
  return `    <div class="contact-line">
      ${icon('Email', '<path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10" /><path d="M3 7l9 6l9 -6" />')}
      <a class="v" href="mailto:${esc(meta.email)}">${esc(meta.email)}</a>
    </div>
    <div class="contact-line">
      ${icon('Phone', '<path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2" />')}
      <span class="v">${esc(meta.phone)}</span>
    </div>
    <div class="contact-line">
      ${icon('LinkedIn', '<path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" /><path d="M8 11l0 5" /><path d="M8 8l0 .01" /><path d="M12 16l0 -5" /><path d="M16 16v-3a2 2 0 0 0 -4 0" />')}
      <a class="v" href="https://${esc(meta.linkedin)}" target="_blank" rel="noopener">${esc(meta.linkedin)}</a>
    </div>
    <div class="contact-line">
      ${icon('GitHub', '<path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5" />')}
      <a class="v" href="https://${esc(meta.github)}" target="_blank" rel="noopener">${esc(meta.github)}</a>
    </div>
    <div class="contact-line">
      ${icon('X', '<path d="M4 4l11.733 16h4.267l-11.733 -16z" /><path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />')}
      <a class="v" href="https://${esc(meta.x)}" target="_blank" rel="noopener">${esc(meta.x)}</a>
    </div>
    <div class="contact-line">
      ${icon('Location', '<path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" />')}
      <span class="v">${esc(meta.location)}</span>
    </div>`;
}

function experience(timeline) {
  const roles = timeline.map(item => {
    const kind = item.type === 'education' ? 'Education' : 'Experience';
    const promotions = (item.promotions || []).map(role => `      <div class="static-promo">
        <h4>${esc(role.title)}</h4>
        <p class="static-promo-dates">${esc(role.dates)}</p>
        <ul>
${bullets(role.bullets)}
        </ul>
      </div>`).join('\n');
    return `    <article class="static-role">
      <p class="static-role-kind">${kind}</p>
      <h3>${esc(item.title)}</h3>
      <p class="static-role-meta">${esc(item.org)} · ${esc(item.city)} · ${esc(item.dates)}</p>
      <ul>
${bullets(item.bullets)}
      </ul>
${promotions}
    </article>`;
  }).join('\n');
  return `    <div class="experience-static" id="experience-static">
      <div class="section-label">
        <span class="num">03</span>
        <span class="lbl">Professional Experience &amp; Education</span>
      </div>
${roles}
    </div>`;
}

function head(meta) {
  const title = `${meta.name} — ${meta.titleLine}`;
  const description = meta.summary;
  const sameAs = [meta.linkedin, meta.github, meta.x].map(href => `https://${href}`);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: meta.name,
    jobTitle: meta.titleLine,
    description: meta.summary,
    url: SITE,
    email: `mailto:${meta.email}`,
    homeLocation: meta.location,
    sameAs,
  };
  const json = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
  return `  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${SITE}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(meta.name)}">
  <meta property="og:url" content="${SITE}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <script type="application/ld+json">${json}</script>`;
}

function renderHtml(html, meta, timeline) {
  const regions = {
    head: head(meta),
    headline: `    ${esc(meta.titleLine)}`,
    'hero-meta': heroMeta(meta),
    summary: `  ${esc(meta.summary)}`,
    competencies: competencies(meta),
    skills: skills(meta),
    highlights: highlights(meta),
    projects: projects(meta),
    certifications: certifications(meta),
    languages: languages(meta),
    contact: contact(meta),
    experience: experience(timeline),
  };
  let next = html;
  for (const [name, content] of Object.entries(regions)) {
    next = replaceRegion(next, name, content);
  }
  return next;
}

function renderManifest(text, meta) {
  const pattern = /"description"\s*:\s*"(?:\\.|[^"\\])*"/;
  if (!pattern.test(text)) throw new Error('manifest.webmanifest has no description');
  return text.replace(pattern, `"description": ${JSON.stringify(meta.titleLine)}`);
}

function build() {
  const { meta, timeline } = loadData();
  const html = renderHtml(fs.readFileSync(htmlPath, 'utf8'), meta, timeline);
  const manifest = renderManifest(fs.readFileSync(manifestPath, 'utf8'), meta);
  return { html, manifest };
}

const check = process.argv.includes('--check');
const { html, manifest } = build();
const currentHtml = fs.readFileSync(htmlPath, 'utf8');
const currentManifest = fs.readFileSync(manifestPath, 'utf8');

if (check) {
  if (html !== currentHtml || manifest !== currentManifest) {
    console.error('Static page is out of date with resume-data.js. Run: node scripts/build-static.mjs');
    process.exit(1);
  }
  console.log('Static page matches resume-data.js');
} else {
  fs.writeFileSync(htmlPath, html);
  fs.writeFileSync(manifestPath, manifest);
  console.log('Wrote index.html and manifest.webmanifest');
}
