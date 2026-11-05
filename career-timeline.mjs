// Career timeline variants. The page defaults to B. ?timeline=a|b|c switches
// the preview. There is no visible control.

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export const DEFAULT_TIMELINE_VARIANT = 'b';

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pct(fraction) {
  return `${(fraction * 100).toFixed(4)}%`;
}

// Month tokens mark the start of that month. A year with no month covers that
// whole calendar year. "Present" runs through December of the entry's endYear.
function parseEdge(token, edge, endYear) {
  const text = String(token).trim();
  if (/^present$/i.test(text)) {
    if (!Number.isInteger(endYear)) return null;
    return (endYear + 1) * 12;
  }
  const monthYear = text.match(/^([A-Za-z]{3,})\s+(\d{4})$/);
  if (monthYear) {
    const month = MONTHS[monthYear[1].slice(0, 3).toLowerCase()];
    if (month == null) return null;
    return Number(monthYear[2]) * 12 + month;
  }
  const yearOnly = text.match(/^(\d{4})$/);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    return edge === 'end' ? (year + 1) * 12 : year * 12;
  }
  return null;
}

function parseSpan(dates, endYear) {
  const parts = String(dates).split(/\s+[—–-]\s+/);
  if (parts.length !== 2) return null;
  const start = parseEdge(parts[0], 'start', endYear);
  const end = parseEdge(parts[1], 'end', endYear);
  if (start == null || end == null || end <= start) return null;
  return { start, end };
}

function prepare(timeline) {
  const entries = [];
  for (const item of timeline) {
    const kind = item.type === 'education' ? 'education' : 'experience';
    const roles = item.promotions && item.promotions.length
      ? item.promotions.map(role => ({ title: role.title, dates: role.dates }))
      : [{ title: item.title, dates: item.dates }];
    for (const role of roles) {
      entries.push({
        kind,
        title: role.title,
        org: item.org,
        dates: role.dates,
        span: parseSpan(role.dates, item.endYear),
      });
    }
  }
  const placed = entries.filter(entry => entry.span);
  if (!placed.length) throw new Error('Career timeline has no entries with a usable date span');
  const scaleStart = Math.min(...placed.map(entry => entry.span.start));
  const scaleEnd = Math.max(...placed.map(entry => entry.span.end));
  const span = scaleEnd - scaleStart;
  const startYear = Math.floor(scaleStart / 12);
  const labels = [];
  for (let year = startYear; year * 12 < scaleEnd; year += 4) {
    const fraction = (year * 12 - scaleStart) / span;
    if (fraction >= 0.97) continue;
    labels.push({
      text: String(year),
      fraction,
      edge: labels.length === 0 ? 'start' : '',
    });
  }
  labels.push({ text: 'Today', fraction: 1, edge: 'today' });
  return { entries, placed, scaleStart, scaleEnd, span, labels };
}

function labelClass(label) {
  const names = [];
  if (label.edge === 'start') names.push('is-start');
  if (label.edge === 'today') names.push('is-today');
  else if (1 - label.fraction < 0.2) names.push('is-near-end');
  return names.length ? ` class="${names.join(' ')}"` : '';
}

function axisHtml(labels) {
  return labels.map(label =>
    `<span${labelClass(label)} style="left:${pct(label.fraction)}">${esc(label.text)}</span>`
  ).join('');
}

function gridHtml(labels) {
  return labels.map(label =>
    `<span${labelClass(label)} style="left:${pct(label.fraction)}"></span>`
  ).join('');
}

function textList(entries) {
  return entries.map(entry => {
    const kindLabel = entry.kind === 'education' ? 'Education' : 'Experience';
    return `<li>${esc(kindLabel)}. ${esc(entry.title)}. ${esc(entry.org)}. ${esc(entry.dates)}.</li>`;
  }).join('\n');
}

function hitAttrs(entry, active) {
  const kindLabel = entry.kind === 'education' ? 'Education' : 'Experience';
  const accessible = `${kindLabel}. ${entry.title}. ${entry.org}. ${entry.dates}.`;
  const span = entry.span
    ? ` data-start="${entry.span.start}" data-end="${entry.span.end}"`
    : '';
  return `class="tl-hit${active ? ' is-active' : ''} is-${entry.kind}" data-kind="${esc(kindLabel)}" data-title="${esc(entry.title)}" data-org="${esc(entry.org)}" data-dates="${esc(entry.dates)}" aria-label="${esc(accessible)}" title="${esc(accessible)}"${span}`;
}

const CHEVRON = '<svg class="tl-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6 -6l6 6"/></svg>';

function shell(variant, legend, body, entries) {
  return `<section class="career-gantt timeline-${variant}" id="career-gantt" data-variant="${variant}" aria-labelledby="career-gantt-heading">
    <div class="tl-head">
      <div class="section-label">
        <span class="lbl" id="career-gantt-heading">Timeline</span>
      </div>
      ${legend}
    </div>
    <details class="tl-details" open>
      ${body}
      <summary>
        <span class="tl-toggle-open">Collapse <span class="visually-hidden">timeline</span></span>
        <span class="tl-toggle-closed">Expand <span class="visually-hidden">timeline</span></span>
        ${CHEVRON}
      </summary>
    </details>
    <div class="visually-hidden" id="career-gantt-text">
      <p>Career timeline as text.</p>
      <ol>
${textList(entries)}
      </ol>
    </div>
  </section>`;
}

