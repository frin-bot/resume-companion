"""Logo variant keeps selectable resume text and adds inline decorative marks."""
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


def _run_kinds(paragraph) -> list[str]:
    """Order of text vs inline drawings in a paragraph."""
    from docx.oxml.ns import qn

    kinds = []
    for child in paragraph._p:
        if child.tag != qn("w:r"):
            continue
        if "".join(t.text or "" for t in child.findall(qn("w:t"))):
            kinds.append("text")
        if child.find(qn("w:drawing")) is not None:
            kinds.append("drawing")
    return kinds


class ResumeLogoTests(unittest.TestCase):
    def setUp(self):
        self.timeline, self.meta = mr.load_data()
        self._tmp = tempfile.TemporaryDirectory()
        self.plain = Path(self._tmp.name) / "plain.docx"
        self.logos = Path(self._tmp.name) / "logos.docx"
        self._orig = mr.OUTPUT

    def tearDown(self):
        mr.OUTPUT = self._orig
        self._tmp.cleanup()

    def _build(self, path: Path, timeline=None, **kwargs):
        mr.OUTPUT = path
        mr.build_document(timeline if timeline is not None else self.timeline, self.meta, **kwargs)

    def test_logo_variant_text_matches_compact_resume(self):
        self._build(self.plain, compact=True)
        self._build(self.logos, compact=True, logos=True)
        self.assertEqual(_docx_text(self.plain), _docx_text(self.logos))
        from docx import Document

        doc = Document(str(self.logos))
        self.assertEqual(doc.core_properties.title, "Efrain Plascencia - Resume")
        self.assertEqual(doc.core_properties.author, "Efrain Plascencia")
        self.assertEqual(len(doc.tables), 0)

    def test_each_org_line_gets_one_inline_decorative_logo(self):
        self._build(self.logos, compact=True, logos=True)
        from docx import Document
        from docx.oxml.ns import qn

        doc = Document(str(self.logos))
        org_lines = {mr.format_org_line(item["org"], item["city"]) for item in self.timeline}
        seen = set()
        for paragraph in doc.paragraphs:
            text = _para_text(paragraph)
            if text not in org_lines:
                continue
            seen.add(text)
            self.assertEqual(_run_kinds(paragraph), ["text", "drawing"], text)
            self.assertEqual(len(paragraph._p.findall(".//" + qn("wp:anchor"))), 0, text)
            for doc_pr in paragraph._p.findall(".//" + qn("wp:docPr")):
                self.assertFalse(doc_pr.get("descr"), text)
                self.assertNotIn(text.split(",")[0], doc_pr.get("name") or "", text)
            for run in paragraph.runs:
                self.assertFalse(run.bold, text)
        self.assertEqual(seen, org_lines)

    def test_title_lines_stay_text_only(self):
        self._build(self.logos, compact=True, logos=True)
        from docx import Document

        doc = Document(str(self.logos))
        titles = []
        for item in self.timeline:
            if item.get("promotions"):
                titles.extend(mr.format_resume_title(p["title"]) for p in item["promotions"])
            else:
                titles.append(mr.format_resume_title(item["title"]))
        found = 0
        for paragraph in doc.paragraphs:
            text = _para_text(paragraph)
            if any(text.startswith(title + ",") for title in titles):
                found += 1
                self.assertNotIn("drawing", _run_kinds(paragraph), text)
                self.assertIn("text", _run_kinds(paragraph), text)
        self.assertEqual(found, len(titles))

    def test_missing_logo_leaves_the_org_line_as_text(self):
        timeline = [dict(item) for item in self.timeline]
        for item in timeline:
            if item["org"] == "PACCAR":
                item["logo"] = "logos/does-not-exist.svg"
        self._build(self.logos, timeline=timeline, compact=True, logos=True)
        from docx import Document

        doc = Document(str(self.logos))
        paccar = mr.format_org_line("PACCAR", "Lewisville, TX")
        toyota = mr.format_org_line("Toyota Motor North America", "Plano, TX")
        seen = {}
        for paragraph in doc.paragraphs:
            text = _para_text(paragraph)
            if text in (paccar, toyota):
                seen[text] = _run_kinds(paragraph)
        self.assertEqual(seen[paccar], ["text"])
        self.assertEqual(seen[toyota], ["text", "drawing"])

    def test_default_compact_org_lines_have_no_logo(self):
        self._build(self.plain, compact=True)
        from docx import Document

        doc = Document(str(self.plain))
        org_lines = {mr.format_org_line(item["org"], item["city"]) for item in self.timeline}
        hits = 0
        for paragraph in doc.paragraphs:
            if _para_text(paragraph) in org_lines:
                hits += 1
                self.assertEqual(_run_kinds(paragraph), ["text"])
        self.assertEqual(hits, len(org_lines))

    def test_logos_flag_does_not_target_the_canonical_resume(self):
        path, compact, logos = mr.resolve_resume_build(["--logos"])
        self.assertTrue(logos)
        self.assertTrue(compact)
        self.assertEqual(path.name, "resume-logos.docx")
        self.assertNotEqual(path, ROOT / "uploads" / "Efrain_Plascencia_Resume.docx")
        plain, compact_default, logos_default = mr.resolve_resume_build([])
        self.assertFalse(logos_default)
        self.assertTrue(compact_default)
        self.assertEqual(plain, ROOT / "uploads" / "Efrain_Plascencia_Resume.docx")
        full, compact_full, logos_full = mr.resolve_resume_build(["--full"])
        self.assertFalse(logos_full)
        self.assertFalse(compact_full)
        self.assertEqual(full, plain)


if __name__ == "__main__":
    unittest.main()
