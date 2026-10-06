"""TDD: companion resume renders as a 1-page compact document.

These tests inspect the generated .docx (no Word/PDF required) so they can
fail before the compact path exists.
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import make_resume as mr  # noqa: E402


def _docx_text(path: Path) -> str:
    from docx import Document

    doc = Document(str(path))
    parts = []
    for p in doc.paragraphs:
        parts.append(p.text)
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                parts.append(cell.text)
    for section in doc.sections:
        for p in section.footer.paragraphs:
            parts.append(p.text)
    return "\n".join(parts)


def _inline_shape_count(path: Path) -> int:
    from docx import Document
    from docx.oxml.ns import qn

    doc = Document(str(path))
    n = len(doc.inline_shapes)
    for section in doc.sections:
        n += len(section.footer._element.findall(".//" + qn("w:drawing")))
    return n


class CompactResumeTests(unittest.TestCase):
    def setUp(self):
        self.timeline, self.meta = mr.load_data()
        self._tmp = tempfile.TemporaryDirectory()
        self.out = Path(self._tmp.name) / "resume.docx"
        self._orig_output = mr.OUTPUT
        mr.OUTPUT = self.out

    def tearDown(self):
        mr.OUTPUT = self._orig_output
        self._tmp.cleanup()

    def test_load_data_exposes_resume_only_fields(self):
        self.assertIn("resumeSummary", self.meta)
        self.assertTrue(self.meta["resumeSummary"].strip())
        self.assertLess(len(self.meta["resumeSummary"]), len(self.meta["summary"]))
        self.assertIn("resumeCompetencies", self.meta)
        self.assertGreaterEqual(len(self.meta["resumeCompetencies"]), 6)
        self.assertLess(len(self.meta["resumeCompetencies"]), len(self.meta["competencies"]))
        gemmacon = next(i for i in self.timeline if i["org"].startswith("GEMMACON"))
        self.assertEqual(len(gemmacon["resumeBullets"]), 3)
        paccar = next(i for i in self.timeline if i["org"] == "PACCAR")
        self.assertEqual(len(paccar["resumeBullets"]), 1)
        edu = next(i for i in self.timeline if i.get("type") == "education")
        self.assertEqual(edu.get("resumeBullets"), [])

    def test_compact_omits_kytimes_and_competency_table(self):
        mr.build_document(self.timeline, self.meta, compact=True)
        text = _docx_text(self.out)
        self.assertNotIn("kytimes", text.lower())
        self.assertNotIn("Knew York", text)
        self.assertNotIn("Agentic AI Systems & Workflows", text)
        self.assertIn("Director of AI Deployment & Solutions", text)
        self.assertIn("MIT xPRO", text)
        self.assertRegex(text, r"(?i)companion site")
        self.assertGreaterEqual(_inline_shape_count(self.out), 2)
        self.assertIn("Mercedes-Benz R&D North America", text)
        self.assertIn(self.meta["resumeSummary"][:40], text)
        self.assertIn(self.meta["name"], text)
        self.assertNotIn("haven't articulated", text)

    def test_default_build_still_includes_projects_for_job_search(self):
        mr.build_document(self.timeline, self.meta)
        text = _docx_text(self.out)
        self.assertIn("Knew York", text)
        self.assertIn("Agentic AI Systems & Workflows", text)


if __name__ == "__main__":
    unittest.main()
