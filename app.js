// Locked config (defaults from TWEAK_DEFAULTS)
const CONFIG = {
  perStopVh: 150,       // 'snap' scroll feel — bumped from 100 for less rushed pacing
  pinZoomTight: 9.0,    // 'block' level
};

// ===== SMALL UTILS =====
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = t => t * t * (3 - 2 * t);

// ===== MAP HELPERS =====
const MAP = (function(){
  const W = 1000, H = 620;
  const LNG_MIN = -125.0, LNG_MAX = -66.5, LAT_MIN = 24.0, LAT_MAX = 49.5;
  const MID_LAT = (LAT_MIN + LAT_MAX) / 2;
  const COS_MID = Math.cos(MID_LAT * Math.PI / 180);

  function project([lng, lat]) {
    const x0 = (lng - LNG_MIN) * COS_MID;
    const x1 = (LNG_MAX - LNG_MIN) * COS_MID;
    const x = (x0 / x1) * W;
    const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * H;
    return [x, y];
  }

  function polyToPath(coords) {
    let d = '';
    for (const ring of coords) {
      for (let i = 0; i < ring.length; i++) {
        const [x, y] = project(ring[i]);
        d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
      }
      d += 'Z ';
    }
    return d;
  }

  function buildStatesSvg(geojson) {
    const paths = [];
    for (const f of geojson.features) {
      const name = f.properties && f.properties.name ? f.properties.name : '';
      if (/alaska|hawaii|puerto/i.test(name)) continue;
      const g = f.geometry;
      let d = '';
      if (g.type === 'Polygon') d = polyToPath(g.coordinates);
      else if (g.type === 'MultiPolygon') for (const p of g.coordinates) d += polyToPath(p);
      paths.push({ id: f.id, name, d });
    }
    return { paths, width: W, height: H };
  }

  function viewBoxFor(point, zoom, offsetFrac) {
    const vw = W / zoom, vh = H / zoom;
    const [ox, oy] = offsetFrac || [0, 0];
    return { x: point[0] - vw * (0.5 + ox), y: point[1] - vh * (0.5 + oy), w: vw, h: vh };
  }

  function viewBoxForBounds(pA, pB, padding) {
    padding = padding == null ? 120 : padding;
    const minX = Math.min(pA[0], pB[0]) - padding;
    const maxX = Math.max(pA[0], pB[0]) + padding;
    const minY = Math.min(pA[1], pB[1]) - padding;
    const maxY = Math.max(pA[1], pB[1]) + padding;
    let w = maxX - minX, h = maxY - minY;
    const aspect = W / H;
    if (w / h > aspect) {
      const nh = w / aspect;
      const pad = (nh - h) / 2;
      return { x: minX, y: minY - pad, w: w, h: nh };
    } else {
      const nw = h * aspect;
      const pad = (nw - w) / 2;
      return { x: minX - pad, y: minY, w: nw, h: h };
    }
  }

  function arcControl(a, b, curvature) {
    curvature = curvature == null ? 0.35 : curvature;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const dist = Math.hypot(dx, dy);
    const nx = -dy / (dist || 1), ny = dx / (dist || 1);
    const lift = dist * curvature;
    let mx = (a[0] + b[0]) / 2 + nx * lift;
    let my = (a[1] + b[1]) / 2 + ny * lift;
    if (my > (a[1] + b[1]) / 2) {
      mx = (a[0] + b[0]) / 2 - nx * lift;
      my = (a[1] + b[1]) / 2 - ny * lift;
    }
    return [mx, my];
  }

  function arcPath(a, b, curvature) {
    const c = arcControl(a, b, curvature);
    return `M ${a[0].toFixed(2)},${a[1].toFixed(2)} Q ${c[0].toFixed(2)},${c[1].toFixed(2)} ${b[0].toFixed(2)},${b[1].toFixed(2)}`;
  }

  // De Casteljau subdivision of a quadratic bezier from parameter 0 to t.
  // Returns the SVG path string for the sub-curve and the endpoint coord.
  function bezierSubPath(a, c, b, t) {
    const p01x = a[0] + (c[0] - a[0]) * t;
    const p01y = a[1] + (c[1] - a[1]) * t;
    const p12x = c[0] + (b[0] - c[0]) * t;
    const p12y = c[1] + (b[1] - c[1]) * t;
    const endX = p01x + (p12x - p01x) * t;
    const endY = p01y + (p12y - p01y) * t;
    return {
      d: `M ${a[0].toFixed(2)},${a[1].toFixed(2)} Q ${p01x.toFixed(2)},${p01y.toFixed(2)} ${endX.toFixed(2)},${endY.toFixed(2)}`,
      endX, endY,
    };
  }

  return { project, buildStatesSvg, viewBoxFor, viewBoxForBounds, arcPath, arcControl, bezierSubPath, W, H };
})();

// ===== STATIC HEAD/SUMMARY/SKILLS/CONTACT RENDERING =====
function renderStatic() {
  const m = RESUME_META;

  document.getElementById('hero-title-line').textContent = m.titleLine;

  const heroMeta = document.getElementById('hero-meta');
  heroMeta.innerHTML = `
    <div>
      <div class="meta-label">Based in</div>
      <div class="meta-val">${m.location}</div>
    </div>
    <div>
      <div class="meta-label">Contact</div>
      <div class="meta-val"><a href="mailto:${m.email}">${m.email}</a></div>
    </div>
    <div>
      <div class="meta-label">Profile</div>
      <div class="meta-val"><a href="https://${m.linkedin}" target="_blank" rel="noopener">${m.linkedin}</a></div>
      <div class="meta-val"><a href="https://${m.github}" target="_blank" rel="noopener">${m.github}</a></div>
      <div class="meta-val"><a href="https://${m.x}" target="_blank" rel="noopener">${m.x}</a></div>
    </div>
    <div>
      <div class="meta-label">Languages</div>
      <div class="meta-val">${m.languages.map(l => l.name).join(' · ')}</div>
    </div>
  `;

  document.getElementById('summary-text').textContent = m.summary;

  const compGrid = document.getElementById('comp-grid');
  compGrid.innerHTML = m.competencies.map((c, i) => `
    <li>
      <span class="comp-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="comp-text">${c}</span>
    </li>
  `).join('');

  const skillsGrid = document.getElementById('skills-grid');
  skillsGrid.innerHTML = Object.entries(m.skills).map(([k, v]) => `
    <div class="skill-block">
      <div class="skill-head">${k}</div>
      <div class="skill-body">${v}</div>
    </div>
  `).join('');

  document.getElementById('highlights-list').innerHTML = (m.highlights || []).map(h => `
    <div class="highlight">
      <div class="highlight-main">
        <div class="highlight-title">${h.title}</div>
        <div class="highlight-body">${h.body}</div>
      </div>
      <div class="highlight-year">${h.year}</div>
    </div>
  `).join('');

  document.getElementById('projects-list').innerHTML = (m.projects || []).map(p => `
    <div class="project">
      <div class="project-main">
        <div class="project-title">${p.link ? `<a href="${p.link}" target="_blank" rel="noopener">${p.title}</a>` : p.title}</div>
        <div class="project-role">${p.role} · ${p.domain}</div>
        <div class="project-body">${p.tagline}</div>
        <ul class="project-bullets">${(p.bullets || []).map(b => `<li>${b}</li>`).join('')}</ul>
        ${(p.tags || []).length ? `<div class="project-tags">${p.tags.map(t => `<span class="project-tag">${t}</span>`).join('')}</div>` : ''}
      </div>
      <div class="project-year">${p.year}</div>
    </div>
  `).join('');

  document.getElementById('certs-list').innerHTML = (m.certifications || []).map(c => `
    <div class="cert">
      <div class="cert-main">
        <div class="cert-title">${c.link ? `<a href="${c.link}" target="_blank" rel="noopener">${c.title}</a>` : c.title}</div>
        <div class="cert-org">${c.org}</div>
      </div>
      <div class="cert-year">${c.year}</div>
    </div>
  `).join('');

  document.getElementById('langs').innerHTML = m.languages.map(l => `
    <div class="lang">
      <div class="lang-name">${l.name}</div>
      <div class="lang-level">${l.level}</div>
    </div>
  `).join('');

  const ti = (label, paths) => `
    <span class="k">
      <svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>
      <span class="visually-hidden">${label}</span>
    </span>`;
  document.getElementById('contact-big').innerHTML = `
    <div class="contact-line">
      ${ti('Email', '<path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10" /><path d="M3 7l9 6l9 -6" />')}
      <a class="v" href="mailto:${m.email}">${m.email}</a>
    </div>
    <div class="contact-line">
      ${ti('LinkedIn', '<path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" /><path d="M8 11l0 5" /><path d="M8 8l0 .01" /><path d="M12 16l0 -5" /><path d="M16 16v-3a2 2 0 0 0 -4 0" />')}
      <a class="v" href="https://${m.linkedin}" target="_blank" rel="noopener">${m.linkedin}</a>
    </div>
    <div class="contact-line">
      ${ti('GitHub', '<path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5" />')}
      <a class="v" href="https://${m.github}" target="_blank" rel="noopener">${m.github}</a>
    </div>
    <div class="contact-line">
      ${ti('X', '<path d="M4 4l11.733 16h4.267l-11.733 -16z" /><path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />')}
      <a class="v" href="https://${m.x}" target="_blank" rel="noopener">${m.x}</a>
    </div>
    <div class="contact-line">
      ${ti('Location', '<path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" />')}
      <span class="v">${m.location}</span>
    </div>
  `;
}

