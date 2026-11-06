"""The one-page resume keeps its text and adds a fixed logo column."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import make_resume as mr  # noqa: E402


def _para_text(p) -> str:
    from docx.oxml.ns import qn

    chunks = []
    for child in p._p:
        if child.tag == qn("w:r"):
            chunks.append("".join(t.text or "" for t in child.findall(qn("w:t"))))
        elif child.tag == qn("w:hyperlink"):
            chunks.append("".join(t.text or "" for t in child.findall(".//" + qn("w:t"))))
    return "".join(chunks)


def _docx_text(path: Path) -> str:
    from docx import Document

    doc = Document(str(path))
    parts = [_para_text(p) for p in doc.paragraphs]
    for section in doc.sections:
        parts.extend(_para_text(p) for p in section.footer.paragraphs)
    return "\n".join(parts)


class ResumeLogoTests(unittest.TestCase):
    def setUp(self):
        self.timeline, self.meta = mr.load_data()
        self._tmp = tempfile.TemporaryDirectory()
        self.out = Path(self._tmp.name) / "resume.docx"
        self._orig = mr.OUTPUT

    def tearDown(self):
        mr.OUTPUT = self._orig
        self._tmp.cleanup()

    def _build(self, path: Path, timeline=None, **kwargs):
        mr.OUTPUT = path
        mr.build_document(timeline if timeline is not None else self.timeline, self.meta, **kwargs)

    def test_compact_text_keeps_title_dates_company_bullet_order(self):
        self._build(self.out, compact=True)
        flat = " ".join(_docx_text(self.out).split())
        title = flat.find("End-to-End Quality Engineer")
        dates = flat.find("Mar 2017 - Mar 2020")
        company = flat.find("Mercedes-Benz R&D North America, Long Beach, CA")
        bullet = flat.find("Led end-to-end testing")
        self.assertTrue(0 <= title < dates < company < bullet)
        self.assertIn("Director of AI Deployment & Solutions, Apr 2025 - Present", flat)
        self.assertIn("California State University, Long Beach", flat)
        self.assertIn("www.frin.bot", flat)
        self.assertNotIn("213", flat)

    def test_header_lines_share_one_indent_and_each_entry_has_one_mark(self):
        from docx import Document
        from docx.oxml.ns import qn
        from docx.shared import Pt

        self._build(self.out, compact=True)
        doc = Document(str(self.out))
        indent = Pt(mr.LOGO_TEXT_INDENT_PT)
        org_lines = {mr.format_org_line(item["org"], item["city"]) for item in self.timeline}
        first_titles = set()
        later_titles = set()
        for item in self.timeline:
            if item.get("promotions"):
                titles = [mr.format_resume_title(p["title"]) for p in reversed(item["promotions"])]
                first_titles.add(titles[0])
                later_titles.update(titles[1:])
            else:
                first_titles.add(mr.format_resume_title(item["title"]))
        seen_orgs = set()
        seen_first = set()
        for paragraph in doc.paragraphs:
            text = _para_text(paragraph)
            anchors = paragraph._p.findall(".//" + qn("wp:anchor"))
            if text in org_lines:
                seen_orgs.add(text)
                self.assertEqual(paragraph.paragraph_format.left_indent, indent, text)
                self.assertEqual(anchors, [], text)
            elif any(text.startswith(title + ",") for title in first_titles):
                seen_first.add(next(title for title in first_titles if text.startswith(title + ",")))
                self.assertEqual(paragraph.paragraph_format.left_indent, indent, text)
                self.assertEqual(len(anchors), 1, text)
                for doc_pr in paragraph._p.findall(".//" + qn("wp:docPr")):
                    self.assertFalse(doc_pr.get("descr"))
            elif any(text.startswith(title + ",") for title in later_titles):
                self.assertEqual(paragraph.paragraph_format.left_indent, indent, text)
                self.assertEqual(anchors, [], text)
        self.assertEqual(seen_orgs, org_lines)
        self.assertEqual(seen_first, first_titles)
        for paragraph in doc.paragraphs:
            text = _para_text(paragraph)
            if text.startswith("• "):
                self.assertNotEqual(paragraph.paragraph_format.left_indent, indent)

    def test_logo_offset_includes_the_title_space_before(self):
        """The mark is centered on the two header lines, not on the spacing above them."""
        from docx import Document
        from docx.oxml.ns import qn

        self._build(self.out, compact=True)
        doc = Document(str(self.out))
        expected = {
            "Director of AI Deployment & Solutions,": mr.logo_anchor_space(
                mr.COMPACT_AFTER_HEADING, mr.COMPACT_HEADING_AFTER
            )
            + mr.GEMMACON_BLOCK_CENTER_NUDGE_PT,
            "Lead Test Engineer,": mr.logo_anchor_space(mr.COMPACT_ROLE_BEFORE),
            "End-to-End Quality Engineer,": mr.logo_anchor_space(mr.COMPACT_ROLE_BEFORE),
            "Bachelor of Science,": mr.logo_anchor_space(
                mr.COMPACT_AFTER_HEADING, mr.COMPACT_HEADING_AFTER
            ),
        }
        seen = set()
        for paragraph in doc.paragraphs:
            text = _para_text(paragraph)
            match = next((prefix for prefix in expected if text.startswith(prefix)), None)
            if match is None:
                continue
            seen.add(match)
            anchor = paragraph._p.find(".//" + qn("wp:anchor"))
            extent = anchor.find(qn("wp:extent"))
            height_pt = int(extent.get("cy")) / 12700
            offset_pt = int(anchor.find(".//" + qn("wp:positionV")).find(qn("wp:posOffset")).text) / 12700
            want = expected[match] + (mr.LOGO_COLUMN_PT - height_pt) / 2
            self.assertAlmostEqual(offset_pt, want, places=2, msg=text)
        self.assertEqual(seen, set(expected))

    def test_missing_logo_still_indents_and_keeps_the_name(self):
        from docx import Document
        from docx.oxml.ns import qn

        timeline = [dict(item) for item in self.timeline]
        for item in timeline:
            if item["org"] == "PACCAR":
                item["logo"] = "logos/does-not-exist.svg"
        self._build(self.out, timeline=timeline, compact=True)
        doc = Document(str(self.out))
        paccar_title = None
        toyota_title = None
        for paragraph in doc.paragraphs:
            text = _para_text(paragraph)
            if text.startswith("Lead Test Engineer,"):
                paccar_title = paragraph
            elif text.startswith("Senior Test Engineer,"):
                toyota_title = paragraph
            elif text == "PACCAR, Lewisville, TX":
                self.assertNotIn("drawing", text)
        self.assertIsNotNone(paccar_title)
        self.assertEqual(len(paccar_title._p.findall(".//" + qn("wp:anchor"))), 0)
        self.assertEqual(len(toyota_title._p.findall(".//" + qn("wp:anchor"))), 1)

    def test_full_document_does_not_use_the_logo_column(self):
        from docx import Document
        from docx.oxml.ns import qn
        from docx.shared import Pt

        self._build(self.out, compact=False)
        doc = Document(str(self.out))
        for paragraph in doc.paragraphs:
            text = _para_text(paragraph)
            if "Lead Test Engineer" not in text:
                continue
            self.assertNotEqual(paragraph.paragraph_format.left_indent, Pt(mr.LOGO_TEXT_INDENT_PT))
            self.assertEqual(paragraph._p.findall(".//" + qn("wp:anchor")), [])
            break
        else:
            self.fail("full resume is missing the PACCAR title")

    def test_default_output_is_the_site_resume(self):
        path, compact, logos = mr.resolve_resume_build([])
        self.assertEqual(path, ROOT / "uploads" / "Efrain_Plascencia_Resume.docx")
        self.assertTrue(compact)
        self.assertTrue(logos)
        full, compact_full, logos_full = mr.resolve_resume_build(["--full"])
        self.assertEqual(full, path)
        self.assertFalse(compact_full)
        self.assertFalse(logos_full)


if __name__ == "__main__":
    unittest.main()