function renderA(model) {
  const { placed, labels } = model;
  const last = placed.length - 1;
  const bars = placed.map((entry, index) => {
    const x = (entry.span.start - model.scaleStart) / model.span;
    const w = (entry.span.end - entry.span.start) / model.span;
    const origin = x < 0.02 ? ' is-origin' : '';
    return `<li class="tl-item${origin}" style="--x:${pct(x)};--w:${pct(w)};--lane:${index}">
      <span class="tl-label">${esc(entry.title)}</span>
      <button type="button" ${hitAttrs(entry, index === last)}>
        <span class="tl-mark"></span>
      </button>
    </li>`;
  }).join('\n');
  const current = placed[last];
  const legend = `<ul class="tl-legend">
        <li><span class="tl-swatch is-experience"></span> Experience</li>
        <li><span class="tl-swatch is-education"></span> Education</li>
      </ul>`;
  const body = `<div class="tl-body" id="career-gantt-chart">
        <div class="tl-readout">
          <p class="tl-kicker" data-tl-kind>${esc(current.kind === 'education' ? 'Education' : 'Experience')}</p>
          <p class="tl-readout-title" data-tl-title>${esc(current.title)}</p>
          <p class="tl-readout-meta" data-tl-meta>${esc(current.org)} · ${esc(current.dates)}</p>
        </div>
        <div class="tl-a-chart" style="--lanes:${placed.length}">
          <div class="tl-plot">
            <div class="tl-grid" aria-hidden="true">${gridHtml(labels)}</div>
            <ol class="tl-bars">${bars}</ol>
          </div>
          <div class="tl-axis" aria-hidden="true">${axisHtml(labels)}</div>
        </div>
      </div>`;
  return shell('a', legend, body, model.entries);
}

function renderB(model) {
  const { placed } = model;
  const last = placed.length - 1;
  const rows = placed.map((entry, index) => {
    const x = (entry.span.start - model.scaleStart) / model.span;
    const w = (entry.span.end - entry.span.start) / model.span;
    const kindLabel = entry.kind === 'education' ? 'Education' : 'Experience';
    return `<li>
      <button type="button" ${hitAttrs(entry, index === last)}>
        <span class="tl-index-copy">
          <span class="tl-kicker">${esc(kindLabel)}</span>
          <span class="tl-index-title">${esc(entry.title)}</span>
          <span class="tl-index-org">${esc(entry.org)}</span>
        </span>
        <span class="tl-index-dates">${esc(entry.dates)}</span>
        <span class="tl-index-rule" aria-hidden="true">
          <span class="tl-index-mark" style="left:${pct(x)};width:${pct(w)}"></span>
        </span>
      </button>
    </li>`;
  }).join('\n');
  const body = `<div class="tl-body" id="career-gantt-chart">
        <div class="tl-scale" aria-hidden="true">
          <div class="tl-axis">${axisHtml(model.labels)}</div>
        </div>
        <ol class="tl-index">${rows}</ol>
      </div>`;
  return shell('b', '', body, model.entries);
}

function renderC(model) {
  const { placed } = model;
  const last = placed[placed.length - 1];
  const ticks = placed.map((entry, index) => {
    const x = (entry.span.start - model.scaleStart) / model.span;
    return `<button type="button" ${hitAttrs(entry, index === placed.length - 1)} style="--x:${pct(x)}">
      <span class="tl-c-tick"></span>
    </button>`;
  }).join('\n');
  const kindLabel = last.kind === 'education' ? 'Education' : 'Experience';
  const body = `<div class="tl-body tl-scrub" id="career-gantt-chart" data-scale-start="${model.scaleStart}" data-scale-end="${model.scaleEnd}">
        <div class="tl-scrub-sticky">
          <div class="tl-c-top">
            <div class="tl-c-copy">
              <p class="tl-kicker" data-tl-kind>${esc(kindLabel)}</p>
              <p class="tl-c-title" data-tl-title>${esc(last.title)}</p>
              <p class="tl-readout-meta" data-tl-meta>${esc(last.org)} · ${esc(last.dates)}</p>
            </div>
            <div class="year-ticker" aria-hidden="true">
              <span class="year-big" data-tl-year>${Math.floor((model.scaleEnd - 1) / 12)}</span>
              <span class="year-lbl">year</span>
            </div>
          </div>
          <div class="tl-c-track">
            <span class="tl-c-fill" data-tl-fill style="--p:100%"></span>
            <span class="tl-c-head" data-tl-head style="--p:100%"></span>
            ${ticks}
          </div>
          <div class="tl-axis" aria-hidden="true">${axisHtml(model.labels)}</div>
        </div>
      </div>`;
  return shell('c', '', body, model.entries);
}

export function renderCareerTimeline(timeline, variant = DEFAULT_TIMELINE_VARIANT) {
  const model = prepare(timeline);
  if (variant === 'a') return renderA(model);
  if (variant === 'c') return renderC(model);
  return renderB(model);
}

if (typeof document !== 'undefined') {
  const boot = () => {
    const root = document.getElementById('career-gantt');
    if (!root || typeof TIMELINE === 'undefined') return;
    const requested = new URLSearchParams(location.search).get('timeline');
    const variant = requested === 'a' || requested === 'b' || requested === 'c'
      ? requested
      : DEFAULT_TIMELINE_VARIANT;
    if (root.dataset.variant !== variant) {
      root.outerHTML = renderCareerTimeline(TIMELINE, variant);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
