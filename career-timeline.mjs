// Square-rule career timeline. Rendered into index.html by build-static.

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

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
  return `class="tl-hit${active ? ' is-active' : ''} is-${entry.kind}" data-kind="${esc(kindLabel)}" data-title="${esc(entry.title)}" data-org="${esc(entry.org)}" data-dates="${esc(entry.dates)}" aria-label="${esc(accessible)}" title="${esc(accessible)}"`;
}

const CHEVRON = '<svg class="tl-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6 -6l6 6"/></svg>';

function shell(legend, body, entries) {
  return `<section class="career-gantt" id="career-gantt" aria-labelledby="career-gantt-heading">
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
  return shell(legend, body, model.entries);
}

export function renderCareerTimeline(timeline) {
  return renderA(prepare(timeline));
}
