# kytimes.ai Project Entry + Resume Regeneration — Design

**Date:** 2026-07-08
**Status:** Approved

## Goal

Replace the "Coming soon" placeholder in the site's Projects section (06) with a
real entry for kytimes.ai ("The Knew York Times"), and regenerate the downloadable
resume DOCX and PDF to include it.

## Content

- **Title:** The Knew York Times (links to https://kytimes.ai)
- **Role:** Founder · **Year:** 2026
- **Tagline:** A satirical bestseller-list platform where rankings are openly
  bought — built, launched, and operated as a real company.
- **Bullets:**
  1. Designed, built, and launched a production SaaS end-to-end — weekly-updated,
     genre-specific bestseller lists with bid-based placement, week-by-week
     archives, and social sharing.
  2. Implemented full user management with Google and Apple OAuth — account
     creation, sessions, and profile flows.
  3. Integrated Stripe for payment processing of ranked placements — checkout,
     billing, and webhook-driven fulfillment.
  4. Formed a registered LLC and operate the product as a real business — legal
     disclaimers, analytics, and affiliate monetization.

Framing decision: straight technical (professional tone; the satire speaks for
itself via the link).

## Changes

1. **`resume-data.js`** — add a `projects` array to `RESUME_META` (same pattern
   as `highlights`/`certifications`). Must stay valid JSON — `make_resume.py`
   parses it with `json.loads`.
2. **`index.html`** — replace `.projects-placeholder` with an empty
   `#projects-list` container; bump the contact CTA meta line to
   "Updated Jul 2026 · PDF".
3. **`app.js`** — render `m.projects` in `renderStatic()`, mirroring the
   certs/highlights rendering.
4. **`styles.css`** — replace `.projects-placeholder` styles with
   `.project*` styles mirroring `.highlight`/`.cert` (grid row, display title,
   mono role line, dash bullets in accent). Add `.project-title a` to the
   shared inline-link underline affordance.
5. **`make_resume.py`** — replace the "06 PROJECTS — COMING SOON" placeholder
   with a loop over `meta["projects"]` using the existing Experience typography
   (title + right-tab year, mono role · domain line, dash bullets).
6. **Regenerate** — run `make_resume.py` (DOCX), convert DOCX → PDF via Word
   COM automation on this machine, both into `uploads/`.

## Out of scope

- No map/TIMELINE stop for kytimes.ai (the map is jobs/education locations).
- No changes to competencies, skills, or summary.