// ===== EXPERIENCE MAP RENDERING =====
const SVG_NS = 'http://www.w3.org/2000/svg';

const state = {
  built: null,        // output of buildStatesSvg
  activeIdx: -1,      // last rendered active index
  cardIdx: -1,        // last idx for which card content was rendered
  promoShown: -1,     // promotion role currently seated in the card
  pCurProj: null,
  pNextProj: null,
  arcD: null,
  invisArcPath: null, // hidden path for getPointAtLength
  tooltipEls: [],
  pinEls: [],
  railStopEls: [],
  roleOverflow: null, // mobile bullet overflow in px, per stop, per role
};

function computeAllPinsViewBox() {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const item of TIMELINE) {
    const [x, y] = MAP.project(item.coord);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const padding = 90;
  minX -= padding; maxX += padding; minY -= padding; maxY += padding;
  const w = maxX - minX, h = maxY - minY;
  const aspect = MAP.W / MAP.H;
  if (w / h > aspect) {
    const nh = w / aspect;
    const pad = (nh - h) / 2;
    return { x: minX, y: minY - pad, w: w, h: nh };
  }
  const nw = h * aspect;
  const pad = (nw - w) / 2;
  return { x: minX - pad, y: minY, w: nw, h: h };
}

function buildMap() {
  state.built = MAP.buildStatesSvg(US_STATES_GEOJSON);
  state.vbAllPins = computeAllPinsViewBox();

  const statesG = document.getElementById('states-g');
  const frag = document.createDocumentFragment();
  for (const s of state.built.paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', s.d);
    frag.appendChild(p);
  }
  statesG.appendChild(frag);

  if (COUNTIES_GEOJSON) {
    const countiesG = document.getElementById('counties-g');
    const countyBuilt = MAP.buildStatesSvg(COUNTIES_GEOJSON);
    const cFrag = document.createDocumentFragment();
    for (const c of countyBuilt.paths) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', c.d);
      cFrag.appendChild(p);
    }
    countiesG.appendChild(cFrag);
  }

  // Build pin groups (one per timeline item, initially hidden via display)
  const pinsG = document.getElementById('pins-g');
  state.pinEls = TIMELINE.map(() => {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'pin');
    g.style.display = 'none';
    // pulse (only shown when current)
    const pulse = document.createElementNS(SVG_NS, 'circle');
    pulse.setAttribute('class', 'pin-pulse');
    pulse.style.display = 'none';
    g.appendChild(pulse);
    const halo = document.createElementNS(SVG_NS, 'circle');
    halo.setAttribute('class', 'pin-halo');
    g.appendChild(halo);
    const core = document.createElementNS(SVG_NS, 'circle');
    core.setAttribute('class', 'pin-core');
    g.appendChild(core);
    pinsG.appendChild(g);
    return { g, pulse, halo, core };
  });

  // Trail arc path elements — one per possible transition (items-1)
  const trailG = document.getElementById('arcs-trail');
  state.trailEls = [];
  for (let i = 0; i < TIMELINE.length - 1; i++) {
    const a = MAP.project(TIMELINE[i].coord);
    const b = MAP.project(TIMELINE[i + 1].coord);
    if (a[0] === b[0] && a[1] === b[1]) {
      state.trailEls.push(null);
      continue;
    }
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', MAP.arcPath(a, b));
    p.setAttribute('class', 'arc');
    p.style.opacity = '0';
    trailG.appendChild(p);
    state.trailEls.push(p);
  }

  // Traveling dot — path (for length), core circle, halo circle
  const travelG = document.getElementById('travel-g');
  state.travelPath = document.createElementNS(SVG_NS, 'path');
  state.travelPath.setAttribute('fill', 'none');
  state.travelPath.setAttribute('stroke', 'none');
  travelG.appendChild(state.travelPath);
  state.travelHalo = document.createElementNS(SVG_NS, 'circle');
  state.travelHalo.setAttribute('class', 'travel-halo');
  state.travelHalo.style.display = 'none';
  travelG.appendChild(state.travelHalo);
  state.travelDot = document.createElementNS(SVG_NS, 'circle');
  state.travelDot.setAttribute('class', 'travel-dot');
  state.travelDot.style.display = 'none';
  travelG.appendChild(state.travelDot);

  // Tooltips (HTML)
  const tooltipsLayer = document.getElementById('pin-tooltips');
  state.tooltipEls = TIMELINE.map((it) => {
    const div = document.createElement('div');
    div.className = 'pin-tt';
    const city = it.city.split(' (')[0];
    const years = it.startYear + (it.endYear !== it.startYear
      ? `–${it.endYear === 2026 ? "'26+" : String(it.endYear).slice(2)}`
      : '');
    div.innerHTML = `
      <div class="pin-tt-inner">
        <div class="pin-tt-city">${city}</div>
        <div class="pin-tt-org">${it.org}</div>
        <div class="pin-tt-years">${years}</div>
      </div>
    `;
    div.style.display = 'none';
    tooltipsLayer.appendChild(div);
    return div;
  });

  // Rail stops. A promotion expands into one mark per role year so the
  // line passes 2023, 2024, and 2025. If the last title is still current,
  // a final mark carries the timeline on to the present year.
  const railStops = document.getElementById('rail-stops');
  state.railEntries = [];
  state.railStopEls = [];
  TIMELINE.forEach((it, timelineIdx) => {
    const roles = it.promotions && it.promotions.length ? it.promotions : [null];
    const addStop = (year, entry) => {
      const div = document.createElement('div');
      div.className = 'rail-stop';
      div.innerHTML = `
        <div class="rail-dot"></div>
        <div class="rail-year">${formatYearLabel(year)}</div>
        <div class="rail-org">${it.railLabel || it.org.split(' ')[0]}</div>
      `;
      railStops.appendChild(div);
      state.railStopEls.push(div);
      state.railEntries.push(entry);
    };
    roles.forEach((role, roleIdx) => {
      addStop(role ? role.year : it.startYear, {
        timelineIdx,
        roleIdx: role ? roleIdx : 0,
        trailing: false,
      });
    });
    const cont = continuationYear(it);
    if (cont != null) {
      addStop(cont, { timelineIdx, roleIdx: roles.length - 1, trailing: true });
    }
  });
}

