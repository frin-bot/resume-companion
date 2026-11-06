"""Sample only: Mercedes entry with the logo left of the title and company lines.

Uses the same path as the resume: python-docx, then LibreOffice to PDF.
Does not write uploads/Efrain_Plascencia_Resume.docx or .pdf.

    python scripts/mercedes_logo_sample.py
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import make_resume as mr  # noqa: E402

OUT_DIR = ROOT / "variants"
SAMPLE_DOCX = OUT_DIR / "mercedes-sample.docx"
SAMPLE_PDF = OUT_DIR / "mercedes-sample.pdf"
SAMPLE_PNG = OUT_DIR / "mercedes-sample.png"
CHECK_PNG = OUT_DIR / "logos-check.png"
PAGE_WIDTH_IN = 8.5
# Same text width as the one-page resume (0.5in margins).
MARGIN_X_IN = 0.5
CONTENT_WIDTH_IN = PAGE_WIDTH_IN - 2 * MARGIN_X_IN
GAP_PT = 6.0  # air between the mark and the title, applied as text indent


def _mercedes():
    timeline, _meta = mr.load_data()
    return next(item for item in timeline if item["org"] == "Mercedes-Benz R&D North America")


def _section(doc, height_in, top_in=0.2, bottom_in=0.15):
    section = doc.sections[0]
    section.page_width = Inches(PAGE_WIDTH_IN)
    section.page_height = Inches(height_in)
    section.left_margin = Inches(MARGIN_X_IN)
    section.right_margin = Inches(MARGIN_X_IN)
    section.top_margin = Inches(top_in)
    section.bottom_margin = Inches(bottom_in)
    section.header_distance = Inches(0.1)
    section.footer_distance = Inches(0.1)
    return section


def _write(doc, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(path))


def _pdf(docx: Path) -> Path:
    return mr.export_docx_to_pdf(docx)


def _ink_box(pdf: Path, dpi: int = 144):
    """Return (x0, y0, x1, y1, width, height) of nonwhite pixels, in points."""
    with tempfile.TemporaryDirectory() as tmp:
        stem = Path(tmp) / "page"
        subprocess.check_call(
            ["pdftoppm", "-png", "-r", str(dpi), "-f", "1", "-l", "1", str(pdf), str(stem)],
            stdout=subprocess.DEVNULL,
        )
        image = Image.open(next(Path(tmp).glob("page*.png"))).convert("RGB")
        pixels = image.load()
        width, height = image.size
        minx, miny, maxx, maxy = width, height, -1, -1
        for y in range(height):
            for x in range(width):
                r, g, b = pixels[x, y]
                if r < 250 or g < 250 or b < 250:
                    if x < minx:
                        minx = x
                    if y < miny:
                        miny = y
                    if x > maxx:
                        maxx = x
                    if y > maxy:
                        maxy = y
        if maxx < 0:
            raise RuntimeError(f"no ink in {pdf}")
        scale = 72 / dpi
        box = (
            minx * scale,
            miny * scale,
            (maxx + 1) * scale,
            (maxy + 1) * scale,
        )
        return box, image


def _add_title_company(container, item, left_indent_pt=0):
    """Title + dates, then the company line, in the resume's compact style."""
    head = container.add_paragraph()
    head.paragraph_format.space_before = Pt(0)
    head.paragraph_format.space_after = Pt(0)
    head.paragraph_format.line_spacing = 1.0
    if left_indent_pt:
        head.paragraph_format.left_indent = Pt(left_indent_pt)
    title = head.add_run(mr.format_resume_title(item["title"]))
    mr.set_font(title, mr.FF_DISPLAY, 11.5, mr.INK, bold=False)
    dates = head.add_run(", " + mr.format_resume_dates(item["dates"]))
    mr.set_font(dates, mr.FF_DISPLAY, 11.5, mr.INK_3, bold=False)

    meta = container.add_paragraph()
    meta.paragraph_format.space_before = Pt(0)
    meta.paragraph_format.space_after = Pt(1)
    meta.paragraph_format.line_spacing = 1.0
    if left_indent_pt:
        meta.paragraph_format.left_indent = Pt(left_indent_pt)
    org = meta.add_run(mr.format_org_line(item["org"], item["city"]))
    mr.set_font(org, mr.FF_MONO, 8, mr.INK_2, bold=False)
    return head, meta


