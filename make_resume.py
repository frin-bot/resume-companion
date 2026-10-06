"""Generate Efrain_Plascencia_Resume.docx from the site's resume-data.js,
matching the site's Inter / swiss aesthetic."""
import json
import math
import re
from pathlib import Path

from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# Colors pulled from styles.css (:root light theme). Accent is the
# sRGB conversion of oklch(0.42 0.12 255).
INK = RGBColor(0x1A, 0x1A, 0x1A)
INK_2 = RGBColor(0x3A, 0x3A, 0x3A)
INK_3 = RGBColor(0x6A, 0x6A, 0x6A)
INK_4 = RGBColor(0xA8, 0xA5, 0xA0)
ACCENT = RGBColor(0x15, 0x4C, 0x8C)
RULE = RGBColor(0xDD, 0xD9, 0xD1)

FF_DISPLAY = "Inter Tight"
FF_BODY = "Inter"
FF_MONO = "JetBrains Mono"

ROOT = Path(__file__).parent
OUTPUT = ROOT / "uploads" / "Efrain_Plascencia_Resume.docx"
MEMOJI = ROOT / "memoji_standard_transparent.png"
MEMOJI_CIRCLE = ROOT / "_memoji_circle.png"
NAME_GLOW = ROOT / "_name_glow.png"
QR_IMAGE = ROOT / "qr_efrain_me.png"
COMPANION_URL = "https://www.efrain.me/"

# Site bg (--bg) and rule (--rule) from styles.css :root.
BG_COLOR = (0xF4, 0xF1, 0xEA, 255)
RULE_RGBA = (0xDD, 0xD9, 0xD1, 255)


def make_circular_memoji(src_path, out_path, size=600):
    """Bake the .floating-logo treatment around the memoji: circular --bg fill,
    1px --rule ring, memoji at 58/72 of the diameter (matching the site)."""
    src = Image.open(src_path).convert("RGBA")

    # Site ratios: 72px circle, 58px image, 1px border.
    inner_ratio = 58 / 72
    border_w = max(3, round(size / 72))  # ~1px scaled up; min 3 for crispness

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.ellipse([0, 0, size - 1, size - 1], fill=BG_COLOR)
    draw.ellipse([0, 0, size - 1, size - 1], outline=RULE_RGBA, width=border_w)

    inner = int(size * inner_ratio)
    resized = src.resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    canvas.alpha_composite(resized, (offset, offset))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path, "PNG")
    return out_path


# Same stops as the hero conic glow, starting at -30deg.
_AI_GLOW_STOPS = (
    (255, 59, 48),
    (255, 149, 0),
    (255, 214, 10),
    (52, 199, 89),
    (100, 210, 255),
    (10, 132, 255),
    (94, 92, 230),
    (191, 90, 242),
    (255, 59, 48),
)


def _inter_tight_regular():
    candidates = [
        Path.home() / "AppData/Local/Microsoft/Windows/Fonts/InterTight-Regular.ttf",
        Path(r"C:\Windows\Fonts\InterTight-Regular.ttf"),
        ROOT / "fonts" / "InterTight-Regular.ttf",
    ]
    for path in candidates:
        if path.is_file():
            return path
    return None


def _ai_glow_color(t):
    stops = _AI_GLOW_STOPS
    t = t % 1.0
    x = t * (len(stops) - 1)
    i = min(int(x), len(stops) - 2)
    f = x - i
    a, b = stops[i], stops[i + 1]
    return tuple(int(a[c] + (b[c] - a[c]) * f) for c in range(3))


