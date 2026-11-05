"""pdftotext on the one-page resume must read like an ATS file."""
from __future__ import annotations

import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import make_resume as mr  # noqa: E402


def _pdf_from_docx(docx: Path) -> Path:
    profile = docx.parent / "lo-profile"
    profile.mkdir(exist_ok=True)
    subprocess.check_call(
        [
            "soffice",
            f"-env:UserInstallation={profile.resolve().as_uri()}",
            "--headless",
            "--norestore",
            "--convert-to",
            "pdf",
            "--outdir",
            str(docx.parent),
            str(docx),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return docx.with_suffix(".pdf")


class ResumePdfTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        docx = Path(cls._tmp.name) / "resume.docx"
        timeline, meta = mr.load_data()
        orig = mr.OUTPUT
        mr.OUTPUT = docx
        try:
            mr.build_document(timeline, meta, compact=True)
        finally:
            mr.OUTPUT = orig
        cls.meta = meta
        cls.pdf = _pdf_from_docx(docx)
        cls.text = subprocess.check_output(["pdftotext", str(cls.pdf), "-"], text=True)
        cls.info = subprocess.check_output(["pdfinfo", str(cls.pdf)], text=True)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def test_stays_one_page(self):
        self.assertRegex(self.info, r"Pages:\s+1\b")
        self.assertIn("Title:           Efrain Plascencia - Resume", self.info)
        self.assertIn("Author:          Efrain Plascencia", self.info)

    def test_pdftotext_reads_name_headings_and_skills(self):
        lines = [line.strip() for line in self.text.splitlines() if line.strip()]
        self.assertEqual(lines[0], "Efrain Plascencia")
        self.assertNotRegex(self.text, r"\d{3}[.\-*]\d{3}[.\-*]?\d{4}")
        self.assertNotIn("213", self.text)
        for heading in ("Professional Summary", "Experience", "Education", "Technical Skills"):
            self.assertIn(heading, self.text)
        flat = re.sub(r"\s+", " ", self.text)
        for line in (
            "Director of AI Deployment & Solutions, Apr 2025 - Present",
            "Head of Business Development and Engineering, Apr 2024 - Mar 2025",
            "OTA Test Manager, Apr 2023 - Mar 2024",
        ):
            self.assertIn(line, flat)
        for label, body in self.meta["resumeSkills"].items():
            rendered = label.upper()
            self.assertLess(flat.find(rendered), flat.find(body), rendered)
            self.assertNotEqual(flat.find(body), -1, body)
        for line in self.text.splitlines():
            self.assertNotEqual(line.strip(), "·")


if __name__ == "__main__":
    unittest.main()