// Choose which side of the pin the tooltip should sit on so it doesn't
// block other visible pins or the arc. Weighted by 1/d² so close pins push
// the tooltip away harder than distant ones. Stacked pins (same coord) are
// skipped since they can't block each other.
function pickTooltipSide(i, activeIdx) {
  const [cx, cy] = MAP.project(TIMELINE[i].coord);
  let dx = 0, dy = 0;
  for (let j = 0; j <= activeIdx; j++) {
    if (j === i) continue;
    const [px, py] = MAP.project(TIMELINE[j].coord);
    const vx = cx - px, vy = cy - py;
    const d2 = vx * vx + vy * vy;
    if (d2 < 1) continue;
    dx += vx / d2;
    dy += vy / d2;
  }
  // On mobile the SVG is letterboxed inside a tall viewport, and the
  // left/right tooltip variants clip at the narrow edges. Restrict to
  // vertical sides, away from the cluster of other pins. Default 'up'
  // (matching desktop) when there are no neighbors to push the tooltip
  // away from — keeps the first stop's callout from sitting on the pin.
  const mobile = matchMedia('(max-width: 800px)').matches;
  if (mobile) {
    if (dy === 0) return 'up';
    return dy > 0 ? 'down' : 'up';
  }
  if (dx === 0 && dy === 0) return 'up';
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

function overlapArea(a, b, pad) {
  pad = pad || 0;
  const w = Math.min(a.right, b.right + pad) - Math.max(a.left, b.left - pad);
  const h = Math.min(a.bottom, b.bottom + pad) - Math.max(a.top, b.top - pad);
  if (w <= 0 || h <= 0) return 0;
  return w * h;
}

// The portrait is fixed at the top center. On a phone every pin is framed
// in that same band, so a callout opened above the pin lands on the face.
// Keep the preferred side when it is clear. Otherwise try the other side of
// the pin, then slide the callout just past the portrait. Off-screen and
// card collisions lose to a readable callout.
// The portrait plus the wreath, when that frame is showing. Callouts
// should clear the greenery, not only the 72px circle underneath it.
function portraitBox() {
  const logo = document.querySelector('.floating-logo');
  if (!logo) return null;
  const box = logo.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return null;
  const wreath = logo.querySelector('.logo-wreath');
  if (!wreath) return box;
  const cs = getComputedStyle(wreath);
  if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return box;
  const wr = wreath.getBoundingClientRect();
  if (wr.width < 1 || wr.height < 1) return box;
  const left = Math.min(box.left, wr.left);
  const top = Math.min(box.top, wr.top);
  const right = Math.max(box.right, wr.right);
  const bottom = Math.max(box.bottom, wr.bottom);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function placeTooltip(tt, preferred, cardOpacity) {
  const logoBox = portraitBox();
  const hasLogo = logoBox && logoBox.width > 1 && logoBox.height > 1;
  const card = document.getElementById('exp-card');
  let cardBox = null;
  if (card && cardOpacity > 0.15) {
    const r = card.getBoundingClientRect();
    if (r.width > 1 && r.height > 1) cardBox = r;
  }
  const flip = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const sides = [preferred, flip[preferred] || 'down'];

  const apply = (side, nudge) => {
    tt.dataset.side = side;
    tt.style.setProperty('--tt-nudge-y', nudge + 'px');
    return tt.getBoundingClientRect();
  };
  const scoreOf = (box) => {
    let score = 0;
    // Covering the portrait is the failure the phone hits on every pin.
    // A deep overlap outranks a few pixels of the role card.
    if (hasLogo) score += overlapArea(box, logoBox, 8) * 4;
    if (cardBox) score += overlapArea(box, cardBox, 0) * 0.2;
    if (box.top < 8) score += 8000 + (8 - box.top) * 20;
    if (box.bottom > window.innerHeight - 8) score += 8000 + (box.bottom - (window.innerHeight - 8)) * 20;
    if (box.left < 4) score += Math.min(2000, (4 - box.left) * 8);
    if (box.right > window.innerWidth - 4) score += Math.min(2000, (box.right - (window.innerWidth - 4)) * 8);
    return score;
  };

  let best = null;
  const consider = (side, nudge, box) => {
    const score = scoreOf(box) + Math.abs(nudge) * 0.02;
    if (!best || score < best.score) best = { side, nudge, score };
  };
  for (const side of sides) {
    const base = apply(side, 0);
    consider(side, 0, base);
    if (!(hasLogo && overlapArea(base, logoBox, 6) > 0)) continue;
    const pushDown = Math.ceil(logoBox.bottom + 10 - base.top);
    const pushUp = Math.ceil(base.bottom - (logoBox.top - 10));
    consider(side, pushDown, apply(side, pushDown));
    consider(side, -pushUp, apply(side, -pushUp));
  }
  tt.dataset.side = best.side;
  tt.style.setProperty('--tt-nudge-y', best.nudge + 'px');
}

// The last promotion year can be earlier than the job's end year. GEMMACON's
// Director title starts in 2025 while the role runs through the present, so
// that title keeps the 2025 beat and the present year gets a beat of its own.
function continuationYear(item) {
  const roles = item.promotions;
  if (!roles || !roles.length) return null;
  const last = roles[roles.length - 1].year;
  return item.endYear > last ? item.endYear : null;
}

function formatYearLabel(year) {
  return year === 2026 ? '2026+' : String(year);
}

function stopUnits(item) {
  const roles = (item.promotions && item.promotions.length) || 1;
  return roles + (continuationYear(item) ? 1 : 0);
}

// How long a fully shown card sits before the scroll transition starts.
// Promotion fades and city-to-city departures share this.
const CARD_HOLD = 0.68;
// Card fade-in. The first role's bullets stay put until this point.
const CARD_IN_END = 0.15;
const MOBILE_TIMELINE = '(max-width: 800px)';

function isMobileTimeline() {
  return matchMedia(MOBILE_TIMELINE).matches;
}

// Scroll distance of one weight-1 stop, matching the desktop 150vh rhythm
// after the sticky viewport is subtracted.
function baseUnitScrollPx() {
  const units = TIMELINE.reduce((sum, item) => sum + stopUnits(item), 0);
  return ((CONFIG.perStopVh / 100) - (1 / units)) * window.innerHeight;
}

// Per-role weights. Desktop and short mobile roles stay at 1. A mobile role
// whose bullets are taller than the hold is stretched so that hold is at
// least as long as the overflow and the text tracks the finger.
function segmentWeights(item) {
  const units = stopUnits(item);
  const even = () => Array(units).fill(1);
  if (!isMobileTimeline() || !state.roleOverflow) return even();
  const idx = TIMELINE.indexOf(item);
  const overflows = state.roleOverflow[idx];
  if (!overflows) return even();
  const base = baseUnitScrollPx();
  if (base <= 0) return even();
  return overflows.map((overflow, i) => {
    if (overflow <= 0) return 1;
    const holdFraction = CARD_HOLD - (i === 0 ? CARD_IN_END : 0);
    return Math.max(1, overflow / holdFraction / base);
  });
}

function locateStop(p) {
  const n = TIMELINE.length;
  const sums = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const u = segmentWeights(TIMELINE[i]).reduce((a, b) => a + b, 0);
    sums.push(u);
    total += u;
  }
  const pos = p * total;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const u = sums[i];
    if (pos < acc + u || i === n - 1) {
      return { activeIdx: i, subProg: clamp(u > 0 ? (pos - acc) / u : 0, 0, 1) };
    }
    acc += u;
  }
  return { activeIdx: n - 1, subProg: 1 };
}

// A promotion stop spends subProg across every role. Each role holds, then
// crossfades into the next. The last role holds so the card can leave with
// the map instead of fading into another title. Equal weights reproduce the
// old even split.
function promoPhase(item, subProg) {
  const roles = item.promotions;
  if (!roles || roles.length < 2) return null;
  const count = roles.length;
  const weights = segmentWeights(item);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const roleWeight = weights.slice(0, count).reduce((a, b) => a + b, 0);
  const roleSpan = roleWeight / total;
  if (subProg >= roleSpan - 1e-9 && continuationYear(item) != null) {
    const trailSpan = (weights[count] || 0) / total;
    const trailT = trailSpan > 0 ? clamp((subProg - roleSpan) / trailSpan, 0, 1) : 1;
    return { idx: count - 1, local: 1, out: 0, in: 0, count, trailing: true, trailT };
  }
  let acc = 0;
  let idx = 0;
  let local = 0;
  for (let i = 0; i < count; i++) {
    const span = weights[i] / total;
    if (subProg < acc + span || i === count - 1) {
      idx = i;
      local = span > 0 ? clamp((subProg - acc) / span, 0, 1) : 0;
      break;
    }
    acc += span;
  }
  const fadeStart = CARD_HOLD;
  let out = 0;
  let inn = 0;
  if (idx < count - 1 && local > fadeStart) {
    const t = (local - fadeStart) / (1 - fadeStart);
    if (t < 0.5) out = smoothstep(t / 0.5);
    else {
      out = 1;
      inn = smoothstep((t - 0.5) / 0.5);
    }
  }
  return { idx, local, out, in: inn, count, trailing: false, trailT: 0 };
}