def _add_bullets(doc, item):
    bullets = item["resumeBullets"] if "resumeBullets" in item else item.get("bullets", [])
    for bullet in bullets:
        mr.add_bullet(doc, mr.plain_bullet(bullet), compact=True)


def _raster_logo(src: Path, dest: Path, height_pt: float) -> float:
    """Ink mark of `height_pt`, with a gap on the right. Returns width in points."""
    if src.suffix.lower() == ".svg":
        raw_file = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        raw_file.close()
        raw = Path(raw_file.name)
        try:
            mr._svg_to_png(src, raw, height_px=640)
            with Image.open(raw) as opened:
                image = opened.convert("RGBA")
        finally:
            raw.unlink(missing_ok=True)
    else:
        with Image.open(src) as opened:
            image = opened.convert("RGBA")
    _r, _g, _b, alpha = image.split()
    ink = Image.new("RGBA", image.size, (0x1A, 0x1A, 0x1A, 0))
    ink.putalpha(alpha)
    bbox = ink.getbbox()
    if bbox:
        ink = ink.crop(bbox)
    target_h = max(1, round(height_pt * mr.LOGO_PX_PER_PT))
    target_w = max(1, round(ink.width * (target_h / ink.height)))
    ink = ink.resize((target_w, target_h), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    ink.save(dest, "PNG", optimize=True)
    return target_w / mr.LOGO_PX_PER_PT


def build_header_probe(item, path: Path):
    doc = Document()
    _section(doc, 2.0, top_in=0.15, bottom_in=0.1)
    _add_title_company(doc, item)
    _write(doc, path)


def build_current_entry(item, path: Path):
    """The entry as the one-page resume draws it: no side logo."""
    doc = Document()
    _section(doc, 3.0)
    mr.add_compact_role(doc, item, before=0)
    _write(doc, path)


def _anchor_logo_left(paragraph, image_path, height_pt, width_pt):
    """Float the mark at the left of the column. A table cell was clipping it.

    LibreOffice clips an inline picture to the cell's content box, and the
    default table style keeps side padding even when the cell margin is 0.
    The name glow already uses a floating drawing, so this is the same path.
    """
    run = paragraph.add_run()
    run.bold = False
    run.add_picture(str(image_path), width=Pt(width_pt), height=Pt(height_pt))
    drawing = run._element.find(qn("w:drawing"))
    inline = drawing.find(qn("wp:inline"))
    extent = inline.find(qn("wp:extent"))
    cx, cy = extent.get("cx"), extent.get("cy")
    doc_pr = inline.find(qn("wp:docPr"))
    for el in drawing.iter():
        if el.tag.endswith("docPr") or el.tag.endswith("cNvPr"):
            el.set("descr", "")
            el.set("name", "")
    graphic = inline.find(qn("a:graphic"))

    anchor = OxmlElement("wp:anchor")
    for attr, val in {
        "distT": "0",
        "distB": "0",
        "distL": "0",
        "distR": str(int(GAP_PT * 12700)),
        "simplePos": "0",
        "relativeHeight": "251658240",
        "behindDoc": "0",
        "locked": "0",
        "layoutInCell": "1",
        "allowOverlap": "1",
    }.items():
        anchor.set(attr, val)
    simple = OxmlElement("wp:simplePos")
    simple.set("x", "0")
    simple.set("y", "0")
    anchor.append(simple)
    pos_h = OxmlElement("wp:positionH")
    pos_h.set("relativeFrom", "column")
    off_h = OxmlElement("wp:posOffset")
    off_h.text = "0"
    pos_h.append(off_h)
    anchor.append(pos_h)
    pos_v = OxmlElement("wp:positionV")
    pos_v.set("relativeFrom", "paragraph")
    off_v = OxmlElement("wp:posOffset")
    off_v.text = "0"
    pos_v.append(off_v)
    anchor.append(pos_v)
    ext = OxmlElement("wp:extent")
    ext.set("cx", cx)
    ext.set("cy", cy)
    anchor.append(ext)
    effect = OxmlElement("wp:effectExtent")
    for side in ("l", "t", "r", "b"):
        effect.set(side, "0")
    anchor.append(effect)
    wrap = OxmlElement("wp:wrapSquare")
    wrap.set("wrapText", "bothSides")
    anchor.append(wrap)
    anchor.append(doc_pr)
    c_nv = inline.find(qn("wp:cNvGraphicFramePr"))
    if c_nv is not None:
        anchor.append(c_nv)
    anchor.append(graphic)
    drawing.remove(inline)
    drawing.append(anchor)


def build_sample(item, path: Path, logo_path: Path, logo_height_pt: float, logo_width_pt: float, page_height_in: float):
    doc = Document()
    _section(doc, page_height_in, top_in=0.16, bottom_in=0.1)
    head, _meta = _add_title_company(doc, item, left_indent_pt=logo_width_pt + GAP_PT)
    _anchor_logo_left(head, logo_path, logo_height_pt, logo_width_pt)
    _add_bullets(doc, item)
    _write(doc, path)


def _page_count(pdf: Path) -> int:
    info = subprocess.check_output(["pdfinfo", str(pdf)], text=True)
    for line in info.splitlines():
        if line.startswith("Pages:"):
            return int(line.split()[1])
    return 0


def _render_png(pdf: Path, dest: Path, dpi: int = 216):
    box, _image = _ink_box(pdf, dpi=dpi)
    with tempfile.TemporaryDirectory() as tmp:
        stem = Path(tmp) / "page"
        subprocess.check_call(
            ["pdftoppm", "-png", "-r", str(dpi), "-f", "1", "-l", "1", str(pdf), str(stem)],
            stdout=subprocess.DEVNULL,
        )
        image = Image.open(next(Path(tmp).glob("page*.png"))).convert("RGB")
    scale = dpi / 72
    pad = int(round(8 * scale / 3))  # a few points of white around the ink
    x0 = max(0, int(box[0] * scale) - pad)
    y0 = max(0, int(box[1] * scale) - pad)
    x1 = min(image.width, int(box[2] * scale) + pad)
    y1 = min(image.height, int(box[3] * scale) + pad)
    cropped = image.crop((x0, y0, x1, y1))
    dest.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(dest, "PNG")
    return cropped.size


def _body_slack_pt(pdf: Path) -> tuple[float, float]:
    """Points from the last full-width body ink to the footer, and to the page bottom.

    The footer QR sits in the right side of the bottom margin. Body lines span
    most of the page width.
    """
    dpi = 72
    with tempfile.TemporaryDirectory() as tmp:
        stem = Path(tmp) / "page"
        subprocess.check_call(
            ["pdftoppm", "-png", "-r", str(dpi), str(pdf), str(stem)],
            stdout=subprocess.DEVNULL,
        )
        image = Image.open(next(Path(tmp).glob("page*.png"))).convert("RGB")
    pixels = image.load()
    width, height = image.size
    body_bottom = 0
    footer_top = height
    for y in range(height):
        dark_left = 0
        dark_right = 0
        for x in range(40, int(width * 0.55)):
            r, g, b = pixels[x, y]
            if r + g + b < 520:
                dark_left += 1
        for x in range(int(width * 0.75), width - 20):
            r, g, b = pixels[x, y]
            if r + g + b < 520:
                dark_right += 1
        if dark_left > 12:
            body_bottom = y
        if dark_right > 8 and dark_left < 4 and y > height * 0.7:
            footer_top = min(footer_top, y)
    # pdftoppm pixels are 1pt at 72 dpi.
    slack_to_footer = footer_top - body_bottom
    slack_to_page = height - body_bottom
    return float(slack_to_footer), float(slack_to_page)


def _append_mark_row(doc, item, logo_path, logo_height, logo_width):
    head, _meta = _add_title_company(doc, item, left_indent_pt=logo_width + GAP_PT)
    _anchor_logo_left(head, logo_path, logo_height, logo_width)
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_before = Pt(8)
    spacer.paragraph_format.space_after = Pt(0)


def main():
    item = _mercedes()
    work = Path(tempfile.mkdtemp(prefix="mercedes-sample-"))
    probe_docx = work / "header.docx"
    build_header_probe(item, probe_docx)
    probe_pdf = _pdf(probe_docx)
    header_box, _img = _ink_box(probe_pdf, dpi=144)
    logo_height = header_box[3] - header_box[1]
    logo_png = work / "mercedes.png"
    logo_width = _raster_logo(ROOT / item["logo"], logo_png, logo_height)

    sample_docx = work / "sample.docx"
    build_sample(item, sample_docx, logo_png, logo_height, logo_width, page_height_in=2.6)
    sample_pdf = _pdf(sample_docx)
    if _page_count(sample_pdf) != 1:
        raise SystemExit(f"sample spilled to {_page_count(sample_pdf)} pages")
    sample_box, _img = _ink_box(sample_pdf, dpi=144)
    sample_h = sample_box[3] - sample_box[1]

    current_docx = work / "current.docx"
    build_current_entry(item, current_docx)
    current_pdf = _pdf(current_docx)
    current_box, _img = _ink_box(current_pdf, dpi=144)
    current_h = current_box[3] - current_box[1]
    delta = sample_h - current_h

    # Rebuild the delivered PDF tight to the entry. Size from the ink's
    # bottom on the probe page, plus the bottom margin, so the line box
    # under the last bullet is not clipped.
    bottom_in = 0.12
    page_h = (sample_box[3] / 72) + bottom_in + 0.04
    build_sample(item, SAMPLE_DOCX, logo_png, logo_height, logo_width, page_h)
    delivered = _pdf(SAMPLE_DOCX)
    if delivered != SAMPLE_PDF:
        raise SystemExit(f"expected {SAMPLE_PDF}, got {delivered}")
    if _page_count(SAMPLE_PDF) != 1:
        raise SystemExit("tight sample is not one page")

    text = subprocess.check_output(["pdftotext", str(SAMPLE_PDF), "-"], text=True)
    flat = " ".join(text.split())
    expected = [
        "End-to-End Quality Engineer",
        "Mar 2017 - Mar 2020",
        "Mercedes-Benz R&D North America",
        "Led end-to-end testing",
    ]
    positions = []
    cursor = 0
    for phrase in expected:
        at = flat.find(phrase, cursor)
        if at < 0:
            raise SystemExit(f"missing from pdftotext: {phrase}\n---\n{text}")
        positions.append(at)
        cursor = at + len(phrase)
    if "Mercedes" in text and "Mercedes-Benz R&D North America" not in text:
        raise SystemExit("company name is not real text")

    png_size = _render_png(SAMPLE_PDF, SAMPLE_PNG, dpi=216)
    slack_footer, slack_page = _body_slack_pt(ROOT / "uploads" / "Efrain_Plascencia_Resume.pdf")

    timeline, _meta = mr.load_data()
    by_org = {entry["org"]: entry for entry in timeline}
    order = [
        "GEMMACON North America",
        "PACCAR",
        "Toyota Motor North America",
        "Hyundai Autoever Telematics America",
        "California State University, Long Beach",
        "Mercedes-Benz R&D North America",
    ]
    check_doc = Document()
    _section(check_doc, 4.6, top_in=0.22, bottom_in=0.15)
    for org in order:
        entry = by_org[org]
        png = work / f"{Path(entry['logo']).stem}.png"
        width = _raster_logo(ROOT / entry["logo"], png, logo_height)
        _append_mark_row(
            check_doc,
            {
                "title": entry["title"],
                "dates": entry["dates"],
                "org": entry["org"],
                "city": entry.get("city") or "",
            },
            png,
            logo_height,
            width,
        )
    check_docx = work / "logos-check.docx"
    _write(check_doc, check_docx)
    check_pdf = _pdf(check_docx)
    if _page_count(check_pdf) != 1:
        raise SystemExit(f"logo check spilled to {_page_count(check_pdf)} pages")
    _render_png(check_pdf, CHECK_PNG, dpi=160)

    print(f"logo height (two lines): {logo_height:.2f} pt")
    print(f"logo width: {logo_width:.2f} pt")
    print(f"current entry height: {current_h:.2f} pt")
    print(f"sample entry height: {sample_h:.2f} pt")
    print(f"delta per entry: {delta:.2f} pt")
    print(f"six entries: {6 * delta:.2f} pt")
    print(f"body slack to footer: {slack_footer:.1f} pt")
    print(f"body slack to page edge: {slack_page:.1f} pt")
    print(f"png: {SAMPLE_PNG} {png_size}")
    print(f"pdf: {SAMPLE_PDF}")
    print(f"check: {CHECK_PNG}")
    print("--- pdftotext ---")
    print(text.rstrip())
    print("--- order ---")
    print("ok", positions)


if __name__ == "__main__":
    main()
