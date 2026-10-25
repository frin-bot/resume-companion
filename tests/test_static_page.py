"""The committed HTML must contain the resume, and stay in sync with resume-data.js."""
from __future__ import annotations

import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _esc(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _data():
    raw = subprocess.check_output(
        [
            "node",
            "--input-type=module",
            "-e",
            """
import fs from 'node:fs';
import vm from 'node:vm';
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('resume-data.js','utf8') + '\\nthis.TIMELINE=TIMELINE; this.RESUME_META=RESUME_META;', ctx);
console.log(JSON.stringify({ meta: ctx.RESUME_META, timeline: ctx.TIMELINE }));
""",
        ],
        cwd=ROOT,
        text=True,
    )
    return json.loads(raw)


class StaticPageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = _data()
        cls.html = (ROOT / "index.html").read_text()
        cls.manifest = json.loads((ROOT / "manifest.webmanifest").read_text())

    def test_committed_html_matches_resume_data(self):
        subprocess.check_call(["node", "scripts/build-static.mjs", "--check"], cwd=ROOT)

    def test_raw_html_contains_resume_content_without_javascript(self):
        meta = self.payload["meta"]
        html = self.html
        self.assertIn(_esc(meta["titleLine"]), html)
        self.assertIn(_esc(meta["summary"]), html)
        self.assertIn(_esc(meta["name"]), html)
        self.assertIn(f'<meta name="description" content="{_esc(meta["summary"])}">', html)
        self.assertIn(
            f'<meta property="og:title" content="{_esc(meta["name"] + " — " + meta["titleLine"])}">',
            html,
        )
        self.assertIn('property="og:description"', html)
        self.assertIn('name="twitter:description"', html)
        self.assertIn('application/ld+json', html)
        self.assertNotIn("open to", html.lower())
        self.assertNotIn("German", html)
        self.assertNotIn("Deutsch", html)
        for item in meta["competencies"]:
            self.assertIn(_esc(item), html)
        self.assertIn("Software Defined Vehicle", html)
        self.assertIn(_esc(meta["projects"][0]["tagline"]), html)
        self.assertIn("mailto:" + meta["email"], html)
        for lang in meta["languages"]:
            self.assertIn(lang["name"], html)
        self.assertEqual([lang["name"] for lang in meta["languages"]], ["English", "Spanish"])
        for stop in self.payload["timeline"]:
            self.assertIn(_esc(stop["title"]), html)
            self.assertIn(_esc(stop["org"]), html)
            for bullet in stop["bullets"]:
                self.assertIn(_esc(bullet), html)

    def test_manifest_description_matches_headline(self):
        self.assertEqual(self.manifest["description"], self.payload["meta"]["titleLine"])
        self.assertNotIn("Technical Lead", json.dumps(self.manifest))
        self.assertNotIn("German", json.dumps(self.manifest))


if __name__ == "__main__":
    unittest.main()