// City-to-city motion used to begin at 0.35. Park on that origin until
// CARD_HOLD, then play the same phases across the time that remains.
function afterHold(subProg) {
  if (subProg <= CARD_HOLD) return 0.35;
  const t = (subProg - CARD_HOLD) / (1 - CARD_HOLD);
  return 0.35 + t * 0.65;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Site bullets may include [label](https://...) links. Escape first, then
// turn only http(s) markdown links into anchors. Anything else stays text.
function renderBulletHtml(text) {
  return escapeHtml(text).replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, label, url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
  );
}

function bulletList(bullets) {
  return bullets.map(b => `
    <li>
      <span class="bullet-mark">—</span>
      <span>${renderBulletHtml(b)}</span>
    </li>
  `).join('');
}

function renderCard(item) {
  const el = document.getElementById('card-inner');
  const logo = item.logo
    ? `<img class="card-logo${item.wordmark ? ' is-wordmark' : ''}${item.tall ? ' is-tall' : ''}${item.compact ? ' is-compact' : ''}" src="${item.logo}" alt="">`
    : '';
  const kind = item.type === 'education' ? 'Education' : 'Experience';
  state.promoShown = -1;
  if (item.promotions && item.promotions.length) {
    el.innerHTML = `
      <div class="card-head">
        <div class="card-kind">${kind}</div>
        <div class="card-dates-stack">
          ${item.promotions.map(role => `<div class="card-dates">${role.dates}</div>`).join('')}
        </div>
      </div>
      ${logo}
      <div class="card-promo card-promo-titles">
        ${item.promotions.map(role => `<h2 class="card-title card-role">${role.title}</h2>`).join('')}
      </div>
      <div class="card-org">
        <span class="card-org-name">${item.org}</span>
        <span class="card-sep">·</span>
        <span class="card-city">${item.city}</span>
      </div>
      <div class="card-promo card-promo-bodies">
        ${item.promotions.map(role => `<ul class="card-bullets card-role">${bulletList(role.bullets)}</ul>`).join('')}
      </div>
    `;
    return;
  }
  el.innerHTML = `
    <div class="card-head">
      <div class="card-kind">${kind}</div>
      <div class="card-dates">${item.dates}</div>
    </div>
    ${logo}
    <h2 class="card-title">${item.title}</h2>
    <div class="card-org">
      <span class="card-org-name">${item.org}</span>
      <span class="card-sep">·</span>
      <span class="card-city">${item.city}</span>
    </div>
    <div class="card-bullet-window">
      <ul class="card-bullets">
        ${bulletList(item.bullets)}
      </ul>
    </div>
  `;
}

function applyPromo(cardEl, phase) {
  const titles = [...cardEl.querySelectorAll('.card-promo-titles .card-role')];
  const bodies = [...cardEl.querySelectorAll('.card-promo-bodies .card-role')];
  const dates = [...cardEl.querySelectorAll('.card-dates-stack .card-dates')];
  if (!titles.length || !phase) return;
  const shown = phase.in > 0 ? Math.min(phase.count - 1, phase.idx + 1) : phase.idx;
  const opacities = titles.map((_, i) => (
    i === phase.idx ? 1 - phase.out : (i === phase.idx + 1 ? phase.in : 0)
  ));
  // Later roles are painted on top. A fully faded role still sits in that
  // stack, so only the role you're actually reading can take a click.
  let top = 0;
  opacities.forEach((o, i) => { if (o >= opacities[top]) top = i; });
  titles.forEach((el, i) => {
    const o = opacities[i];
    const receive = i === top && o > 0;
    el.style.opacity = String(o);
    el.style.pointerEvents = receive ? 'auto' : 'none';
    el.toggleAttribute('aria-hidden', o < 0.5);
    if (bodies[i]) {
      bodies[i].style.opacity = String(o);
      bodies[i].style.pointerEvents = receive ? 'auto' : 'none';
      bodies[i].toggleAttribute('aria-hidden', o < 0.5);
    }
    if (dates[i]) {
      dates[i].style.opacity = String(o);
      dates[i].style.pointerEvents = receive ? 'auto' : 'none';
      dates[i].toggleAttribute('aria-hidden', o < 0.5);
    }
  });
  const fit = (box, els) => {
    if (!box || !els[phase.idx]) return;
    const h0 = els[phase.idx].offsetHeight;
    const h1 = phase.in > 0 && els[phase.idx + 1] ? els[phase.idx + 1].offsetHeight : h0;
    box.style.height = (phase.in > 0 ? lerp(h0, h1, phase.in) : h0) + 'px';
  };
  fit(cardEl.querySelector('.card-promo-titles'), titles);
  fit(cardEl.querySelector('.card-promo-bodies'), bodies);
  if (shown !== state.promoShown) {
    state.promoShown = shown;
    cardEl.scrollTop = 0;
  }
}

// On a phone, page progress slides the active bullet list through the card.
// The title stays put. Shift is 0 until the card is readable, and the last
// line is in view when the hold ends and the map is allowed to leave.
function applyBulletShift(cardEl, item, subProg, phase) {
  const lists = [...cardEl.querySelectorAll('.card-bullets')];
  if (!isMobileTimeline()) {
    lists.forEach(el => { el.style.transform = ''; });
    return;
  }
  if (cardEl.scrollTop) cardEl.scrollTop = 0;
  const idx = TIMELINE.indexOf(item);
  const overflows = (state.roleOverflow && state.roleOverflow[idx]) || [];
  lists.forEach((el, i) => {
    const overflow = overflows[i] || 0;
    const active = phase ? i === phase.idx : i === 0;
    const local = !active ? 0 : phase ? (phase.trailing ? 1 : phase.local) : subProg;
    const holdStart = i === 0 ? CARD_IN_END : 0;
    let shift = 0;
    if (active && overflow > 0) {
      const t = clamp((local - holdStart) / (CARD_HOLD - holdStart), 0, 1);
      shift = -overflow * t;
    }
    el.style.transform = shift ? `translateY(${Math.round(shift)}px)` : '';
  });
}

function updateScene() {
  const n = TIMELINE.length;
  const expSection = document.getElementById('experience');
  const rect = expSection.getBoundingClientRect();
  const vh = window.innerHeight;
  const total = expSection.offsetHeight - vh;
  const scrolled = clamp(-rect.top, 0, total);
  const p = total > 0 ? scrolled / total : 0;

  const located = locateStop(p);
  const activeIdx = located.activeIdx;
  const subProg = located.subProg;

  const currentItem = TIMELINE[activeIdx];
  const nextItem = TIMELINE[Math.min(n - 1, activeIdx + 1)];
  const phase = promoPhase(currentItem, subProg);
  const pCurProj = MAP.project(currentItem.coord);
  const pNextProj = MAP.project(nextItem.coord);

  // 3-phase zoom viewBox — per-stop zoom override, fall back to CONFIG.pinZoomTight
  // On mobile the map box ends above the card. A small upward bias keeps
  // the pin and its label clear of the year, and the tighter zoom spreads
  // clustered pins (the SoCal stops) apart.
  const mobileMap = matchMedia('(max-width: 800px)').matches;
  const zoomMult = mobileMap ? 2.75 : 1.0;
  const currentZoom = (currentItem.zoom || CONFIG.pinZoomTight) * zoomMult;
  const nextZoom = (nextItem.zoom || CONFIG.pinZoomTight) * zoomMult;
  const pinOffset = mobileMap ? [0, -0.12] : [0, 0];
  const vbCurTight = MAP.viewBoxFor(pCurProj, currentZoom, pinOffset);
  const vbNextTight = MAP.viewBoxFor(pNextProj, nextZoom, pinOffset);
  const sameCity = pCurProj[0] === pNextProj[0] && pCurProj[1] === pNextProj[1];
  const vbWide = sameCity ? vbCurTight : MAP.viewBoxForBounds(pCurProj, pNextProj, 80);

  function tweenVB(a, b, t) {
    const e = smoothstep(clamp(t, 0, 1));
    return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), w: lerp(a.w, b.w, e), h: lerp(a.h, b.h, e) };
  }

  const fly = (!phase && activeIdx < n - 1) ? afterHold(subProg) : subProg;
  let vb;
  if (activeIdx >= n - 1) {
    // Final stop: hold tight while the card is readable, then zoom out to an
    // overview that frames every pin. The present-year beat is what pulls back.
    const target = state.vbAllPins || vbCurTight;
    let exitT = 0;
    if (phase && phase.trailing) {
      const trail = phase.trailT;
      exitT = trail >= 0.85 ? 1 : trail >= 0.40 ? (trail - 0.40) / 0.45 : 0;
    } else if (phase) {
      // A present-year beat follows the last title, so this role stays tight
      // on 2025. Jobs with no later year still pull back on the last role.
      exitT = (!continuationYear(currentItem) && phase.idx === phase.count - 1)
        ? clamp((phase.local - 0.45) / 0.45, 0, 1)
        : 0;
    } else if (subProg >= 0.85) {
      exitT = 1;
    } else if (subProg >= 0.40) {
      exitT = (subProg - 0.40) / 0.45;
    }
    vb = tweenVB(vbCurTight, target, exitT);
  } else if (currentItem.smoothPan) {
    // Close-neighbor transition: hold briefly, then pan at constant zoom to the
    // next pin without a zoom-out/wide phase. Both pins should share the same zoom.
    vb = tweenVB(vbCurTight, vbNextTight, (fly - 0.35) / 0.65);
  } else if (fly < 0.35) {
    vb = vbCurTight;
  } else if (fly < 0.75) {
    vb = tweenVB(vbCurTight, vbWide, (fly - 0.35) / 0.20);
  } else {
    vb = tweenVB(vbWide, vbNextTight, (fly - 0.75) / 0.25);
  }

  const svg = document.getElementById('usmap');
  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

  // County lines fade in when viewBox is tight (zoomed well past state level)
  const countiesG = document.getElementById('counties-g');
  if (countiesG) {
    countiesG.style.opacity = String(smoothstep(clamp((80 - vb.w) / 40, 0, 1)));
  }

  // Year ticker — stays locked on currentItem.startYear while we're tight on
  // the pin (card visible), then lerps to the next value once motion starts,
  // so "landed on Hyundai" always reads 2013.
  let displayYear;
  const promoShown = phase
    ? (phase.in > 0.45 ? Math.min(phase.count - 1, phase.idx + 1) : phase.idx)
    : 0;
  if (phase) {
    const roleYear = currentItem.promotions[promoShown].year;
    // Director stays on 2025 for its own beat. The following beat is the
    // present year, so the ticker reaches 2026 after that promotion.
    displayYear = phase.trailing ? formatYearLabel(currentItem.endYear) : roleYear;
  } else if (activeIdx >= n - 1) {
    // Final stop: startYear → endYear across the zoom-out.
    const yearStart = 0.40;
    const t = subProg < yearStart ? 0 : (subProg - yearStart) / (1 - yearStart);
    displayYear = Math.floor(lerp(currentItem.startYear, currentItem.endYear, t));
  } else {
    const yearStart = 0.35;
    const y = afterHold(subProg);
    const t = y < yearStart ? 0 : (y - yearStart) / (1 - yearStart);
    displayYear = Math.floor(lerp(currentItem.startYear, nextItem.startYear, t));
  }
  document.getElementById('year-big').textContent = displayYear;

  // Active arc + traveling dot: the arc path literally grows as the dot moves.
  // Partial bezier via De Casteljau — the dot sits at the endpoint of the growing curve.
  const arcEl = document.getElementById('arc-active');
  const arcDrawT = smoothstep(clamp((fly - 0.40) / 0.35, 0, 1));

  if (!sameCity && arcDrawT > 0) {
    const ctrl = MAP.arcControl(pCurProj, pNextProj);
    const sub = MAP.bezierSubPath(pCurProj, ctrl, pNextProj, arcDrawT);
    arcEl.setAttribute('d', sub.d);
    arcEl.style.opacity = '1';

    const scale = vb.w / MAP.W;
    state.travelDot.style.display = '';
    state.travelHalo.style.display = '';
    state.travelDot.setAttribute('cx', sub.endX);
    state.travelDot.setAttribute('cy', sub.endY);
    state.travelDot.setAttribute('r', 3.5 * scale);
    state.travelHalo.setAttribute('cx', sub.endX);
    state.travelHalo.setAttribute('cy', sub.endY);
    state.travelHalo.setAttribute('r', 7 * scale);
    // Once the curve has fully landed on the next pin, hide the dot so the pin takes over.
    if (arcDrawT >= 1) {
      state.travelDot.style.display = 'none';
      state.travelHalo.style.display = 'none';
    }
  } else {
    arcEl.style.opacity = '0';
    state.travelDot.style.display = 'none';
    state.travelHalo.style.display = 'none';
  }

  // Trail arcs — show past transitions faintly
  for (let i = 0; i < state.trailEls.length; i++) {
    if (!state.trailEls[i]) continue;
    state.trailEls[i].style.opacity = i < activeIdx ? '0.32' : '0';
  }

  // Pins: once the arc has fully reached the next pin, show it even though
  // activeIdx hasn't flipped yet — otherwise there's a blank beat between
  // arc-arrived and pin-appears.
  const nextReached = arcDrawT >= 1 && activeIdx < n - 1;
  const scale = vb.w / MAP.W;
  for (let i = 0; i < TIMELINE.length; i++) {
    const el = state.pinEls[i];
    const visible = i <= activeIdx || (nextReached && i === activeIdx + 1);
    el.g.style.display = visible ? '' : 'none';
    if (!visible) continue;
    const [x, y] = MAP.project(TIMELINE[i].coord);
    el.g.setAttribute('transform', `translate(${x},${y})`);
    const isCurrent = i === activeIdx;
    const r = (isCurrent ? 7 : 4.5) * scale;
    el.core.setAttribute('r', r);
    el.halo.setAttribute('r', r * 1.6);
    if (isCurrent) {
      el.g.classList.add('pin-current');
      el.pulse.style.display = '';
      el.pulse.setAttribute('r', r * 2.8);
    } else {
      el.g.classList.remove('pin-current');
      el.pulse.style.display = 'none';
    }
  }

  // Card + active-tooltip opacity share the same scroll-driven envelope:
  // snappy fade-in, then a hold that matches the GEMMACON promotions,
  // then a fade-out as the map starts to leave.
  const cardInEnd = CARD_IN_END;
  const cardOutStart = phase ? 0.58 : CARD_HOLD;
  const cardOutEnd = phase ? 0.88 : CARD_HOLD + (1 - CARD_HOLD) * 0.5;
  const inLocal = phase ? (phase.idx === 0 ? phase.local : 1) : subProg;
  // The 2025 Director beat stays up. The card leaves on the 2026 beat.
  const outLocal = !phase
    ? subProg
    : phase.trailing
      ? phase.trailT
      : (phase.idx === phase.count - 1 && !continuationYear(currentItem) ? phase.local : 0);
  const cardInT = smoothstep(clamp(inLocal / cardInEnd, 0, 1));
  const cardOutT = outLocal > cardOutStart
    ? smoothstep(clamp((outLocal - cardOutStart) / (cardOutEnd - cardOutStart), 0, 1))
    : 0;
  const cardOpacity = cardInT * (1 - cardOutT);

  // Tooltips — only for visible pins. Position in pixels via the SVG's
  // screen CTM so they land on the pin even when preserveAspectRatio
  // letterboxes the SVG inside a tall mobile container.
  const tooltipsLayer = document.getElementById('pin-tooltips');
  const ctm = svg.getScreenCTM();
  const layerRect = tooltipsLayer.getBoundingClientRect();
  const svgPt = svg.createSVGPoint();
  const mobileTooltip = matchMedia('(max-width: 800px)').matches;
  for (let i = 0; i < TIMELINE.length; i++) {
    const tt = state.tooltipEls[i];
    const visibleTt = mobileTooltip
      ? i === activeIdx
      : i <= activeIdx || (nextReached && i === activeIdx + 1);
    if (!visibleTt) { tt.style.display = 'none'; continue; }
    const [px, py] = MAP.project(TIMELINE[i].coord);
    // Check off-viewBox cull using normalized coords (cheap)
    const xPct = ((px - vb.x) / vb.w) * 100;
    const yPct = ((py - vb.y) / vb.h) * 100;
    if (xPct < -5 || xPct > 105 || yPct < -5 || yPct > 105) {
      tt.style.display = 'none';
      continue;
    }
    svgPt.x = px; svgPt.y = py;
    const screen = ctm ? svgPt.matrixTransform(ctm) : { x: 0, y: 0 };
    tt.style.display = '';
    tt.style.left = (screen.x - layerRect.left) + 'px';
    tt.style.top = (screen.y - layerRect.top) + 'px';
    // Phones keep the label above the pin, clear of the card. placeTooltip
    // moves it when that spot is the portrait.
    const preferredSide = mobileTooltip ? 'up' : pickTooltipSide(i, activeIdx);
    placeTooltip(tt, preferredSide, cardOpacity);
    if (mobileTooltip && i === activeIdx) {
      const cardTop = document.getElementById('exp-card').getBoundingClientRect().top;
      const box = tt.getBoundingClientRect();
      const overlap = box.bottom - (cardTop - 12);
      if (overlap > 0) {
        const logo = portraitBox();
        const liftedTop = box.top - overlap;
        const hitsLogo = logo && liftedTop < logo.bottom + 8 &&
          box.right > logo.left && box.left < logo.right &&
          (box.bottom - overlap) > logo.top;
        if (!hitsLogo) {
          const current = parseFloat(tt.style.getPropertyValue('--tt-nudge-y')) || 0;
          tt.style.setProperty('--tt-nudge-y', (current - overlap) + 'px');
        }
      }
    }
    tt.classList.toggle('is-current', i === activeIdx);
    // Active tooltip rides the same fade envelope as the card. Disable the
    // CSS transition so per-frame scroll updates don't trail behind.
    if (i === activeIdx) {
      tt.style.transition = 'none';
      tt.style.opacity = String(cardOpacity);
    } else {
      tt.style.transition = '';
      tt.style.opacity = '';
    }
  }

  // Card: swap content when activeIdx changes; always update bullet reveal + opacity
  const cardEl = document.getElementById('exp-card');

  // Track raw scroll direction so we can land the card scroll position at the
  // correct end (top when entering forward, bottom when entering backward).
  const scrollY = window.scrollY;
  if (state.lastScrollY != null) {
    if (scrollY > state.lastScrollY) state.scrollDir = 1;
    else if (scrollY < state.lastScrollY) state.scrollDir = -1;
  }
  state.lastScrollY = scrollY;
  const dir = state.scrollDir || 1;
  const maxScroll = () => Math.max(0, cardEl.scrollHeight - cardEl.clientHeight);

  if (activeIdx !== state.cardIdx) {
    renderCard(currentItem);
    // Desktop only: land the inner scroller at the end the user is heading
    // toward. On a phone the page scroll owns the text, so the card stays put.
    if (!isMobileTimeline()) cardEl.scrollTop = dir < 0 ? maxScroll() : 0;
    state.cardIdx = activeIdx;
  }
  cardEl.style.opacity = String(cardOpacity);

  // Desktop keeps an inner card scroller. While the card is fully visible,
  // wheel input reads that scroller before the page advances. Phones never
  // lock: the same page scroll moves the bullets.
  if (isMobileTimeline()) {
    state.cardLocked = false;
  } else {
    const promoHeld = !phase
      ? false
      : phase.trailing
        ? phase.trailT < cardOutStart
        : phase.idx < phase.count - 1
          ? phase.out === 0 && phase.in === 0
          : continuationYear(currentItem) || phase.local < cardOutStart;
    const newLocked = phase
      ? cardOpacity > 0.95 && promoHeld
      : subProg > cardInEnd && subProg < cardOutStart;
    if (newLocked && !state.cardLocked) {
      cardEl.scrollTop = dir < 0 ? maxScroll() : 0;
    }
    state.cardLocked = newLocked;
  }

  // Reset drag offset each time the card transitions from hidden → visible
  // (covers both new-card and same-card-shown-again cases). Don't reset mid-drag.
  const cardVisible = cardOpacity > 0.05;
  if (cardVisible && !state.cardVisible && !state.cardDragging && state.resetCardOffset) {
    state.resetCardOffset();
  }
  state.cardVisible = cardVisible;

  // Bullets are fully visible whenever the card is — no per-bullet reveal,
  // so the card arrives as one complete unit of information.
  const bulletEls = cardEl.querySelectorAll('.card-bullets li');
  bulletEls.forEach(li => {
    li.style.opacity = '1';
    li.style.transform = 'none';
  });
  if (phase) applyPromo(cardEl, phase);
  applyBulletShift(cardEl, currentItem, subProg, phase);

  // Rail. Promotion years are their own marks. The active mark follows the
  // year on screen, and the line travels the segment the same way it does
  // between cities.
  const railRole = phase ? phase.idx : 0;
  const railLocal = phase ? (phase.trailing ? phase.trailT : phase.local) : subProg;
  const matchRail = (entry, roleIdx) => {
    if (entry.timelineIdx !== activeIdx) return false;
    if (phase && phase.trailing) return !!entry.trailing;
    return !entry.trailing && entry.roleIdx === roleIdx;
  };
  const activeRail = state.railEntries.findIndex(e => matchRail(e, promoShown));
  const progressRail = state.railEntries.findIndex(e => matchRail(e, railRole));
  for (let i = 0; i < state.railStopEls.length; i++) {
    const s = state.railStopEls[i];
    s.classList.toggle('active', i === activeRail);
    s.classList.toggle('past', i < activeRail);
  }
  const progPct = ((progressRail + railLocal) / state.railEntries.length) * 100;
  document.getElementById('rail-progress').style.height = progPct + '%';

  state.activeIdx = activeIdx;
}

