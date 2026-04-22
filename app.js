// Locked config (defaults from TWEAK_DEFAULTS)
const CONFIG = {
  perStopVh: 100,       // 'snap' scroll feel
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
  const phoneHref = 'tel:+1' + m.phone.replace(/\D/g, '');
  heroMeta.innerHTML = `
    <div>
      <div class="meta-label">Based in</div>
      <div class="meta-val">${m.location}</div>
    </div>
    <div>
      <div class="meta-label">Contact</div>
      <div class="meta-val"><a href="mailto:${m.email}">${m.email}</a></div>
      <div class="meta-val dim"><a href="${phoneHref}">${m.phone}</a></div>
    </div>
    <div>
      <div class="meta-label">Profile</div>
      <div class="meta-val"><a href="https://${m.linkedin}" target="_blank" rel="noopener">${m.linkedin}</a></div>
      <div class="meta-val"><a href="https://${m.github}" target="_blank" rel="noopener">${m.github}</a></div>
    </div>
    <div>
      <div class="meta-label">Languages</div>
      <div class="meta-val">${m.languages.map(l => l.name === 'German' ? `<em>${l.name}</em>` : l.name).join(' · ')}</div>
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

  document.getElementById('certs-list').innerHTML = (m.certifications || []).map(c => `
    <div class="cert">
      <div class="cert-main">
        <div class="cert-title">${c.title}</div>
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

  document.getElementById('contact-big').innerHTML = `
    <div class="contact-line">
      <span class="k">Email</span>
      <a class="v" href="mailto:${m.email}">${m.email}</a>
    </div>
    <div class="contact-line">
      <span class="k">Phone</span>
      <span class="v">${m.phone}</span>
    </div>
    <div class="contact-line">
      <span class="k">LinkedIn</span>
      <a class="v" href="https://${m.linkedin}" target="_blank" rel="noopener">${m.linkedin}</a>
    </div>
    <div class="contact-line">
      <span class="k">GitHub</span>
      <a class="v" href="https://${m.github}" target="_blank" rel="noopener">${m.github}</a>
    </div>
    <div class="contact-line">
      <span class="k">Location</span>
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
  pCurProj: null,
  pNextProj: null,
  arcD: null,
  invisArcPath: null, // hidden path for getPointAtLength
  tooltipEls: [],
  pinEls: [],
  railStopEls: [],
};

function buildMap() {
  state.built = MAP.buildStatesSvg(US_STATES_GEOJSON);

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
      ? `–${it.endYear === 2026 ? "'26" : String(it.endYear).slice(2)}`
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

  // Rail stops
  const railStops = document.getElementById('rail-stops');
  state.railStopEls = TIMELINE.map((it) => {
    const div = document.createElement('div');
    div.className = 'rail-stop';
    div.innerHTML = `
      <div class="rail-dot"></div>
      <div class="rail-year">${it.startYear}</div>
      <div class="rail-org">${it.railLabel || it.org.split(' ')[0]}</div>
    `;
    railStops.appendChild(div);
    return div;
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
  if (dx === 0 && dy === 0) return 'up';
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

function renderCard(item) {
  const el = document.getElementById('card-inner');
  el.innerHTML = `
    <div class="card-head">
      <div class="card-kind">${item.type === 'education' ? 'Education' : 'Experience'}</div>
      <div class="card-dates">${item.dates}</div>
    </div>
    <h2 class="card-title">${item.title}</h2>
    <div class="card-org">
      <span class="card-org-name">${item.org}</span>
      <span class="card-sep">·</span>
      <span class="card-city">${item.city}</span>
    </div>
    <ul class="card-bullets">
      ${item.bullets.map(b => `
        <li style="opacity:0;transform:translateY(8px)">
          <span class="bullet-mark">—</span>
          <span>${b}</span>
        </li>
      `).join('')}
    </ul>
  `;
}

function updateScene() {
  const n = TIMELINE.length;
  const expSection = document.getElementById('experience');
  const rect = expSection.getBoundingClientRect();
  const vh = window.innerHeight;
  const total = expSection.offsetHeight - vh;
  const scrolled = clamp(-rect.top, 0, total);
  const p = total > 0 ? scrolled / total : 0;

  const stopSpan = 1 / n;
  const activeIdx = Math.min(n - 1, Math.floor(p / stopSpan));
  const subProg = clamp((p - activeIdx * stopSpan) / stopSpan, 0, 1);

  const currentItem = TIMELINE[activeIdx];
  const nextItem = TIMELINE[Math.min(n - 1, activeIdx + 1)];
  const pCurProj = MAP.project(currentItem.coord);
  const pNextProj = MAP.project(nextItem.coord);

  // 3-phase zoom viewBox — per-stop zoom override, fall back to CONFIG.pinZoomTight
  const currentZoom = currentItem.zoom || CONFIG.pinZoomTight;
  const nextZoom = nextItem.zoom || CONFIG.pinZoomTight;
  const vbCurTight = MAP.viewBoxFor(pCurProj, currentZoom, [0, 0]);
  const vbNextTight = MAP.viewBoxFor(pNextProj, nextZoom, [0, 0]);
  const sameCity = pCurProj[0] === pNextProj[0] && pCurProj[1] === pNextProj[1];
  const vbWide = sameCity ? vbCurTight : MAP.viewBoxForBounds(pCurProj, pNextProj, 80);

  function tweenVB(a, b, t) {
    const e = smoothstep(clamp(t, 0, 1));
    return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), w: lerp(a.w, b.w, e), h: lerp(a.h, b.h, e) };
  }

  let vb;
  if (activeIdx >= n - 1) {
    vb = vbCurTight;
  } else if (currentItem.smoothPan) {
    // Close-neighbor transition: hold briefly, then pan at constant zoom to the
    // next pin without a zoom-out/wide phase. Both pins should share the same zoom.
    vb = tweenVB(vbCurTight, vbNextTight, (subProg - 0.35) / 0.65);
  } else if (subProg < 0.35) {
    vb = vbCurTight;
  } else if (subProg < 0.75) {
    vb = tweenVB(vbCurTight, vbWide, (subProg - 0.35) / 0.20);
  } else {
    vb = tweenVB(vbWide, vbNextTight, (subProg - 0.75) / 0.25);
  }

  const svg = document.getElementById('usmap');
  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

  // County lines fade in when viewBox is tight (zoomed well past state level)
  const countiesG = document.getElementById('counties-g');
  if (countiesG) {
    countiesG.style.opacity = String(smoothstep(clamp((80 - vb.w) / 40, 0, 1)));
  }

  // Year ticker — linear progression from current start to next start across subProg;
  // freeze at endYear on the last stop.
  let displayYear;
  if (activeIdx >= n - 1) {
    displayYear = TIMELINE[n - 1].endYear;
  } else {
    displayYear = Math.floor(lerp(currentItem.startYear, nextItem.startYear, subProg));
  }
  document.getElementById('year-big').textContent = displayYear;

  // Active arc + traveling dot: the arc path literally grows as the dot moves.
  // Partial bezier via De Casteljau — the dot sits at the endpoint of the growing curve.
  const arcEl = document.getElementById('arc-active');
  const arcDrawT = smoothstep(clamp((subProg - 0.40) / 0.35, 0, 1));

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

  // Pins
  const scale = vb.w / MAP.W;
  for (let i = 0; i < TIMELINE.length; i++) {
    const el = state.pinEls[i];
    const visible = i <= activeIdx;
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

  // Tooltips — only for visible pins, positioned in % of current viewBox
  for (let i = 0; i < TIMELINE.length; i++) {
    const tt = state.tooltipEls[i];
    const visible = i <= activeIdx;
    if (!visible) { tt.style.display = 'none'; continue; }
    const [px, py] = MAP.project(TIMELINE[i].coord);
    const xPct = ((px - vb.x) / vb.w) * 100;
    const yPct = ((py - vb.y) / vb.h) * 100;
    if (xPct < -5 || xPct > 105 || yPct < -5 || yPct > 105) {
      tt.style.display = 'none';
    } else {
      tt.style.display = '';
      tt.style.left = xPct + '%';
      tt.style.top = yPct + '%';
      tt.dataset.side = pickTooltipSide(i, activeIdx);
      tt.classList.toggle('is-current', i === activeIdx);
    }
  }

  // Card: swap content when activeIdx changes; always update bullet reveal + opacity
  if (activeIdx !== state.cardIdx) {
    renderCard(currentItem);
    state.cardIdx = activeIdx;
  }
  const cardEl = document.getElementById('exp-card');
  const cardInT = smoothstep(clamp(subProg / 0.25, 0, 1));
  const cardOutT = subProg > 0.78 ? smoothstep(clamp((subProg - 0.78) / 0.22, 0, 1)) : 0;
  const cardOpacity = cardInT * (1 - cardOutT);
  cardEl.style.opacity = String(cardOpacity);

  // Reset drag offset each time the card transitions from hidden → visible
  // (covers both new-card and same-card-shown-again cases). Don't reset mid-drag.
  const cardVisible = cardOpacity > 0.05;
  if (cardVisible && !state.cardVisible && !state.cardDragging && state.resetCardOffset) {
    state.resetCardOffset();
  }
  state.cardVisible = cardVisible;

  // Bullets reveal
  const bulletEls = cardEl.querySelectorAll('.card-bullets li');
  const nb = bulletEls.length;
  const revealT = clamp(subProg / 0.75, 0, 1) * nb;
  bulletEls.forEach((li, i) => {
    const t = clamp(revealT - i, 0, 1);
    li.style.opacity = String(t);
    li.style.transform = `translateY(${(1 - t) * 8}px)`;
  });

  // Rail
  for (let i = 0; i < state.railStopEls.length; i++) {
    const s = state.railStopEls[i];
    s.classList.toggle('active', i === activeIdx);
    s.classList.toggle('past', i < activeIdx);
  }
  const progPct = ((activeIdx + subProg) / n) * 100;
  document.getElementById('rail-progress').style.height = progPct + '%';

  state.activeIdx = activeIdx;
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

function setSectionHeight() {
  // Per-stop scroll length — defines total scrollable span of the experience section
  const totalVh = TIMELINE.length * CONFIG.perStopVh;
  document.getElementById('experience').style.height = totalVh + 'vh';
}

let US_STATES_GEOJSON = null;
let COUNTIES_GEOJSON = null;

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('theme', next); } catch (_) {}
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

  const GRAVITY = 2200;       // px/s²
  const BOUNCE_DAMP = 0.55;
  const WALL_DAMP = 0.65;
  const FRICTION_PER_SEC = 0.45;  // vx *= 0.45^dt while on floor
  const STOP_VY = 30;
  const STOP_VX = 15;
  const ROLL_RADIUS = 28;     // half of 56px logo
  const TILT_CLAMP = 40;      // degrees

  let x = 0, y = 0, vx = 0, vy = 0, angle = 0;
  let floor = 0, leftWall = 0, rightWall = 0;
  let rafId = null;
  let running = false;
  let fallen = false;

  let gamma = 0;
  let tiltActive = false;

  // --- Tilt: on Android, add listener immediately. On iOS, require a
  // user gesture (touchstart/click anywhere) before requestPermission fires.
  (function setupTilt() {
    if (typeof DeviceOrientationEvent === 'undefined') return;
    const addListener = () => {
      window.addEventListener('deviceorientation', (e) => {
        if (e.gamma != null) {
          gamma = e.gamma;
          if (fallen && !running) startAnim(false); // resume on new input
        }
      });
      tiltActive = true;
    };
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const onGesture = async () => {
        try {
          const r = await DeviceOrientationEvent.requestPermission();
          if (r === 'granted') addListener();
        } catch (_) {}
      };
      document.addEventListener('touchstart', onGesture, { once: true, passive: true });
      document.addEventListener('click', onGesture, { once: true });
    } else {
      addListener();
    }
  })();

  function computeBounds() {
    const prev = logo.style.transform;
    logo.style.transform = 'translateX(-50%)';
    const rect = logo.getBoundingClientRect();
    logo.style.transform = prev;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const centerX = rect.left + rect.width / 2;
    floor = vh - 12 - (rect.top + rect.height);
    leftWall = -(centerX - rect.width / 2 - 6);
    rightWall = vw - centerX - rect.width / 2 - 6;
  }

  function applyTransform() {
    logo.style.transform = `translateX(calc(-50% + ${x.toFixed(1)}px)) translateY(${y.toFixed(1)}px) rotate(${angle.toFixed(1)}deg)`;
  }

  function startAnim(reset) {
    if (running) return;
    computeBounds();
    if (reset) { x = 0; y = 0; vx = 0; vy = 0; angle = 0; }
    running = true;
    logo.style.transition = 'none';
    let last = performance.now();
    const tick = (now) => {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.032);
      last = now;

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
          // No tilt input? Each bounce kicks the icon sideways for fun.
          if (!tiltActive) {
            const magnitude = Math.min(1, Math.abs(vyIn) / 600);
            vx += (Math.random() * 2 - 1) * 900 * magnitude;
          }
        }
      }

      // Walls
      if (x < leftWall) { x = leftWall; vx = Math.abs(vx) * WALL_DAMP; }
      else if (x > rightWall) { x = rightWall; vx = -Math.abs(vx) * WALL_DAMP; }

      // Floor friction
      if (y >= floor - 0.5 && Math.abs(vy) < 50) {
        vx *= Math.pow(FRICTION_PER_SEC, dt);
      }

      // Rolling rotation — angular displacement = dx / radius (in radians)
      const dx = vx * dt;
      angle += (dx / ROLL_RADIUS) * (180 / Math.PI);

      applyTransform();

      // Stop when fully settled and no tilt input is driving motion
      const settled = y >= floor - 0.3 && Math.abs(vy) < STOP_VY && Math.abs(vx) < STOP_VX;
      const tiltIdle = !tiltActive || Math.abs(gamma) < 3;
      if (settled && tiltIdle) {
        y = floor;
        applyTransform();
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
    logo.style.transform = '';
    logo.style.transition = '';
    x = 0; y = 0; vx = 0; vy = 0; angle = 0;
  }

  const check = () => {
    const scrollBottom = window.scrollY + window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;
    const atBottom = scrollBottom >= docHeight - 4;
    if (atBottom && !fallen) {
      fallen = true;
      startAnim(true);
    } else if (!atBottom && fallen && window.scrollY < docHeight * 0.5) {
      fallen = false;
      stopAnim();
    }
  };
  window.addEventListener('scroll', check, { passive: true });
  window.addEventListener('resize', check);
  check();
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

document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle();
  initBackToTop();
  initCardDrag();
  initLogoEasterEgg();
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
  window.addEventListener('resize', onScroll);
});

