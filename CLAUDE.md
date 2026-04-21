# CLAUDE.md

Project context for Claude Code. Read this first before making changes.

## What this project is

A single-page scroll-driven resume companion site for Efrain Plascencia.
The hero interaction is a US map that zooms from city to city as the user
scrolls, drawing arcs between jobs, with a floating card revealing role
details. Pure static site — no build step, no framework.

**Live on Vercel.** Deploys automatically on push to `main` if the Vercel
GitHub integration is connected; otherwise use `vercel --prod`.

## Current file layout

```
index.html        Everything inlined: CSS, JS, resume data, US-states GeoJSON
uploads/          Efrain_Plascencia_Resume.docx — linked from download buttons
README.md         Deploy and GitHub instructions
.gitignore        .vercel/, .DS_Store, editor junk
```

`index.html` is ~133 KB because the CSS, JS, `TIMELINE` data, `RESUME_META`
data, and the full US-states GeoJSON are all inlined into a single file.
This was deliberate for a zero-dependency one-shot deploy, but it's painful
to edit.

**Likely first task: split `index.html` into separate files** — `styles.css`,
`app.js`, `resume-data.js`, `us-states.geojson` — and have `index.html`
just load them. Keep behavior and visuals identical. After that, editing
becomes much more pleasant.

## Architecture (inside index.html, top-to-bottom)

1. **`<style>` block** — design tokens as CSS variables (`--bg`, `--ink`,
   `--accent`, etc.), then section styles, then two mobile breakpoints
   (`max-width: 640px` for hero/footer/contact, `max-width: 800px` for
   the experience section).
2. **`<body>` markup** — Hero, Summary, Experience (sticky map stage),
   Skills, Contact. Content containers are empty at page load; JS fills
   them on `DOMContentLoaded`.
3. **`<script>` block** — in this order:
   - Data: `TIMELINE` (array of jobs/education, chronological) and
     `RESUME_META` (name, contact, summary, competencies, skills, languages).
   - `US_STATES_GEOJSON` — inlined continental-US shapes.
   - `CONFIG` — locked values: `perStopVh: 100`, `pinZoomTight: 9.0`.
   - `MAP` IIFE — `project()` (lng/lat → x/y), `buildStatesSvg()`,
     `viewBoxFor()`, `viewBoxForBounds()`, `arcPath()` (quadratic bezier
     arc between two projected points).
   - `renderStatic()` — fills Hero, Summary, Skills, Contact.
   - `buildMap()` — builds state paths, pin groups, trail arc paths,
     tooltips, rail stops (once, on DOMContentLoaded).
   - `updateScene()` — called on every scroll. Computes `activeIdx` and
     `subProg` (0–1 within the current stop), then runs the 3-phase zoom,
     arc draw, bullet reveal, card fade, rail progress, etc.

## The 3-phase zoom

This is the core trick and worth understanding before touching it. For
each transition from stop N to stop N+1:

- `subProg 0.00–0.35`: hold tight zoom on the current pin
- `subProg 0.35–0.55`: tween out to a wide viewBox framing both pins
- `subProg 0.55–0.75`: hold the wide view while the arc draws
- `subProg 0.75–1.00`: tween in tight on the next pin

The card opacity fades in over 0–0.25 and out over 0.78–1.00. Bullets
reveal progressively over 0–0.75.

## Design tokens — locked defaults

The original handoff from Claude Design had a live "tweaks" panel (light/
dark, editorial/swiss/mono aesthetic, accent color, map style, arc style,
scroll feel, pin zoom). That panel was the editor's preview UI, not a
production feature. I stripped it and locked in these defaults:

- **Aesthetic:** swiss (Inter Tight display, Inter body)
- **Accent:** blue (`oklch(0.42 0.12 255)`)
- **Mode:** light (off-white `#f4f1ea` background, near-black `#1a1a1a` ink)
- **Map style:** solid (filled states)
- **Arc style:** thick (2.2px strokes)
- **Scroll feel:** snap (100vh per stop)
- **Pin zoom:** 9.0 (block level)

The CSS still uses variables for all of these — easy to change, just
commit to one set. Don't re-add the tweaks panel.

## Responsive breakpoints

Two media queries currently:

- **`max-width: 640px`** — hero-top stacks vertically, buttons go to a
  2-col grid, scroll hint hidden, footer stacks, contact lines stack
  (label over value) with smaller type and `overflow-wrap: anywhere`.
- **`max-width: 800px`** — experience section: rail slims to a 28px
  dots-only column, exp-card drops to the bottom full-width with
  `max-height: 55vh` and internal scroll, year ticker shrinks, chrome
  padding tightens.

Nothing between 800px and desktop. Tablet portrait is a reasonable gap
to tune if issues show up.

## Known quirks and flagged items

1. **GEMMACON pin location.** The "Head of Business Development &
   Engineering" role has `city: "Long Beach, CA (Remote from DFW)"` but
   its coords place the pin on Long Beach. If the intent is DFW, update
   `coord` in the TIMELINE entry to `[-96.8, 32.8]` (approx).
2. **Same-city transition code is dead.** The `sameCity` branch in
   `updateScene()` handles identical coords between consecutive stops.
   No such case exists in the current data; harmless but keep in mind
   if extending the timeline.
3. **Resume download is a relative path.** Both "Download resume"
   buttons link to `uploads/Efrain_Plascencia_Resume.docx`. If you
   rename or move the file, both `href`s in `index.html` need updating.
4. **Google Fonts is the only external request.** If offline support
   matters, self-host the fonts.
5. **Dot in eyebrow had a squash bug.** `.eyebrow .dot` needs
   `flex-shrink: 0` or it compresses into a vertical ellipse when its
   flex container is narrow. Already fixed; don't regress.

## Editing content

Resume content is currently in the inlined `<script>` block —
`const TIMELINE = [...]` and `const RESUME_META = {...}`. After the
split-into-files refactor, these should live in `resume-data.js`.

## Deploy

```bash
# Manual
vercel --prod

# Or just push to main if GitHub integration is connected
git push origin main
```

No `vercel.json` is needed for this shape. Only add one if you want to
customize headers, redirects, or caching.