function initCareerGantt() {
  const root = document.getElementById('career-gantt');
  if (!root) return;
  const hits = [...root.querySelectorAll('.tl-hit')];

  function show(btn) {
    const title = btn.dataset.title || '';
    const org = btn.dataset.org || '';
    const dates = btn.dataset.dates || '';
    const kind = btn.dataset.kind || '';
    const meta = org && dates ? `${org} · ${dates}` : org || dates;
    root.querySelectorAll('[data-tl-title]').forEach(el => { el.textContent = title; });
    root.querySelectorAll('[data-tl-meta]').forEach(el => { el.textContent = meta; });
    root.querySelectorAll('[data-tl-kind]').forEach(el => { el.textContent = kind; });
    hits.forEach(el => el.classList.toggle('is-active', el === btn));
  }

  hits.forEach(btn => {
    btn.removeAttribute('title');
    btn.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      show(btn);
    });
    btn.addEventListener('focus', () => show(btn));
    btn.addEventListener('click', () => show(btn));
  });
}

// ===== BOOT =====
let rafPending = false;
function onScroll() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    updateScene();
  });
}

// How many pixels of each role's bullets sit below the mobile card window.
// Continuation beats have no bullets, so they keep a zero overflow.
function measureRoleOverflows() {
  const card = document.getElementById('exp-card');
  if (!card) {
    state.roleOverflow = TIMELINE.map(item => Array(stopUnits(item)).fill(0));
    return;
  }
  const overflows = [];
  for (const item of TIMELINE) {
    renderCard(item);
    const cs = getComputedStyle(card);
    const maxH = parseFloat(cs.maxHeight);
    const padBottom = parseFloat(cs.paddingBottom) || 0;
    const titlesBox = card.querySelector('.card-promo-titles');
    const titles = [...card.querySelectorAll('.card-promo-titles .card-role')];
    const bodies = card.querySelector('.card-promo-bodies');
    const lists = [...card.querySelectorAll('.card-bullets')];
    const roleOverflow = [];
    for (let i = 0; i < lists.length; i++) {
      const list = lists[i];
      list.style.transform = '';
      if (titlesBox && titles[i]) titlesBox.style.height = titles[i].offsetHeight + 'px';
      if (bodies) bodies.style.height = list.scrollHeight + 'px';
      const cardH = Number.isFinite(maxH) ? Math.min(card.scrollHeight, maxH) : card.clientHeight;
      const above = list.getBoundingClientRect().top - card.getBoundingClientRect().top;
      const available = cardH - above - padBottom;
      roleOverflow.push(Math.max(0, Math.ceil(list.scrollHeight - available)));
    }
    while (roleOverflow.length < stopUnits(item)) roleOverflow.push(0);
    overflows.push(roleOverflow);
  }
  state.roleOverflow = overflows;
  state.cardIdx = -1;
  state.promoShown = -1;
}