def _blur_premultiplied(image, radius):
    """Blur like CSS: color fades out, it does not mix with black and turn grey."""
    src = image.load()
    width, height = image.size
    premult = Image.new("RGBA", image.size)
    dst = premult.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = src[x, y]
            if not a:
                continue
            dst[x, y] = (r * a // 255, g * a // 255, b * a // 255, a)
    blurred = premult.filter(ImageFilter.GaussianBlur(radius))
    src = blurred.load()
    result = Image.new("RGBA", image.size)
    dst = result.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = src[x, y]
            if not a:
                continue
            dst[x, y] = (min(255, r * 255 // a), min(255, g * 255 // a), min(255, b * 255 // a), a)
    return result


def _scale_around(mask, center, factor):
    cx, cy = center
    inv = 1 / factor
    return mask.transform(
        mask.size,
        Image.Transform.AFFINE,
        (inv, 0, cx - cx * inv, 0, inv, cy - cy * inv),
        resample=Image.Resampling.BICUBIC,
    )


def render_name_with_ai_glow(name, out_path, pt_size):
    """Raster of the name: ink letters, with the site's rainbow halo on "ai".

    Returns (path, width_inches) or None when the font or the "ai" pair is missing.
    """
    font_path = _inter_tight_regular()
    idx = name.find("ai")
    if font_path is None or idx < 0:
        return None

    scale = 8  # pixels per point, so the halo stays sharp in Word
    font = ImageFont.truetype(str(font_path), int(round(pt_size * scale)))
    prefix = name[:idx]
    ascent, descent = font.getmetrics()
    em = font.size
    blur_r = max(1, round(0.04 * em))
    pad = blur_r + int(math.ceil(em * 0.08))
    text_w = math.ceil(font.getlength(name))
    width = text_w + pad * 2
    height = ascent + descent + pad * 2
    baseline = pad + ascent
    origin = (pad, baseline)
    ink = (0x1A, 0x1A, 0x1A, 255)

    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).text(origin, name, font=font, fill=ink, anchor="ls")

    # Draw "ai" on its own. Punching it out of the full name leaves a faint
    # edge on every other letter, and that edge was catching the rainbow.
    ai_x = pad + font.getlength(prefix)
    mask = Image.new("L", (width, height), 0)
    ImageDraw.Draw(mask).text((ai_x, baseline), "ai", font=font, fill=255, anchor="ls")

    bbox = mask.getbbox()
    if bbox is None:
        return None
    glyph_cx = (bbox[0] + bbox[2]) / 2
    glyph_cy = (bbox[1] + bbox[3]) / 2
    glow_mask = _scale_around(mask, (glyph_cx, glyph_cy), 1.08)

    # Gradient is centered on the "ai" glyphs, slightly above midline, like the site.
    gcx = glyph_cx
    gcy = bbox[1] + (bbox[3] - bbox[1]) * 0.45
    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    src = glow_mask.load()
    dst = glow.load()
    for y in range(height):
        for x in range(width):
            alpha = src[x, y]
            if not alpha:
                continue
            ang = math.degrees(math.atan2(x - gcx, -(y - gcy)))
            color = _ai_glow_color((ang - (-30)) / 360)
            dst[x, y] = (*color, alpha)
    glow = _blur_premultiplied(glow, blur_r)

    # Light-mode site color: white letters, rainbow behind them.
    letters = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    ImageDraw.Draw(letters).text((ai_x, baseline), "ai", font=font, fill=(255, 255, 255, 255), anchor="ls")

    canvas.alpha_composite(glow)
    canvas.alpha_composite(letters)
    cropped = canvas.crop(canvas.getbbox())
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(out_path, "PNG")
    return out_path, cropped.width / (scale * 72)


def load_data():
    text = (ROOT / "resume-data.js").read_text(encoding="utf-8")
    timeline_match = re.search(r"const TIMELINE\s*=\s*(\[.*?\]);", text, re.DOTALL)
    meta_match = re.search(r"const RESUME_META\s*=\s*(\{.*?\});", text, re.DOTALL)
    timeline = json.loads(timeline_match.group(1))
    meta = json.loads(meta_match.group(1))
    return timeline, meta


def set_character_spacing(run, points):
    """w:spacing is in 20ths of a point."""
    rPr = run._element.get_or_add_rPr()
    spacing = OxmlElement("w:spacing")
    spacing.set(qn("w:val"), str(int(points * 20)))
    rPr.append(spacing)


def set_font(run, name, size_pt, color=INK, bold=False, italic=False):
    run.font.name = name
    run.font.size = Pt(size_pt)
    run.font.color.rgb = color
    run.bold = bold
    run.italic = italic
    # Also set east-asian and complex-script font so Word uses our font everywhere
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)
    rFonts.set(qn("w:ascii"), name)
    rFonts.set(qn("w:hAnsi"), name)
    rFonts.set(qn("w:cs"), name)
    rFonts.set(qn("w:eastAsia"), name)


def add_bottom_border(paragraph, color=RULE, size=4):
    pPr = paragraph._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(size))
    bottom.set(qn("w:space"), "4")
    bottom.set(qn("w:color"), f"{color[0]:02X}{color[1]:02X}{color[2]:02X}")
    pBdr.append(bottom)
    pPr.append(pBdr)


