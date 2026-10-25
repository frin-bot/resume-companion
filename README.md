# Resume Companion

A scroll-driven companion resume site. Static files, no framework.

**Live:** https://www.efrain.me

## Structure

```
index.html                              fully self-contained — CSS, JS, resume
                                        data, and US-states GeoJSON all inlined
uploads/Efrain_Plascencia_Resume.docx   linked from the "Download resume" buttons
```

The only external request is to Google Fonts (Inter, Inter Tight, JetBrains Mono).

## Local preview

No tooling needed — open `index.html` in a browser. For correct relative-path
behavior on the resume download:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to Vercel

### CLI

```bash
npm i -g vercel
vercel           # preview
vercel --prod    # production
```

### Or via GitHub integration

1. Push this repo to GitHub (steps below).
2. Go to https://vercel.com/new and import the repo.
3. Framework: **Other** (Vercel auto-detects).
4. Click **Deploy**. Future pushes to `main` auto-deploy.

## Push to GitHub

From the project root:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main

# Create an empty repo on GitHub first (no README, no .gitignore),
# then copy the URL it gives you:
git remote add origin git@github.com:<your-username>/<repo-name>.git
git push -u origin main
```

Or if you have the [GitHub CLI](https://cli.github.com/) installed, the
whole thing is one command:

```bash
gh repo create resume-companion --public --source=. --remote=origin --push
```

## Editing content

Resume content lives in `resume-data.js`. After changing it, regenerate the
static HTML (this is also the Vercel build command):

```bash
node scripts/build-static.mjs
```

`node scripts/build-static.mjs --check` fails if `index.html` or
`manifest.webmanifest` has drifted from the data.

To replace the downloadable resume, swap the file in `uploads/` and
update both `href="uploads/..."` references in `index.html` if you
rename it.