function setSectionHeight() {
  const exp = document.getElementById('experience');
  if (!isMobileTimeline()) {
    state.roleOverflow = null;
    const totalVh = TIMELINE.reduce((sum, item) => sum + stopUnits(item), 0) * CONFIG.perStopVh;
    exp.style.height = totalVh + 'vh';
    if (state.pinEls.length) updateScene();
    return;
  }
  measureRoleOverflows();
  const base = baseUnitScrollPx();
  let scrollPx = 0;
  for (const item of TIMELINE) {
    for (const w of segmentWeights(item)) scrollPx += w * base;
  }
  exp.style.height = Math.ceil(window.innerHeight + scrollPx) + 'px';
  if (state.pinEls.length) updateScene();
}

let US_STATES_GEOJSON = null;
let COUNTIES_GEOJSON = null;

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function applyTheme(next) {
    if (window.siteTheme) {
      window.siteTheme.apply(next, true);
      return;
    }
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.style.colorScheme = next;
    if (window.__persistTheme) window.__persistTheme(next);
    else try { localStorage.setItem('theme', next); } catch (_) {}
  }

  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';

    if (reduceMotion) {
      applyTheme(next);
      return;
    }

    if (document.startViewTransition) {
      document.startViewTransition(() => applyTheme(next));
      return;
    }

    // Fallback: temporarily transition theme-dependent properties.
    const root = document.documentElement;
    root.classList.add('theme-transitioning');
    applyTheme(next);
    setTimeout(() => root.classList.remove('theme-transitioning'), 550);
  });
}