def section_label(doc, number, label, compact=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8 if compact else 16)
    p.paragraph_format.space_after = Pt(3 if compact else 6)
    num = p.add_run(f"{number}   ")
    set_font(num, FF_MONO, 8 if compact else 9, INK_4)
    set_character_spacing(num, 1.0)
    lbl = p.add_run(label.upper())
    set_font(lbl, FF_MONO, 8 if compact else 9, INK)
    set_character_spacing(lbl, 1.5)
    add_bottom_border(p, RULE)
    return p


def mono_line(doc, text, color=INK_3, size=8.5, space=1.0, after=0):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(after)
    r = p.add_run(text)
    set_font(r, FF_MONO, size, color)
    set_character_spacing(r, space)
    return p


def add_bullet(doc, text, compact=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(1 if compact else 2)
    p.paragraph_format.space_after = Pt(1 if compact else 2)
    p.paragraph_format.left_indent = Inches(0.18 if compact else 0.20)
    p.paragraph_format.first_line_indent = Inches(-0.18 if compact else -0.20)
    p.paragraph_format.line_spacing = 1.12 if compact else 1.0
    dash = p.add_run("— ")
    set_font(dash, FF_BODY, 9 if compact else 10, ACCENT)
    body = p.add_run(text)
    set_font(body, FF_BODY, 9 if compact else 10, INK_2)
    return p


def tab_right(paragraph, indent_inches=7.5):
    """Add a right-aligned tab stop at indent_inches."""
    pPr = paragraph._p.get_or_add_pPr()
    tabs = OxmlElement("w:tabs")
    tab = OxmlElement("w:tab")
    tab.set(qn("w:val"), "right")
    tab.set(qn("w:pos"), str(int(indent_inches * 1440)))  # 1440 twips per inch
    tabs.append(tab)
    pPr.append(tabs)


def add_compact_page_footer(section):
    """Pin the companion-site QR to the page footer, bottom-right — not a body section."""
    section.footer_distance = Inches(0.22)
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    p.add_run().add_picture(str(QR_IMAGE), width=Inches(0.52))
    cap = footer.add_paragraph()
    cap.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    cap.paragraph_format.space_before = Pt(1)
    cap.paragraph_format.space_after = Pt(0)
    label = cap.add_run("COMPANION SITE")
    set_font(label, FF_MONO, 6.5, INK_3)
    set_character_spacing(label, 0.8)


def add_compact_extras_strip(doc, extras):
    strip = doc.add_paragraph()
    strip.paragraph_format.space_before = Pt(6)
    strip.paragraph_format.space_after = Pt(0)
    strip.paragraph_format.line_spacing = 1.1
    pPr = strip._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    top = OxmlElement("w:top")
    top.set(qn("w:val"), "single")
    top.set(qn("w:sz"), "4")
    top.set(qn("w:space"), "4")
    top.set(qn("w:color"), f"{RULE[0]:02X}{RULE[1]:02X}{RULE[2]:02X}")
    pBdr.append(top)
    pPr.append(pBdr)
    for i, bit in enumerate(extras):
        if i > 0:
            sep = strip.add_run("   ·   ")
            set_font(sep, FF_MONO, 7.5, INK_4)
        run = strip.add_run(bit)
        set_font(run, FF_BODY, 8, INK_2)


def build_document(timeline, meta, compact=False):
    doc = Document()

    # Thin margins — tighter on the 1-pager so copy can breathe.
    for section in doc.sections:
        section.top_margin = Inches(0.38 if compact else 0.5)
        section.bottom_margin = Inches(0.82 if compact else 0.5)
        section.left_margin = Inches(0.5)
        section.right_margin = Inches(0.5)
        if compact:
            add_compact_page_footer(section)

    # Default paragraph style
    normal = doc.styles["Normal"]
    normal.font.name = FF_BODY
    normal.font.size = Pt(9 if compact else 10)
    normal.font.color.rgb = INK_2

    # --- HEADER: memoji + name + subtitle + contact ---
    circular = make_circular_memoji(MEMOJI, MEMOJI_CIRCLE)
    img_p = doc.add_paragraph()
    img_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    img_p.paragraph_format.space_after = Pt(2 if compact else 4)
    img_p.add_run().add_picture(str(circular), width=Inches(0.62 if compact else 1.1))

    name_p = doc.add_paragraph()
    name_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    name_p.paragraph_format.space_after = Pt(1 if compact else 2)
    name_pt = 18 if compact else 22
    glow = render_name_with_ai_glow(meta["name"], NAME_GLOW, name_pt)
    if glow:
        glow_path, glow_width = glow
        name_p.add_run().add_picture(str(glow_path), width=Inches(glow_width))
        # Real text stays in the file for search and applicant systems.
        hidden = name_p.add_run(meta["name"])
        set_font(hidden, FF_DISPLAY, name_pt, INK)
        hidden.font.hidden = True
    else:
        name_run = name_p.add_run(meta["name"])
        set_font(name_run, FF_DISPLAY, name_pt, INK)

    subtitle_text = meta["titleLine"].upper().replace(" · ", "   ·   ")
    mono_line(doc, subtitle_text, INK_3, size=7.5 if compact else 8.5, space=1.3, after=4 if compact else 8)

    # Contact on two lines: personal info, then profiles.
    info_bits = [meta.get("location", ""), meta.get("phone", ""), meta.get("email", "")]
    profile_bits = [meta.get("linkedin", ""), meta.get("x", ""), meta.get("github", "")]
    info_text = "   ·   ".join(b for b in info_bits if b).upper()
    mono_line(doc, info_text, INK_2, size=7.5 if compact else 8, space=1.0, after=1 if compact else 2)
    profile_text = "   ·   ".join(b for b in profile_bits if b).upper()
    contact_p = mono_line(doc, profile_text, INK_2, size=7.5 if compact else 8, space=1.0, after=2)
    add_bottom_border(contact_p, RULE)

    # --- 01 PROFESSIONAL SUMMARY ---
    section_label(doc, "01", "Professional Summary", compact=compact)
    summary_text = meta.get("resumeSummary") if compact else None
    summary_text = summary_text or meta["summary"]
    p = doc.add_paragraph(summary_text)
    p.paragraph_format.space_after = Pt(2 if compact else 4)
    for r in p.runs:
        set_font(r, FF_BODY, 9 if compact else 10, INK_2)
    p.paragraph_format.line_spacing = 1.15 if compact else 1.35

    # --- 02 CORE COMPETENCIES ---
    section_label(doc, "02", "Core Competencies", compact=compact)
    if compact:
        comps = meta.get("resumeCompetencies") or meta.get("competencies", [])
        strip = doc.add_paragraph()
        strip.paragraph_format.space_after = Pt(2)
        strip.paragraph_format.line_spacing = 1.15
        for i, comp in enumerate(comps):
            if i > 0:
                sep = strip.add_run("  ·  ")
                set_font(sep, FF_MONO, 8, INK_4)
            body = strip.add_run(comp)
            set_font(body, FF_BODY, 9, INK_2)
    else:
        comps = meta.get("competencies", [])
        rows = (len(comps) + 1) // 2
        table = doc.add_table(rows=rows, cols=2)
        table.autofit = True
        for i, comp in enumerate(comps):
            cell = table.cell(i // 2, i % 2)
            cell.text = ""
            cp = cell.paragraphs[0]
            cp.paragraph_format.space_after = Pt(2)
            num = cp.add_run(f"{i+1:02d}   ")
            set_font(num, FF_MONO, 8, INK_4)
            set_character_spacing(num, 0.8)
            body = cp.add_run(comp)
            set_font(body, FF_BODY, 9.5, INK_2)

    # --- 03 PROFESSIONAL EXPERIENCE & EDUCATION ---
    # Newest first in the document; TIMELINE stays chronological for the site map.
    section_label(doc, "03", "Professional Experience & Education", compact=compact)
    for item in reversed(timeline):
        head = doc.add_paragraph()
        head.paragraph_format.space_before = Pt(5 if compact else 8)
        head.paragraph_format.space_after = Pt(0 if compact else 1)
        tab_right(head, 7.5)
        kind = "EDUCATION" if item.get("type") == "education" else "EXPERIENCE"
        kind_run = head.add_run(kind + "   ")
        set_font(kind_run, FF_MONO, 7.5 if compact else 8, ACCENT)
        set_character_spacing(kind_run, 1.2)
        title_run = head.add_run(item["title"])
        set_font(title_run, FF_DISPLAY, 11 if compact else 13, INK, bold=False)
        sep_run = head.add_run("\t")
        dates_run = head.add_run(item["dates"].upper())
        set_font(dates_run, FF_MONO, 8 if compact else 8.5, INK_3)
        set_character_spacing(dates_run, 1.0)

        meta_p = doc.add_paragraph()
        meta_p.paragraph_format.space_after = Pt(2 if compact else 4)
        org_run = meta_p.add_run(item["org"])
        set_font(org_run, FF_MONO, 8 if compact else 9, INK_2)
        set_character_spacing(org_run, 0.6)
        dot_run = meta_p.add_run("   ·   ")
        set_font(dot_run, FF_MONO, 8 if compact else 9, INK_4)
        city_run = meta_p.add_run(item["city"])
        set_font(city_run, FF_MONO, 8 if compact else 9, INK_3)

        # resumeBullets is a condensed override for the document; the site
        # always shows the full bullets. Compact treats an explicit empty
        # list as "no bullets" (education on the 1-pager). Non-compact
        # keeps the historical `or bullets` fallback so job-search imports
        # and `python make_resume.py --full` are unchanged.
        if compact:
            bullets = item["resumeBullets"] if "resumeBullets" in item else item.get("bullets", [])
        else:
            bullets = item.get("resumeBullets") or item.get("bullets", [])
        for bullet in bullets:
            add_bullet(doc, bullet, compact=compact)

    # --- 04 TECHNICAL SKILLS & TOOLS ---
    section_label(doc, "04", "Technical Skills & Tools", compact=compact)
    skills = meta.get("resumeSkills") if compact else None
    skills = skills or meta.get("skills", {})
    for category, desc in skills.items():
        if compact:
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(1)
            p.paragraph_format.space_after = Pt(1)
            p.paragraph_format.line_spacing = 1.1
            head_run = p.add_run(category.upper() + "  ")
            set_font(head_run, FF_MONO, 7.5, INK)
            set_character_spacing(head_run, 1.0)
            body_run = p.add_run(desc)
            set_font(body_run, FF_BODY, 8.5, INK_2)
        else:
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(2)
            head_run = p.add_run(category.upper() + "   ")
            set_font(head_run, FF_MONO, 8.5, INK)
            set_character_spacing(head_run, 1.2)
            body = doc.add_paragraph(desc)
            body.paragraph_format.space_after = Pt(4)
            body.paragraph_format.left_indent = Inches(0.0)
            for r in body.runs:
                set_font(r, FF_BODY, 10, INK_2)
            body.paragraph_format.line_spacing = 1.3

    if compact:
        extras = []
        for c in meta.get("certifications", []):
            extras.append(f"MIT xPRO {c['year']}")
        for h in meta.get("highlights", []):
            extras.append(f"MBRDNA guest speaker {h['year']}")
        langs = [lang["name"] for lang in meta.get("languages", []) if lang["name"] != "German"]
        if langs:
            extras.append(" · ".join(langs))
        add_compact_extras_strip(doc, extras)
    else:
        # --- 05 HIGHLIGHTS ---
        highlights = meta.get("highlights", [])
        if highlights:
            section_label(doc, "05", "Highlights")
            for h in highlights:
                head = doc.add_paragraph()
                head.paragraph_format.space_before = Pt(4)
                head.paragraph_format.space_after = Pt(1)
                tab_right(head, 7.5)
                title_run = head.add_run(h["title"])
                set_font(title_run, FF_DISPLAY, 12, INK)
                head.add_run("\t")
                year_run = head.add_run(str(h["year"]))
                set_font(year_run, FF_MONO, 9, ACCENT)
                set_character_spacing(year_run, 1.0)
                body = doc.add_paragraph(h["body"])
                body.paragraph_format.space_after = Pt(4)
                for r in body.runs:
                    set_font(r, FF_BODY, 10, INK_2)
                body.paragraph_format.line_spacing = 1.3

        # --- 06 PROJECTS ---
        projects = meta.get("projects", [])
        if projects:
            section_label(doc, "06", "Projects")
            for pr in projects:
                head = doc.add_paragraph()
                head.paragraph_format.space_before = Pt(8)
                head.paragraph_format.space_after = Pt(1)
                tab_right(head, 7.5)
                title_run = head.add_run(pr["title"])
                set_font(title_run, FF_DISPLAY, 13, INK)
                head.add_run("\t")
                year_run = head.add_run(str(pr["year"]))
                set_font(year_run, FF_MONO, 9, ACCENT)
                set_character_spacing(year_run, 1.0)

                meta_p = doc.add_paragraph()
                meta_p.paragraph_format.space_after = Pt(4)
                role_run = meta_p.add_run(pr["role"].upper())
                set_font(role_run, FF_MONO, 9, INK_2)
                set_character_spacing(role_run, 0.6)
                dot_run = meta_p.add_run("   ·   ")
                set_font(dot_run, FF_MONO, 9, INK_4)
                domain_run = meta_p.add_run(pr["domain"])
                set_font(domain_run, FF_MONO, 9, INK_3)

                tag = doc.add_paragraph(pr["tagline"])
                tag.paragraph_format.space_after = Pt(2)
                for r in tag.runs:
                    set_font(r, FF_BODY, 10, INK_3)
                tag.paragraph_format.line_spacing = 1.3

                for bullet in pr.get("bullets", []):
                    add_bullet(doc, bullet)

                tags = pr.get("tags", [])
                if tags:
                    tags_p = doc.add_paragraph()
                    tags_p.paragraph_format.space_before = Pt(4)
                    tags_p.paragraph_format.space_after = Pt(2)
                    for i, t in enumerate(tags):
                        if i > 0:
                            sep = tags_p.add_run("   ")
                            set_font(sep, FF_MONO, 8.5, INK_3)
                        hash_run = tags_p.add_run("#")
                        set_font(hash_run, FF_MONO, 8.5, ACCENT)
                        tag_run = tags_p.add_run(t)
                        set_font(tag_run, FF_MONO, 8.5, INK_3)
                        set_character_spacing(tag_run, 0.6)

        # --- 07 CERTIFICATIONS ---
        certs = meta.get("certifications", [])
        if certs:
            section_label(doc, "07", "Certifications")
            for c in certs:
                head = doc.add_paragraph()
                head.paragraph_format.space_before = Pt(3)
                head.paragraph_format.space_after = Pt(2)
                tab_right(head, 7.5)
                title_run = head.add_run(c["title"])
                set_font(title_run, FF_DISPLAY, 12, INK)
                head.add_run("\t")
                year_run = head.add_run(str(c["year"]))
                set_font(year_run, FF_MONO, 9, ACCENT)
                set_character_spacing(year_run, 1.0)
                org = doc.add_paragraph()
                org.paragraph_format.space_after = Pt(2)
                org_run = org.add_run(c["org"])
                set_font(org_run, FF_MONO, 9, INK_3)
                set_character_spacing(org_run, 0.8)

        # --- 08 LANGUAGES ---
        languages = meta.get("languages", [])
        if languages:
            section_label(doc, "08", "Languages")
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(4)
            for i, lang in enumerate(languages):
                if i > 0:
                    sep = p.add_run("   ·   ")
                    set_font(sep, FF_MONO, 9, INK_4)
                name_run = p.add_run(lang["name"])
                set_font(name_run, FF_DISPLAY, 11, INK_3 if lang["name"] == "German" else INK)
                level_run = p.add_run(" " + lang["level"].upper())
                set_font(level_run, FF_MONO, 8, INK_3)
                set_character_spacing(level_run, 1.0)

        # --- XX COMPANION SITE (QR code to efrain.me) ---
        label_p = section_label(doc, "XX", "Companion Site")
        label_p.paragraph_format.keep_with_next = True
        url_p = doc.add_paragraph()
        url_p.paragraph_format.keep_with_next = True
        url_p.paragraph_format.space_after = Pt(4)
        url_run = url_p.add_run(COMPANION_URL)
        set_font(url_run, FF_MONO, 9, INK_2)
        set_character_spacing(url_run, 0.6)
        qr_p = doc.add_paragraph()
        qr_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        qr_p.paragraph_format.space_before = Pt(2)
        qr_p.add_run().add_picture(str(QR_IMAGE), width=Inches(1.2))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(OUTPUT))
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    import sys

    timeline, meta = load_data()
    compact = "--full" not in sys.argv
    build_document(timeline, meta, compact=compact)