function initCardDrag() {
  const card = document.getElementById('exp-card');
  if (!card) return;
  let startX = 0, startY = 0, baseDx = 0, baseDy = 0;

  const resetOffset = () => {
    card.style.removeProperty('--drag-x');
    card.style.removeProperty('--drag-y');
  };
  state.resetCardOffset = resetOffset;

  card.addEventListener('pointerdown', (e) => {
    if (window.innerWidth <= 800) return;
    if (e.target.closest('a, button')) return;
    startX = e.clientX;
    startY = e.clientY;
    baseDx = parseFloat(card.style.getPropertyValue('--drag-x')) || 0;
    baseDy = parseFloat(card.style.getPropertyValue('--drag-y')) || 0;
    state.cardDragging = true;
    card.classList.add('dragging');
    card.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  card.addEventListener('pointermove', (e) => {
    if (!state.cardDragging) return;
    card.style.setProperty('--drag-x', (baseDx + e.clientX - startX) + 'px');
    card.style.setProperty('--drag-y', (baseDy + e.clientY - startY) + 'px');
  });

  const endDrag = (e) => {
    if (!state.cardDragging) return;
    state.cardDragging = false;
    card.classList.remove('dragging');
    try { card.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  card.addEventListener('pointerup', endDrag);
  card.addEventListener('pointercancel', endDrag);
}

function initLogoEasterEgg() {
  const logo = document.querySelector('.floating-logo');
  if (!logo) return;
  const img = logo.querySelector('img:not(.logo-wreath)');

  const FACE_STANDARD = 'comic_standard_transparent.png';
  const FACE_SHOCKED  = 'comic_shocked_transparent.png';
  const FACE_LAUGHING = 'comic_laughing_transparent.png';
  const FACE_SLEEP    = 'comic_sleep_transparent.png';
  // Preload so src swaps don't flash a blank frame.
  [FACE_SHOCKED, FACE_LAUGHING, FACE_SLEEP].forEach(src => { const i = new Image(); i.src = src; });
  const setFace = (src) => { if (img && img.getAttribute('src') !== src) img.setAttribute('src', src); };

  const GRAVITY = 2200;       // px/s²
  const BOUNCE_DAMP = 0.55;
  const WALL_DAMP = 0.65;
  const FRICTION_PER_SEC = 0.45;  // vx *= 0.45^dt while on floor
  const STOP_VY = 30;
  const STOP_VX = 15;
  const TILT_CLAMP = 40;      // degrees

  let x = 0, y = 0, vx = 0, vy = 0, angle = 0;
  let floor = 0, leftWall = 0, rightWall = 0, rollRadius = 36;
  let rafId = null;
  let running = false;
  let fallen = false;
  let firstFloorHit = true;
  let baseCx = 0, baseCy = 0, iconRadius = 36;
  let obstacles = [];

  let gamma = 0;
  let tiltActive = false;

  // --- Tilt setup
  // Desktop browsers expose DeviceOrientationEvent but never fire events
  // without hardware — tiltActive only flips on once real data arrives.
  // Android: listener attached immediately; events fire automatically.
  // iOS: requestPermission() must run inside a user gesture, so we render
  // a small tappable prompt on page load — tapping it fires the request.
  const addOrientListener = () => {
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma != null) {
        gamma = e.gamma;
        tiltActive = true;
        if (fallen && !running) startAnim(false);
      }
    });
  };
  // Phones and tablets. Desktop Safari still exposes requestPermission,
  // but a mouse-and-keyboard machine has no accelerometer.
  function isHandheld() {
    if (matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches) return true;
    const ua = navigator.userAgent || '';
    return navigator.maxTouchPoints > 1 && /Macintosh/.test(ua);
  }
  function isIos() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua)) return true;
    return navigator.maxTouchPoints > 1 && /Macintosh/.test(ua);
  }
  // iOS hides requestPermission on plain http, including a LAN preview.
  function permissionRequest() {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      return () => DeviceOrientationEvent.requestPermission();
    }
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      return () => DeviceMotionEvent.requestPermission();
    }
    return null;
  }

  (function setupTilt() {
    if (typeof DeviceOrientationEvent === 'undefined') return;
    const askPermission = permissionRequest();
    const iosHttpPreview = !askPermission && isIos() && !window.isSecureContext;
    if (!askPermission && !iosHttpPreview) {
      addOrientListener();
      return;
    }
    if (!isHandheld()) return;
    const prompt = document.getElementById('tilt-prompt');
    if (!prompt) return;
    const label = prompt.querySelector('.tilt-prompt-label');
    let dismissed = false;

    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('pointerdown', onPointerDown);
      prompt.classList.remove('is-shown');
      let hidden = false;
      const hide = (event) => {
        if (hidden) return;
        if (event && event.propertyName && event.propertyName !== 'transform') return;
        hidden = true;
        prompt.hidden = true;
        prompt.removeEventListener('transitionend', hide);
      };
      prompt.addEventListener('transitionend', hide);
      const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      setTimeout(hide, reduceMotion ? 0 : 1100);
    };

    const originY = window.scrollY;
    let scrollArmed = false;
    const onScroll = () => {
      if (!scrollArmed) return;
      if (Math.abs(window.scrollY - originY) > 12) dismiss();
    };
    const onPointerDown = (event) => {
      if (prompt.contains(event.target)) return;
      dismiss();
    };

    prompt.hidden = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => prompt.classList.add('is-shown'));
    });
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('pointerdown', onPointerDown);
    // Safari fires a scroll as the address bar settles. Ignore that.
    setTimeout(() => { scrollArmed = true; }, 800);
    prompt.addEventListener('click', async () => {
      if (dismissed) return;
      let granted = iosHttpPreview;
      if (askPermission) {
        granted = false;
        try {
          const result = await askPermission();
          granted = result === 'granted';
        } catch (_) {}
      }
      if (!granted) {
        dismiss();
        return;
      }
      addOrientListener();
      if (label) label.textContent = 'Tilt enabled';
      setTimeout(dismiss, 1100);
    });
  })();

  // Extra inset so the wreath, which hangs past the circle, stays on screen.
  function decorClearance() {
    const wreath = logo.querySelector('.logo-wreath');
    if (!wreath) return { side: 6, bottom: 12 };
    const cs = getComputedStyle(wreath);
    if (cs.display === 'none' || cs.visibility === 'hidden') return { side: 6, bottom: 12 };
    const extraX = Math.max(0, (wreath.offsetWidth - logo.offsetWidth) / 2);
    const extraY = Math.max(0, (wreath.offsetHeight - logo.offsetHeight) / 2);
    return {
      side: Math.max(6, Math.ceil(extraX) + 4),
      bottom: Math.max(12, Math.ceil(extraY) + 8),
    };
  }

  function computeBounds() {
    const prev = logo.style.transform;
    logo.style.transform = 'translateX(-50%)';
    const rect = logo.getBoundingClientRect();
    logo.style.transform = prev;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const clear = decorClearance();
    baseCx = rect.left + rect.width / 2;
    baseCy = rect.top + rect.height / 2;
    iconRadius = rect.width / 2;
    floor = vh - clear.bottom - (rect.top + rect.height);
    leftWall = -(baseCx - rect.width / 2 - clear.side);
    rightWall = vw - baseCx - rect.width / 2 - clear.side;
    rollRadius = iconRadius;
  }

  function captureObstacles() {
    obstacles = [];
    // The ask chip is wide and sits on the same floor line as the other controls.
    const selectors = ['#snow-toggle', '#theme-toggle', '#back-to-top', '#tilt-prompt', '#ask-launcher'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el || el.hidden) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || parseFloat(cs.opacity) < 0.1) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      obstacles.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
  }

  function applyTransform() {
    logo.style.transform = `translateX(calc(-50% + ${x.toFixed(1)}px)) translateY(${y.toFixed(1)}px) rotate(${angle.toFixed(1)}deg)`;
  }

  function startAnim(reset) {
    if (running) return;
    computeBounds();
    if (reset) { x = 0; y = 0; vx = 0; vy = 0; angle = 0; firstFloorHit = true; }
    running = true;
    // Only show the shocked face on a fresh fall. When the loop resumes due to
    // tilt input after settling, keep whichever face is already showing (sleep).
    if (reset) setFace(FACE_SHOCKED);
    logo.style.transition = 'none';
    let last = performance.now();
    const tick = (now) => {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.032);
      last = now;
      // The ask label changes width when the health check resolves.
      captureObstacles();

      // Gravity, tilted if we have orientation input.
      let ax = 0, ay = GRAVITY;
      if (tiltActive) {
        const rad = clamp(gamma, -TILT_CLAMP, TILT_CLAMP) * Math.PI / 180;
        ax = Math.sin(rad) * GRAVITY;
        ay = Math.cos(rad) * GRAVITY;
      }
      vx += ax * dt;
      vy += ay * dt;

      x += vx * dt;
      y += vy * dt;

      // Floor
      if (y >= floor) {
        y = floor;
        if (vy > 0) {
          const vyIn = vy;
          vy = -vy * BOUNCE_DAMP;
          // Desktop-only: FIRST floor hit kicks the icon sideways with a random
          // impulse to simulate a tilt input. Subsequent bounces preserve the
          // existing vx so the icon carries its momentum.
          const isMobile = matchMedia('(max-width: 800px)').matches;
          if (firstFloorHit) {
            setFace(FACE_LAUGHING);
            if (!tiltActive && !isMobile) {
              const magnitude = Math.min(1, Math.abs(vyIn) / 600);
              vx += (Math.random() * 2 - 1) * 900 * magnitude;
            }
          }
          firstFloorHit = false;
        }
      }

      // Walls
      if (x < leftWall) { x = leftWall; vx = Math.abs(vx) * WALL_DAMP; }
      else if (x > rightWall) { x = rightWall; vx = -Math.abs(vx) * WALL_DAMP; }

      // Obstacle collisions (floating buttons, including the ask chip).
      // Circle-vs-rect: find the closest point on the obstacle to the icon
      // center. If the gap is smaller than the icon radius, push out along
      // the normal and reflect. The ask chip is wide enough that a fast roll
      // can put the center inside it; then the nearest edge is the way out.
      let supported = false;
      if (obstacles.length) {
        for (const obs of obstacles) {
          const cx = baseCx + x;
          const cy = baseCy + y;
          const px = Math.max(obs.left, Math.min(cx, obs.right));
          const py = Math.max(obs.top, Math.min(cy, obs.bottom));
          const dx = cx - px;
          const dy = cy - py;
          const dist = Math.hypot(dx, dy);
          let nx = 0;
          let ny = 0;
          let overlap = 0;
          if (dist < iconRadius && dist > 0.001) {
            overlap = iconRadius - dist;
            nx = dx / dist;
            ny = dy / dist;
          } else if (dist <= 0.001) {
            const leftPen = cx - obs.left;
            const rightPen = obs.right - cx;
            const topPen = cy - obs.top;
            const botPen = obs.bottom - cy;
            const min = Math.min(leftPen, rightPen, topPen, botPen);
            if (min === topPen) { nx = 0; ny = -1; overlap = iconRadius + topPen; }
            else if (min === botPen) { nx = 0; ny = 1; overlap = iconRadius + botPen; }
            else if (min === leftPen) { nx = -1; ny = 0; overlap = iconRadius + leftPen; }
            else { nx = 1; ny = 0; overlap = iconRadius + rightPen; }
          }
          if (!overlap) continue;
          x += nx * overlap;
          y += ny * overlap;
          if (ny < -0.5) supported = true;
          const vDotN = vx * nx + vy * ny;
          if (vDotN < 0) {
            const j = (1 + 0.55) * vDotN;
            vx -= j * nx;
            vy -= j * ny;
          }
        }
      }

      // Friction on the floor, and on top of a button the icon has landed on.
      if ((y >= floor - 0.5 || supported) && Math.abs(vy) < 80) {
        vx *= Math.pow(FRICTION_PER_SEC, dt);
      }

      // Rolling rotation — angular displacement = dx / radius (in radians)
      const dx = vx * dt;
      angle += (dx / rollRadius) * (180 / Math.PI);

      applyTransform();

      // Stop when fully settled and no tilt input is driving motion.
      // Resting on the ask chip counts: the chip can block the floor.
      const resting = Math.abs(vy) < STOP_VY && Math.abs(vx) < STOP_VX;
      const tiltIdle = !tiltActive || Math.abs(gamma) < 3;
      if (resting && tiltIdle && (y >= floor - 0.3 || supported)) {
        if (y >= floor - 0.3) y = floor;
        applyTransform();
        setFace(FACE_SLEEP);
        running = false;
        rafId = null;
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function stopAnim() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    setFace(FACE_STANDARD);
    // Smoothly glide back to the original top-center position, then clear the
    // temporary transition so the base CSS rules apply again.
    logo.style.transition = 'transform 450ms cubic-bezier(0.4, 0, 0.2, 1)';
    logo.style.transform = '';
    const onEnd = () => {
      logo.style.transition = '';
      logo.removeEventListener('transitionend', onEnd);
    };
    logo.addEventListener('transitionend', onEnd);
    x = 0; y = 0; vx = 0; vy = 0; angle = 0;
  }

  const check = () => {
    const scrollBottom = window.scrollY + window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;
    const atBottom = scrollBottom >= docHeight - 4;
    if (atBottom && !fallen) {
      fallen = true;
      startAnim(true);
    } else if (!atBottom && fallen) {
      fallen = false;
      stopAnim();
    }
  };
  window.addEventListener('scroll', check, { passive: true });
  window.addEventListener('resize', check);
  window.addEventListener('snowchange', () => {
    if (!fallen) return;
    computeBounds();
    if (!running && y > floor) {
      y = floor;
      applyTransform();
    }
  });
  check();
}

// While the experience card is fully visible, route wheel/touch deltas
// into card.scrollTop instead of page scroll. When the card hits its top
// or bottom in the scroll direction, fall back to page scroll so the
// fade-out (and the next stop) advances naturally.
function initCardScrollLock() {
  const card = document.getElementById('exp-card');
  const sticky = document.querySelector('.exp-sticky');
  if (!card || !sticky) return;

  function applyDelta(dy) {
    const max = card.scrollHeight - card.clientHeight;
    if (max <= 1) return false;
    if (dy > 0) {
      if (card.scrollTop >= max - 1) return false;
      card.scrollTop = Math.min(max, card.scrollTop + dy);
      return true;
    }
    if (dy < 0) {
      if (card.scrollTop <= 1) return false;
      card.scrollTop = Math.max(0, card.scrollTop + dy);
      return true;
    }
    return false;
  }

  sticky.addEventListener('wheel', (e) => {
    if (isMobileTimeline() || !state.cardLocked) return;
    if (applyDelta(e.deltaY)) e.preventDefault();
  }, { passive: false });

  let lastY = null;
  sticky.addEventListener('touchstart', (e) => {
    if (isMobileTimeline()) { lastY = null; return; }
    lastY = state.cardLocked && e.touches.length ? e.touches[0].clientY : null;
  }, { passive: true });
  sticky.addEventListener('touchmove', (e) => {
    if (isMobileTimeline() || !state.cardLocked || lastY == null || !e.touches.length) return;
    const y = e.touches[0].clientY;
    const dy = lastY - y;
    lastY = y;
    if (applyDelta(dy)) e.preventDefault();
  }, { passive: false });
  sticky.addEventListener('touchend', () => { lastY = null; }, { passive: true });
}

// Gentle falling snow. One canvas, paused while the tab is hidden.
// Off stops the loop and clears the canvas. The choice is stored as
// "on" or "off"; with no choice, reduced motion starts it off.
function initSnow() {
  const canvas = document.getElementById('snow');
  const btn = document.getElementById('snow-toggle');
  if (!canvas || !btn) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const STORAGE_KEY = 'snow';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let flakes = [];
  let raf = 0;
  let running = false;
  let enabled = false;
  let last = 0;
  let viewW = 0;
  let viewH = 0;

  function readPref() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      if (value === 'on' || value === 'off') return value;
    } catch (_) {}
    return null;
  }

  function writePref(on) {
    try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch (_) {}
  }

  function targetCount(w, h) {
    const narrow = w < 700;
    const n = Math.round((w * h) / (narrow ? 42000 : 28000));
    return Math.max(narrow ? 14 : 28, Math.min(narrow ? 36 : 70, n));
  }

  function makeFlake(w, h, anywhere) {
    const r = 1.35 + Math.random() * 1.45;
    return {
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : -r - Math.random() * 24,
      r,
      vy: 18 + Math.random() * 22,
      vx: (Math.random() - 0.5) * 14,
      phase: Math.random() * Math.PI * 2,
      sway: 0.35 + Math.random() * 0.55,
    };
  }

  function resize() {
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(viewW * dpr));
    canvas.height = Math.max(1, Math.round(viewH * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = targetCount(viewW, viewH);
    if (flakes.length > n) flakes.length = n;
    while (flakes.length < n) flakes.push(makeFlake(viewW, viewH, true));
  }

  function draw() {
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.7;
    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i];
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function frame(now) {
    if (!running) return;
    if (!last) last = now;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;
    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i];
      f.y += f.vy * dt;
      f.x += (f.vx + Math.sin(t * f.sway + f.phase) * 10) * dt;
      if (f.y - f.r > viewH) {
        f.y = -f.r;
        f.x = Math.random() * viewW;
      } else if (f.x < -12) {
        f.x = viewW + 12;
      } else if (f.x > viewW + 12) {
        f.x = -12;
      }
    }
    draw();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || !enabled) return;
    if (document.visibilityState === 'hidden') return;
    canvas.hidden = false;
    running = true;
    resize();
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function pause() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  }

  function stop() {
    pause();
    flakes = [];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.hidden = true;
  }

  function setEnabled(on, save) {
    enabled = on;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    document.documentElement.classList.toggle('snow-off', !on);
    window.dispatchEvent(new CustomEvent('snowchange'));
    if (save) writePref(on);
    if (on) start();
    else stop();
  }

  const saved = readPref();
  setEnabled(saved ? saved === 'on' : !reduceMotion, false);

  btn.addEventListener('click', () => setEnabled(!enabled, true));

  document.addEventListener('visibilitychange', () => {
    if (!enabled) return;
    if (document.visibilityState === 'hidden') pause();
    else start();
  });

  window.addEventListener('resize', () => {
    if (!running) return;
    resize();
    draw();
  });
}

function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;
  const sync = () => btn.classList.toggle('visible', window.scrollY > 400);
  sync();
  window.addEventListener('scroll', sync, { passive: true });
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// Live badge in the hero: is chat.efrain.me answering?
// GET /api/health returns {"status":"up",...} or {"status":"down"}.
// Any failure (timeout, network, CORS, bad JSON) shows offline and
// does not throw, so the rest of the page still loads.
const CHAT_HEALTH_URL = 'https://chat.efrain.me/api/health';
const CHAT_HOME_URL = 'https://chat.efrain.me';
const CHAT_HEALTH_TIMEOUT_MS = 3000;
const CHAT_HEALTH_INTERVAL_MS = 60000;

function initChatStatus() {
  const link = document.getElementById('chat-status');
  if (!link) return;
  const statusEl = link.querySelector('.chat-status-state');
  if (!statusEl) return;

  let pollTimer = 0;
  // The request currently in flight, so a new check can cancel it.
  let inFlight = null;
  // After the first result, later polls keep the current label until
  // the new one arrives. That avoids announcing "Checking…" every minute.
  let hasResult = false;

  // state is "checking", "up", or "down". Offline drops the href so the
  // control cannot navigate, even from the keyboard. The floating link
  // uses the same state.
  function setState(state, label) {
    link.dataset.state = state;
    if (statusEl.textContent !== label) statusEl.textContent = label;
    const offline = state === 'down';
    if (offline) {
      link.setAttribute('aria-disabled', 'true');
      link.removeAttribute('href');
      link.tabIndex = -1;
    } else {
      link.removeAttribute('aria-disabled');
      link.setAttribute('href', CHAT_HOME_URL);
      link.removeAttribute('tabindex');
    }
    syncAskWidget(state, label);
  }

  async function check() {
    if (inFlight) inFlight.abort();
    const controller = new AbortController();
    inFlight = controller;
    const timeout = setTimeout(() => controller.abort(), CHAT_HEALTH_TIMEOUT_MS);
    if (!hasResult) setState('checking', 'Checking…');
    try {
      const res = await fetch(CHAT_HEALTH_URL, {
        cache: 'no-store',
        signal: controller.signal,
      });
      // A newer check replaced this one; leave the badge alone.
      if (inFlight !== controller) return;
      if (!res.ok) {
        setState('down', 'Offline right now');
        return;
      }
      let data = null;
      try {
        data = await res.json();
      } catch (_) {
        data = null;
      }
      if (inFlight !== controller) return;
      if (data && data.status === 'up') setState('up', 'Online');
      else setState('down', 'Offline right now');
    } catch (_) {
      // Timeout, network error, or CORS failure. Ignore it when this
      // request was aborted because a newer check started.
      if (inFlight !== controller) return;
      setState('down', 'Offline right now');
    } finally {
      clearTimeout(timeout);
      if (inFlight === controller) {
        inFlight = null;
        hasResult = true;
      }
    }
  }

  // Belt and suspenders: if href is gone, a click still must not navigate.
  link.addEventListener('click', (event) => {
    if (link.getAttribute('aria-disabled') === 'true' || !link.hasAttribute('href')) {
      event.preventDefault();
    }
  });
  const askLink = document.getElementById('ask-launcher');
  if (askLink) {
    askLink.addEventListener('click', (event) => {
      if (askLink.getAttribute('aria-disabled') === 'true' || !askLink.hasAttribute('href')) {
        event.preventDefault();
      }
    });
  }

  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = 0;
    if (document.visibilityState !== 'visible') return;
    pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') check();
    }, CHAT_HEALTH_INTERVAL_MS);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      check();
      startPolling();
    } else {
      clearInterval(pollTimer);
      pollTimer = 0;
    }
  });

  setState('checking', 'Checking…');
  check();
  startPolling();
}

// The corner chip is a second link to the same chat site.
function syncAskWidget(state, label) {
  const link = document.getElementById('ask-launcher');
  if (!link) return;
  link.dataset.state = state;
  const statusEl = link.querySelector('.ask-state');
  if (statusEl && statusEl.textContent !== label) statusEl.textContent = label;
  const offline = state === 'down';
  if (offline) {
    link.setAttribute('aria-disabled', 'true');
    link.removeAttribute('href');
    link.tabIndex = -1;
  } else {
    link.removeAttribute('aria-disabled');
    link.setAttribute('href', CHAT_HOME_URL);
    link.removeAttribute('tabindex');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle();
  initSnow();
  initBackToTop();
  initCardDrag();
  initCareerGantt();
  initCardScrollLock();
  initLogoEasterEgg();
  // Start the health check before the map data loads, so a slow
  // GeoJSON fetch cannot block the badge.
  initChatStatus();
  const [statesData, countiesData] = await Promise.all([
    fetch('us-states.geojson').then(r => r.json()),
    fetch('counties.geojson').then(r => r.json()).catch(() => null),
  ]);
  US_STATES_GEOJSON = statesData;
  COUNTIES_GEOJSON = countiesData;
  renderStatic();
  setSectionHeight();
  buildMap();
  updateScene();
  window.addEventListener('scroll', onScroll, { passive: true });
  const onResize = () => {
    setSectionHeight();
    onScroll();
  };
  window.addEventListener('resize', onResize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);
});

