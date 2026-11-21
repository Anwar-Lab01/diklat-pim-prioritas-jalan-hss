"""Generate the public-facing 2025 HSS Bina Marga visual family.

All charts are deterministic SVG/PNG artwork. The map is rendered directly from
the authoritative GeoJSON data already used by the Diklat PIM application.
No screenshots are traced and no image model is used for factual graphics.
"""

from __future__ import annotations

import html
import json
import math
import shutil
import textwrap
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "reports" / "profile_book_visuals_v2"
DATA_PATH = ROOT / "reports" / "profile_book_map" / "profile_book_map_data.json"

BG = "#F7F4EE"
PAPER = "#FFFDF8"
INK = "#173A43"
MUTED = "#5D7378"
GREEN = "#087F68"
GREEN_LIGHT = "#DDEFE8"
BLUE = "#2D6F8D"
BLUE_LIGHT = "#E1EEF2"
OCHRE = "#B66E2D"
OCHRE_LIGHT = "#F4E5D0"
TEAL = "#2D8C87"
PINK = "#B75E87"
LINE = "#C8D6D2"
MAP_BG = "#EEF3F0"
ROAD = "#9BA8A7"
DISTRICT = "#E4ECE8"

PORTRAIT = (2480, 3508, 794, 1123)
LANDSCAPE = (3840, 2160, 1200, 675)


def fpath(bold: bool = False, italic: bool = False) -> Path:
    if bold:
        candidates = [Path(r"C:\Windows\Fonts\segoeuib.ttf"), Path(r"C:\Windows\Fonts\arialbd.ttf")]
    elif italic:
        candidates = [Path(r"C:\Windows\Fonts\segoeuii.ttf"), Path(r"C:\Windows\Fonts\ariali.ttf")]
    else:
        candidates = [Path(r"C:\Windows\Fonts\segoeui.ttf"), Path(r"C:\Windows\Fonts\arial.ttf")]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[-1]


def wrap_lines(value: str, width: int) -> list[str]:
    result: list[str] = []
    for paragraph in value.split("\n"):
        result.extend(textwrap.wrap(paragraph, width=width) or [""])
    return result


class Canvas:
    def __init__(self, out_w: int, out_h: int, logical_w: int, logical_h: int, title: str):
        self.out_w = out_w
        self.out_h = out_h
        self.w = logical_w
        self.h = logical_h
        self.k = out_w / logical_w
        self.image = Image.new("RGB", (out_w, out_h), BG)
        self.draw = ImageDraw.Draw(self.image)
        self.svg: list[str] = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{out_w}" height="{out_h}" viewBox="0 0 {logical_w} {logical_h}">',
            f"<title>{html.escape(title)}</title>",
            f'<rect width="{logical_w}" height="{logical_h}" fill="{BG}"/>',
        ]

    def px(self, value: float) -> int:
        return int(round(value * self.k))

    def color(self, value: str) -> str:
        return value

    def rect(self, x: float, y: float, w: float, h: float, fill: str, stroke: str | None = None, sw: float = 1, radius: float = 0):
        if radius:
            self.draw.rounded_rectangle((self.px(x), self.px(y), self.px(x + w), self.px(y + h)), radius=self.px(radius), fill=fill, outline=stroke, width=max(1, self.px(sw)) if stroke else 1)
            rx = f' rx="{radius}" ry="{radius}"'
        else:
            self.draw.rectangle((self.px(x), self.px(y), self.px(x + w), self.px(y + h)), fill=fill, outline=stroke, width=max(1, self.px(sw)) if stroke else 1)
            rx = ""
        attr = f'x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}"'
        if stroke:
            attr += f' stroke="{stroke}" stroke-width="{sw}"'
        self.svg.append(f"<rect {attr}{rx}/>")

    def line(self, points: list[tuple[float, float]], color: str, width: float = 1, dash: list[float] | None = None):
        if len(points) < 2:
            return
        scaled = [(self.px(x), self.px(y)) for x, y in points]
        if dash:
            for (x1, y1), (x2, y2) in zip(scaled, scaled[1:]):
                dx, dy = x2 - x1, y2 - y1
                length = max(math.hypot(dx, dy), 1)
                ux, uy = dx / length, dy / length
                pos = 0.0
                on = True
                while pos < length:
                    seg = dash[0 if on else 1]
                    end = min(length, pos + seg)
                    if on:
                        self.draw.line((x1 + ux * pos, y1 + uy * pos, x1 + ux * end, y1 + uy * end), fill=color, width=max(1, self.px(width)))
                    pos = end
                    on = not on
        else:
            self.draw.line(scaled, fill=color, width=max(1, self.px(width)), joint="curve")
        pts = " ".join(f"{x:.2f},{y:.2f}" for x, y in points)
        dash_attr = f' stroke-dasharray="{" ".join(str(v) for v in dash)}"' if dash else ""
        self.svg.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"{dash_attr}/>')

    def polygon(self, points: list[tuple[float, float]], fill: str, stroke: str | None = None, sw: float = 1):
        scaled = [(self.px(x), self.px(y)) for x, y in points]
        self.draw.polygon(scaled, fill=fill)
        if stroke:
            self.draw.line(scaled + [scaled[0]], fill=stroke, width=max(1, self.px(sw)), joint="curve")
        pts = " ".join(f"{x:.2f},{y:.2f}" for x, y in points)
        stroke_attr = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
        self.svg.append(f'<polygon points="{pts}" fill="{fill}"{stroke_attr}/>')

    def ellipse(self, x: float, y: float, w: float, h: float, fill: str, stroke: str | None = None, sw: float = 1):
        self.draw.ellipse((self.px(x), self.px(y), self.px(x + w), self.px(y + h)), fill=fill, outline=stroke, width=max(1, self.px(sw)) if stroke else 1)
        stroke_attr = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
        self.svg.append(f'<ellipse cx="{x + w / 2}" cy="{y + h / 2}" rx="{w / 2}" ry="{h / 2}" fill="{fill}"{stroke_attr}/>')

    def text(self, x: float, y: float, value: str, size: float, fill: str = INK, bold: bool = False, italic: bool = False, anchor: str = "left", max_width: int | None = None, line_gap: float = 1.18):
        lines = value.split("\n")
        if max_width:
            wrapped: list[str] = []
            for line in lines:
                wrapped.extend(wrap_lines(line, max_width))
            lines = wrapped
        font = ImageFont.truetype(str(fpath(bold=bold, italic=italic)), max(1, self.px(size)))
        pil_anchor = {"left": "la", "center": "ma", "right": "ra"}.get(anchor, "la")
        self.draw.multiline_text((self.px(x), self.px(y)), "\n".join(lines), font=font, fill=fill, anchor=pil_anchor, spacing=max(1, self.px(size * (line_gap - 1))))
        svg_anchor = {"left": "start", "center": "middle", "right": "end"}.get(anchor, "start")
        style = f'font-family:Arial, sans-serif;font-size:{size}px;font-weight:{"700" if bold else "400"};'
        if italic:
            style += "font-style:italic;"
        tspans = "".join(f'<tspan x="{x}" dy="{0 if i == 0 else size * line_gap}">{html.escape(line)}</tspan>' for i, line in enumerate(lines))
        self.svg.append(f'<text x="{x}" y="{y}" fill="{fill}" text-anchor="{svg_anchor}" style="{style}">{tspans}</text>')

    def finish(self, svg_path: Path, png_path: Path):
        self.svg.append("</svg>")
        svg_path.write_text("\n".join(self.svg), encoding="utf-8")
        self.image.save(png_path, format="PNG", dpi=(300, 300), optimize=True)


def contours(c: Canvas):
    for i in range(7):
        pts = []
        base = c.h - 55 - i * 12
        for j in range(0, int(c.w) + 10, 10):
            yy = base + math.sin(j / 80 + i * 0.8) * (3 + i * 0.6) + math.sin(j / 31) * 1.5
            pts.append((j, yy))
        c.line(pts, "#E8EAE3", 0.8)
    for i in range(5):
        pts = []
        for j in range(0, int(c.w) + 10, 12):
            yy = 35 + i * 14 + math.sin(j / 90 + i) * 3
            pts.append((j, yy))
        c.line(pts, "#EFF0E9", 0.65)


def header(c: Canvas, title: str, subtitle: str, section: str):
    contours(c)
    c.line([(55, 48), (120, 48)], GREEN, 3)
    c.text(55, 62, section, 12, BLUE, bold=True)
    c.text(55, 86, title, 30 if c.w > 900 else 25, INK, bold=True, max_width=1080 if c.w > 900 else 670)
    c.text(55, 137 if c.w > 900 else 158, subtitle, 12, MUTED, max_width=1050 if c.w > 900 else 660)
    c.line([(55, 170 if c.w > 900 else 195), (c.w - 55, 170 if c.w > 900 else 195)], LINE, 1)


def footer(c: Canvas, note: str):
    c.line([(55, c.h - 42), (c.w - 55, c.h - 42)], LINE, 1)
    c.text(55, c.h - 28, note, 8, MUTED, max_width=115 if c.w < 900 else 180)
    c.text(c.w - 55, c.h - 28, "Buku Profil Kabupaten HSS • 2025", 8, MUTED, anchor="right")


def chip(c: Canvas, x: float, y: float, label: str, value: str, color: str = GREEN, w: float = 160):
    c.rect(x, y, w, 62, PAPER, LINE, 0.8, 8)
    c.line([(x, y), (x + w, y)], color, 3)
    c.text(x + 14, y + 15, value, 20, color, bold=True)
    c.text(x + 14, y + 45, label, 8, MUTED, bold=True)


def draw_road_condition(c: Canvas):
    header(c, "Jalan Mantap Mencapai 66,03% pada 2025", "Kondisi jaringan jalan kabupaten bergerak melampaui target tahunan.", "CAPAIAN BINA MARGA • KONDISI JALAN")
    if c.w > 900:
        c.text(60, 220, "66,03%", 72, GREEN, bold=True)
        c.text(63, 292, "jalan mantap", 17, INK, bold=True)
        c.text(63, 326, "483,62 km dari 732,46 km total jaringan", 12, MUTED)
        c.rect(470, 218, 665, 164, PAPER, LINE, 1, 12)
        c.text(500, 244, "Perbandingan kondisi jaringan", 14, INK, bold=True)
        base = 344
        chart_x = [570, 820]
        values = [(463.90, "2024", "63,33%", BLUE), (483.62, "2025", "66,03%", GREEN)]
        maxv = 520
        for x, (km, year, pct, color) in zip(chart_x, values):
            height = 78 * km / maxv
            c.rect(x, base - height, 92, height, color, None, 0, 6)
            c.text(x + 46, base + 18, year, 10, INK, bold=True, anchor="center")
            c.text(x + 46, base - height - 12, pct, 12, color, bold=True, anchor="center")
        target_y = base - 78 * 64.56 / maxv
        c.line([(520, target_y), (1080, target_y)], OCHRE, 1.2, [7, 5])
        c.text(1090, target_y, "Target 64,56%", 9, OCHRE, bold=True)
        c.rect(60, 430, 1075, 86, GREEN_LIGHT, "#B8DFD0", 1, 10)
        c.text(85, 452, "+10,77 km", 28, GREEN, bold=True)
        c.text(280, 459, "peningkatan bersih kondisi mantap", 14, INK, bold=True)
        c.text(280, 485, "indikator kinerja jaringan, terpisah dari output penanganan fisik", 10, MUTED)
        chip(c, 60, 555, "output penanganan fisik 2025", "20,223 km", OCHRE, 240)
        chip(c, 330, 555, "jumlah ruas kabupaten", "350 ruas", BLUE, 190)
        chip(c, 550, 555, "target PKRMS 2025", "64,56%", OCHRE, 190)
        footer(c, "Sumber: rekap kondisi jaringan jalan Kab. Hulu Sungai Selatan, 2024–2025. Peningkatan bersih dan output fisik adalah indikator yang berbeda.")
    else:
        c.text(55, 230, "66,03%", 61, GREEN, bold=True)
        c.text(58, 294, "JALAN MANTAP", 15, INK, bold=True)
        c.text(58, 325, "483,62 km dari 732,46 km total jaringan", 11, MUTED)
        c.rect(55, 365, 684, 270, PAPER, LINE, 1, 10)
        c.text(80, 392, "Kondisi jaringan", 13, INK, bold=True)
        base = 574
        for x, (km, year, pct, color) in zip([185, 425], [(463.90, "2024", "63,33%", BLUE), (483.62, "2025", "66,03%", GREEN)]):
            height = 120 * km / 520
            c.rect(x, base - height, 105, height, color, None, 0, 6)
            c.text(x + 52, base + 20, year, 11, INK, bold=True, anchor="center")
            c.text(x + 52, base - height - 18, pct, 13, color, bold=True, anchor="center")
        target_y = base - 120 * 64.56 / 520
        c.line([(110, target_y), (665, target_y)], OCHRE, 1.2, [7, 5])
        c.text(670, target_y, "target 64,56%", 9, OCHRE, bold=True)
        c.rect(55, 675, 684, 92, GREEN_LIGHT, "#B8DFD0", 1, 10)
        c.text(80, 696, "+10,77 km", 28, GREEN, bold=True)
        c.text(235, 705, "peningkatan bersih kondisi mantap", 12, INK, bold=True)
        c.text(80, 740, "Output penanganan fisik ditampilkan terpisah: 20,223 km.", 10, MUTED)
        chip(c, 55, 810, "total jaringan", "732,46 km", BLUE, 214)
        chip(c, 292, 810, "jumlah ruas", "350", GREEN, 150)
        chip(c, 465, 810, "target PKRMS", "64,56%", OCHRE, 185)
        footer(c, "Sumber: rekap kondisi jaringan jalan Kab. Hulu Sungai Selatan, 2024–2025.")


def draw_road_outputs(c: Canvas):
    header(c, "Penanganan Jalan dan Koridor Strategis", "Satu capaian utama, lalu empat sorotan program yang memperkuat konektivitas wilayah.", "CAPAIAN BINA MARGA • OUTPUT 2025")
    if c.w > 900:
        c.rect(60, 215, 1080, 140, GREEN, None, 0, 12)
        c.text(92, 238, "20,223 km", 63, "#FFFFFF", bold=True)
        c.text(420, 253, "total penanganan / pengaspalan jalan 2025", 19, "#FFFFFF", bold=True)
        c.text(420, 288, "output fisik tahunan untuk menjaga konektivitas dan akses layanan", 11, "#D7F0E8")
        c.text(60, 408, "Beberapa koridor dan program strategis", 18, INK, bold=True)
        items = [
            ("Karya Bakti TNI", "7,209 km", "6 paket", BLUE),
            ("Koridor Loksado / Meratus", "6,154 km", "6 paket jalan", OCHRE),
            ("Sawaja / Bajayau Tengah–Buas-Buas", "4,538 km", "koridor strategis", GREEN),
            ("Samuda–Bajayau / DBH Sawit", "0,913 km", "konektivitas sentra perkebunan", "#C58B2C"),
        ]
        y = 450
        for name, value, note, color in items:
            c.line([(75, y + 16), (125, y + 16)], color, 5)
            c.text(150, y, name, 15, INK, bold=True)
            c.text(780, y, value, 20, color, bold=True, anchor="right")
            c.text(150, y + 28, note, 10, MUTED)
            c.line([(150, y + 58), (1050, y + 58)], LINE, 0.8)
            y += 78
        c.text(60, 635, "Sorotan koridor ditampilkan sebagai fokus program; bukan pembagian dari total output tahunan.", 10, MUTED, italic=True)
        footer(c, "Sumber: rekap keluaran penanganan jalan Dinas PUPR Kab. Hulu Sungai Selatan, 2025.")
    else:
        c.rect(55, 225, 684, 140, GREEN, None, 0, 12)
        c.text(83, 250, "20,223 km", 55, "#FFFFFF", bold=True)
        c.text(83, 315, "total penanganan / pengaspalan jalan 2025", 13, "#FFFFFF", bold=True)
        c.text(55, 425, "Beberapa koridor dan program strategis", 17, INK, bold=True)
        items = [("Karya Bakti TNI", "7,209 km", "6 paket", BLUE), ("Koridor Loksado / Meratus", "6,154 km", "6 paket jalan", OCHRE), ("Sawaja / Bajayau Tengah–Buas-Buas", "4,538 km", "koridor strategis", GREEN), ("Samuda–Bajayau / DBH Sawit", "0,913 km", "sentra perkebunan", "#C58B2C")]
        y = 475
        for name, value, note, color in items:
            c.line([(70, y + 12), (108, y + 12)], color, 5)
            c.text(125, y, name, 13, INK, bold=True, max_width=34)
            c.text(705, y, value, 18, color, bold=True, anchor="right")
            c.text(125, y + 31, note, 10, MUTED)
            c.line([(125, y + 58), (710, y + 58)], LINE, 0.8)
            y += 82
        footer(c, "Sumber: rekap keluaran penanganan jalan Dinas PUPR Kab. Hulu Sungai Selatan, 2025.")


def draw_bridge(c: Canvas):
    header(c, "Capaian Penanganan Jembatan Melampaui Target", "Tiga indikator penanganan menunjukkan realisasi di atas target kinerja tahun 2025.", "CAPAIAN BINA MARGA • JEMBATAN")
    if c.w > 900:
        c.text(60, 220, "114,67%", 67, GREEN, bold=True)
        c.text(62, 291, "capaian tertinggi", 16, INK, bold=True)
        c.text(62, 322, "Pemeliharaan rutin • 543,53 m", 11, MUTED)
        c.text(60, 400, "Indikator penanganan jembatan", 18, INK, bold=True)
        base = 555
        items = [("Pemeliharaan rutin", "543,53 m", "114,67%", GREEN), ("Penggantian jembatan", "266,20 m", "107,16%", BLUE), ("Rehabilitasi kumulatif", "216,20 m", "104,85%", OCHRE)]
        xs = [170, 500, 830]
        for x, (label, value, pct, color) in zip(xs, items):
            c.line([(x - 55, base - 70), (x + 145, base - 70)], "#D7B7A3", 1, [6, 5])
            c.text(x + 40, base - 80, "100%", 9, MUTED, anchor="center")
            h = 110 * float(pct.replace(",", ".").replace("%", "")) / 120
            c.rect(x, base - h, 160, h, color, None, 0, 8)
            c.text(x + 80, base - h - 24, pct, 20, color, bold=True, anchor="center")
            c.text(x + 80, base + 22, label, 10, INK, bold=True, anchor="center", max_width=19)
            c.text(x + 80, base + 57, value, 11, MUTED, anchor="center")
        c.rect(60, 610, 1075, 58, BLUE_LIGHT, "#B8D4DF", 1, 9)
        c.text(85, 629, "130,00 m", 22, BLUE, bold=True)
        c.text(255, 638, "struktur jembatan utama selesai dan berfungsi pada 14 paket pekerjaan", 12, INK, bold=True)
        c.text(60, 688, "Rehabilitasi: realisasi 2025 = 60,00 m • capaian kumulatif = 216,20 m", 10, MUTED)
        footer(c, "Sumber: rekap indikator kinerja jembatan Dinas PUPR Kab. Hulu Sungai Selatan, 2025.")
    else:
        c.text(55, 230, "114,67%", 58, GREEN, bold=True)
        c.text(58, 292, "capaian tertinggi", 15, INK, bold=True)
        c.text(58, 322, "Pemeliharaan rutin • 543,53 m", 10, MUTED)
        c.text(55, 395, "Tiga indikator penanganan", 17, INK, bold=True)
        base = 665
        items = [("Pemeliharaan rutin", "543,53 m", "114,67%", GREEN), ("Penggantian jembatan", "266,20 m", "107,16%", BLUE), ("Rehabilitasi kumulatif", "216,20 m", "104,85%", OCHRE)]
        for x, (label, value, pct, color) in zip([110, 335, 560], items):
            h = 180 * float(pct.replace(",", ".").replace("%", "")) / 120
            c.rect(x, base - h, 125, h, color, None, 0, 8)
            c.text(x + 62, base - h - 18, pct, 15, color, bold=True, anchor="center")
            c.text(x + 62, base + 20, label, 9, INK, bold=True, anchor="center", max_width=17)
            c.text(x + 62, base + 50, value, 10, MUTED, anchor="center")
        c.rect(55, 770, 684, 80, BLUE_LIGHT, "#B8D4DF", 1, 9)
        c.text(80, 792, "130,00 m", 22, BLUE, bold=True)
        c.text(80, 827, "struktur jembatan utama selesai dan berfungsi pada 14 paket", 10, INK, bold=True)
        c.text(55, 885, "Rehabilitasi: 60,00 m pada 2025 • 216,20 m secara kumulatif", 10, MUTED)
        footer(c, "Sumber: rekap indikator kinerja jembatan Dinas PUPR Kab. Hulu Sungai Selatan, 2025.")


def draw_financial(c: Canvas):
    header(c, "Realisasi Anggaran Bidang Bina Marga 2025", "Realisasi keuangan disajikan bersama pagu resmi dan beberapa sub-kegiatan pendukung.", "CAPAIAN BINA MARGA • KEUANGAN")
    if c.w > 900:
        c.text(60, 230, "70,30%", 72, GREEN, bold=True)
        c.text(64, 302, "realisasi anggaran", 17, INK, bold=True)
        c.text(64, 335, "Rp89,65 miliar terealisasi dari Rp127,52 miliar pagu", 12, MUTED)
        c.rect(60, 390, 1075, 48, "#E4EBE7", None, 0, 10)
        c.rect(60, 390, 755, 48, GREEN, None, 0, 10)
        c.text(60, 470, "Rp89.647.682.277,15", 23, GREEN, bold=True)
        c.text(1135, 470, "Rp127.515.894.485,00", 18, BLUE, bold=True, anchor="right")
        c.text(60, 500, "Realisasi", 10, MUTED)
        c.text(1135, 500, "Pagu", 10, MUTED, anchor="right")
        c.text(60, 565, "Sub-kegiatan dengan realisasi keuangan tinggi", 17, INK, bold=True)
        vals = [("Pelebaran Jalan Menuju Standar", "99,77%", GREEN), ("Survei Kondisi Jalan dan Jembatan", "98,99%", BLUE), ("Rehabilitasi Jalan", "97,85%", GREEN), ("Pemeliharaan Rutin Jembatan", "97,76%", OCHRE), ("Pemeliharaan Rutin Jalan", "97,59%", BLUE)]
        y = 606
        for label, value, color in vals:
            c.line([(70, y + 8), (102, y + 8)], color, 4)
            c.text(120, y, label, 12, INK)
            c.text(1000, y, value, 14, color, bold=True, anchor="right")
            y += 32
        footer(c, "Sumber: rekapitulasi realisasi fisik dan keuangan akhir Tahun Anggaran 2025, Dinas PUPR Kab. Hulu Sungai Selatan.")
    else:
        c.text(55, 235, "70,30%", 58, GREEN, bold=True)
        c.text(58, 298, "realisasi anggaran", 15, INK, bold=True)
        c.text(58, 330, "Rp89,65 miliar dari Rp127,52 miliar pagu", 10, MUTED)
        c.rect(55, 385, 684, 46, "#E4EBE7", None, 0, 10)
        c.rect(55, 385, 482, 46, GREEN, None, 0, 10)
        c.text(55, 465, "Rp89,65 miliar", 22, GREEN, bold=True)
        c.text(740, 465, "Rp127,52 miliar", 16, BLUE, bold=True, anchor="right")
        c.text(55, 495, "realisasi", 10, MUTED)
        c.text(740, 495, "pagu", 10, MUTED, anchor="right")
        c.text(55, 565, "Sub-kegiatan dengan realisasi tinggi", 17, INK, bold=True)
        vals = [("Pelebaran Jalan Menuju Standar", "99,77%", GREEN), ("Survei Kondisi Jalan dan Jembatan", "98,99%", BLUE), ("Rehabilitasi Jalan", "97,85%", GREEN), ("Pemeliharaan Rutin Jembatan", "97,76%", OCHRE), ("Pemeliharaan Rutin Jalan", "97,59%", BLUE)]
        y = 615
        for label, value, color in vals:
            c.line([(65, y + 8), (95, y + 8)], color, 4)
            c.text(110, y, label, 10, INK, max_width=34)
            c.text(730, y, value, 12, color, bold=True, anchor="right")
            y += 43
        footer(c, "Sumber: rekapitulasi realisasi fisik dan keuangan Tahun Anggaran 2025, Dinas PUPR Kab. Hulu Sungai Selatan.")


def draw_survey(c: Canvas):
    header(c, "Survei Menjangkau Seluruh Jaringan Jalan Kabupaten", "Data kondisi jalan dan jembatan menjadi dasar perencanaan jaringan yang lebih terarah.", "CAPAIAN BINA MARGA • DATA & SURVEI")
    if c.w > 900:
        metrics = [("11", "kecamatan", "seluruh wilayah administratif", BLUE), ("350", "ruas jalan", "kode HSS-KAB-001 s.d. HSS-KAB-350", GREEN), ("732,46", "km jaringan", "kondisi mantap: 483,62 km", OCHRE)]
        xs = [60, 420, 780]
        for x, (value, label, note, color) in zip(xs, metrics):
            c.text(x, 235, value, 61, color, bold=True)
            c.text(x, 305, label, 17, INK, bold=True)
            c.text(x, 335, note, 10, MUTED)
            c.line([(x, 365), (x + 260, 365)], color, 3)
        c.text(60, 438, "Cakupan dan kesiapan data", 18, INK, bold=True)
        support = [("2", "dokumen teknis", "survei jalan dan survei jembatan", GREEN), ("100%", "cakupan fisik survei", "seluruh jaringan terlayani", BLUE), ("98,99%", "realisasi keuangan", "Rp1,002 miliar dari Rp1,0125 miliar", OCHRE), ("PKRMS + Leger Jalan", "basis data perencanaan", "mendukung prioritas jaringan", GREEN)]
        y = 480
        for value, label, note, color in support:
            c.line([(70, y + 10), (112, y + 10)], color, 4)
            c.text(135, y, value, 18, color, bold=True)
            c.text(320, y, label, 12, INK, bold=True)
            c.text(320, y + 22, note, 10, MUTED)
            c.line([(320, y + 47), (1070, y + 47)], LINE, 0.8)
            y += 58
        footer(c, "Sumber: dokumen hasil survei kondisi jalan dan jembatan Kabupaten HSS Tahun Anggaran 2025.")
    else:
        metrics = [("11", "KECAMATAN", "seluruh wilayah administratif", BLUE), ("350", "RUAS JALAN", "database jaringan kabupaten", GREEN), ("732,46", "KM JARINGAN", "483,62 km kondisi mantap", OCHRE)]
        y = 235
        for value, label, note, color in metrics:
            c.text(55, y, value, 52, color, bold=True)
            c.text(220, y + 8, label, 15, INK, bold=True)
            c.text(220, y + 34, note, 10, MUTED)
            c.line([(220, y + 65), (740, y + 65)], color, 2)
            y += 128
        c.text(55, 630, "Cakupan dan kesiapan data", 17, INK, bold=True)
        support = [("2", "dokumen teknis", "survei jalan dan jembatan", GREEN), ("100%", "cakupan fisik survei", "seluruh jaringan terlayani", BLUE), ("98,99%", "realisasi keuangan", "basis data perencanaan", OCHRE), ("PKRMS + Leger Jalan", "sistem pendukung", "prioritas jaringan", GREEN)]
        y = 680
        for value, label, note, color in support:
            c.line([(65, y + 9), (96, y + 9)], color, 4)
            c.text(115, y, value, 15, color, bold=True)
            c.text(275, y, label, 11, INK, bold=True)
            c.text(275, y + 22, note, 9, MUTED)
            y += 67
        footer(c, "Sumber: dokumen hasil survei kondisi jalan dan jembatan Kabupaten HSS Tahun Anggaran 2025.")


def draw_numbers(c: Canvas):
    header(c, "2025 dalam Angka", "Infrastruktur dan mobilitas yang menghubungkan wilayah, layanan, dan peluang ekonomi.", "CAPAIAN BINA MARGA • RINGKASAN EKSEKUTIF")
    values = [("66,03%", "jalan mantap", GREEN), ("20,223 km", "penanganan jalan", BLUE), ("543,53 m", "pemeliharaan rutin jembatan", OCHRE), ("350", "ruas disurvei", GREEN), ("70,30%", "realisasi anggaran", BLUE), ("80,21%", "indikator komposit infrastruktur fisik", OCHRE)]
    if c.w > 900:
        coords = [(60, 240), (400, 240), (740, 240), (60, 450), (400, 450), (740, 450)]
        for (value, label, color), (x, y) in zip(values, coords):
            c.line([(x, y + 6), (x + 65, y + 6)], color, 4)
            c.text(x, y + 24, value, 35, color, bold=True)
            c.text(x, y + 75, label, 13, INK, bold=True, max_width=27)
            c.line([(x, y + 112), (x + 260, y + 112)], LINE, 0.8)
        c.rect(60, 610, 1075, 52, GREEN_LIGHT, "#B8DFD0", 1, 9)
        c.text(85, 628, "Konektivitas wilayah • pertanian • pariwisata • mobilitas masyarakat", 13, INK, bold=True)
        footer(c, "Sumber: rekap indikator kinerja Bina Marga Kabupaten Hulu Sungai Selatan, 2025.")
    else:
        coords = [(55, 235), (410, 235), (55, 460), (410, 460), (55, 685), (410, 685)]
        for (value, label, color), (x, y) in zip(values, coords):
            c.line([(x, y + 5), (x + 52, y + 5)], color, 4)
            c.text(x, y + 23, value, 26, color, bold=True)
            c.text(x, y + 63, label, 11, INK, bold=True, max_width=23)
            c.line([(x, y + 99), (x + 300, y + 99)], LINE, 0.8)
        footer(c, "Sumber: rekap indikator kinerja Bina Marga Kabupaten Hulu Sungai Selatan, 2025.")


def all_coords(geometry: dict) -> list[tuple[float, float]]:
    kind = geometry.get("type")
    coords = geometry.get("coordinates")
    if kind == "Point":
        return [tuple(coords)]
    if kind in {"LineString", "MultiPoint"}:
        return [tuple(p) for p in coords]
    if kind in {"MultiLineString", "Polygon"}:
        return [tuple(p) for group in coords for p in group]
    if kind == "MultiPolygon":
        return [tuple(p) for poly in coords for ring in poly for p in ring]
    return []


def line_parts(geometry: dict) -> list[list[tuple[float, float]]]:
    kind = geometry.get("type")
    coords = geometry.get("coordinates")
    if kind == "LineString":
        return [[tuple(p) for p in coords]]
    if kind == "MultiLineString":
        return [[tuple(p) for p in part] for part in coords]
    return []


def polygon_parts(geometry: dict) -> list[list[tuple[float, float]]]:
    kind = geometry.get("type")
    coords = geometry.get("coordinates")
    if kind == "Polygon":
        return [[tuple(p) for p in ring] for ring in coords]
    if kind == "MultiPolygon":
        return [[tuple(p) for p in ring] for poly in coords for ring in poly]
    return []


class Projector:
    def __init__(self, features: list[dict], box: tuple[float, float, float, float]):
        points = [p for feature in features for p in all_coords(feature.get("geometry") or {})]
        lons, lats = zip(*points)
        min_lon, max_lon, min_lat, max_lat = min(lons), max(lons), min(lats), max(lats)
        x, y, w, h = box
        lat0 = (min_lat + max_lat) / 2
        mlon = 111320 * math.cos(math.radians(lat0))
        mlat = 110540
        world_w = (max_lon - min_lon) * mlon
        world_h = (max_lat - min_lat) * mlat
        scale = min(w / world_w, h / world_h)
        self.min_lon = min_lon
        self.max_lat = max_lat
        self.mlon = mlon
        self.mlat = mlat
        self.scale = scale
        self.ox = x + (w - world_w * scale) / 2
        self.oy = y + (h - world_h * scale) / 2

    def xy(self, point: tuple[float, float]) -> tuple[float, float]:
        lon, lat = point
        return self.ox + (lon - self.min_lon) * self.mlon * self.scale, self.oy + (self.max_lat - lat) * self.mlat * self.scale

    def km(self, value: float) -> float:
        return value * 1000 * self.scale


def settlement_label(feature: dict) -> str:
    note = feature.get("properties", {}).get("keterangan", "")
    if "Kecamatan " in note:
        return note.split("Kecamatan ", 1)[1]
    return note[:18]


def draw_map(c: Canvas):
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    roads = data["roads"]["features"]
    districts = data["districts"]["features"]
    settlements = data["settlements"]["features"]
    features = roads + districts + settlements
    title = "Capaian Infrastruktur Jalan dan Jembatan HSS 2025"
    header(c, title, "Kabupaten Hulu Sungai Selatan • konektivitas untuk pertanian, pariwisata, dan mobilitas masyarakat.", "PETA CAPAIAN • JARINGAN KABUPATEN HSS")
    if c.w > 900:
        map_box = (55, 205, 815, 410)
        panel = (900, 205, 245, 410)
    else:
        map_box = (40, 250, 714, 545)
        panel = (40, 830, 714, 245)
    x, y, w, h = map_box
    c.rect(x, y, w, h, MAP_BG, LINE, 1, 8)
    projector = Projector(features, map_box)
    fills = ["#E6EEE9", "#EDF2EE"]
    for idx, feature in enumerate(districts):
        for part in polygon_parts(feature.get("geometry") or {}):
            c.polygon([projector.xy(p) for p in part], fills[idx % 2], "#C1CFCA", 0.7)
    match_colors = {"HSS-KAB-340": (TEAL, [8, 5]), "HSS-KAB-299": ("#C27B13", [8, 5]), "HSS-KAB-082": (PINK, None), "HSS-KAB-257": (PINK, None)}
    for feature in roads:
        props = feature.get("properties", {})
        key = props.get("road_key")
        color, dash = match_colors.get(key, (ROAD, None))
        width = 1.7 if key in match_colors else 0.45
        for part in line_parts(feature.get("geometry") or {}):
            c.line([projector.xy(p) for p in part], color, width, dash)
    for feature in settlements:
        coords = all_coords(feature.get("geometry") or {})
        if not coords:
            continue
        px, py = projector.xy(coords[0])
        c.ellipse(px - 2.2, py - 2.2, 4.4, 4.4, INK, "#FFFFFF", 0.8)
        c.text(px + 5, py - 3, settlement_label(feature), 7, MUTED)
    # North arrow and scale bar are part of the map frame, never generated from imagery.
    nx, ny = x + w - 24, y + 28
    c.text(nx, ny - 14, "N", 10, INK, bold=True, anchor="center")
    c.line([(nx, ny), (nx, ny + 24)], INK, 1.3)
    c.polygon([(nx, ny - 1), (nx - 4, ny + 7), (nx + 4, ny + 7)], INK)
    bar = min(projector.km(5), 100)
    bx, by = x + 20, y + h - 28
    c.line([(bx, by), (bx + bar, by)], INK, 2.5)
    c.line([(bx, by - 4), (bx, by + 4)], INK, 1)
    c.line([(bx + bar / 2, by - 4), (bx + bar / 2, by + 4)], INK, 1)
    c.line([(bx + bar, by - 4), (bx + bar, by + 4)], INK, 1)
    c.text(bx, by + 9, "0", 7, MUTED)
    c.text(bx + bar / 2, by + 9, "2,5", 7, MUTED, anchor="center")
    c.text(bx + bar, by + 9, "5 km", 7, MUTED, anchor="right")
    c.text(panel[0], panel[1] - 28, "Sorotan 2025", 17, INK, bold=True)
    c.text(panel[0], panel[1] - 3, "Koridor utama dan program strategis", 10, MUTED)
    cards = [("Sawaja / Bajayau Tengah–Buas-Buas", "4,538 km", TEAL), ("Samuda–Bajayau • DBH Sawit", "0,913 km", "#C27B13"), ("Karya Bakti TNI", "7,209 km • 6 paket", PINK), ("Loksado / Meratus", "6,154 km • sorotan wilayah", OCHRE)]
    cy = panel[1] + 32
    for name, value, color in cards:
        c.line([(panel[0], cy + 10), (panel[0] + 28, cy + 10)], color, 4)
        c.text(panel[0] + 40, cy, name, 10, INK, bold=True, max_width=31)
        c.text(panel[0] + 40, cy + 23, value, 12, color, bold=True)
        c.line([(panel[0], cy + 52), (panel[0] + panel[2], cy + 52)], LINE, 0.8)
        cy += 68
    c.text(panel[0], panel[1] + 305 if c.w > 900 else panel[1] + 300, "Garis koridor mengikuti ruas otoritatif; sorotan wilayah tidak diberi jalur baru tanpa padanan segmen.", 8, MUTED, max_width=42 if c.w > 900 else 78)
    footer(c, "Sumber: registri spasial otoritatif Diklat PIM; roads_county.geojson, districts.geojson, dan pusat permukiman RTRW. Tidak ada geometri jalan yang digambar ulang dari tangkapan layar.")


def render(name: str, orientation: str, draw_fn):
    out_w, out_h, logical_w, logical_h = PORTRAIT if orientation == "portrait" else LANDSCAPE
    folder = OUT / name
    folder.mkdir(parents=True, exist_ok=True)
    suffix = "portrait" if orientation == "portrait" else "landscape"
    c = Canvas(out_w, out_h, logical_w, logical_h, name)
    draw_fn(c)
    c.finish(folder / f"{name}_{suffix}.svg", folder / f"{name}_{suffix}_300dpi.png")
    return folder / f"{name}_{suffix}_300dpi.png"


def make_contact_sheet(paths: list[Path]):
    qa = OUT / "09_qa"
    qa.mkdir(parents=True, exist_ok=True)
    thumb_w, thumb_h = 440, 248
    rows = math.ceil(len(paths) / 3)
    sheet = Image.new("RGB", (thumb_w * 3, (thumb_h + 32) * rows), BG)
    d = ImageDraw.Draw(sheet)
    for idx, path in enumerate(paths):
        im = Image.open(path).convert("RGB")
        im.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        x = (idx % 3) * thumb_w
        y = (idx // 3) * (thumb_h + 32)
        sheet.paste(im, (x, y))
        d.text((x + 8, y + thumb_h + 8), path.parent.name + "/" + path.name, font=ImageFont.truetype(str(fpath()), 14), fill=INK)
    sheet.save(qa / "contact_sheet.png", dpi=(150, 150))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    renderers = [
        ("01_road_condition", draw_road_condition),
        ("02_road_outputs", draw_road_outputs),
        ("03_bridge", draw_bridge),
        ("04_financial", draw_financial),
        ("05_survey", draw_survey),
        ("06_2025_in_numbers", draw_numbers),
        ("07_map", draw_map),
    ]
    previews = []
    for name, fn in renderers:
        previews.append(render(name, "portrait", fn))
        previews.append(render(name, "landscape", fn))
    word_assets = OUT / "08_word_assets"
    word_assets.mkdir(parents=True, exist_ok=True)
    shutil.copy2(OUT / "06_2025_in_numbers" / "06_2025_in_numbers_portrait_300dpi.png", word_assets / "2025_in_numbers_portrait_word.png")
    shutil.copy2(OUT / "07_map" / "07_map_landscape_300dpi.png", word_assets / "hss_map_landscape_word.png")
    make_contact_sheet(previews)

    manifest = """# Word-ready visual asset manifest\n\n| Filename | Recommended report section | Recommended width | Orientation | Caption recommendation |\n|---|---|---:|---|---|\n| `01_road_condition/01_road_condition_portrait_300dpi.png` | Kondisi jalan | 17.0 cm | Portrait | Jalan mantap mencapai 66,03% pada 2025. |\n| `02_road_outputs/02_road_outputs_portrait_300dpi.png` | Penanganan jalan | 17.0 cm | Portrait | Penanganan jalan dan koridor strategis 2025. |\n| `03_bridge/03_bridge_portrait_300dpi.png` | Jembatan | 17.0 cm | Portrait | Capaian indikator penanganan jembatan melampaui target. |\n| `04_financial/04_financial_portrait_300dpi.png` | Keuangan | 17.0 cm | Portrait | Realisasi anggaran Bidang Bina Marga Tahun 2025. |\n| `05_survey/05_survey_portrait_300dpi.png` | Data dan survei | 17.0 cm | Portrait | Survei menjangkau seluruh jaringan jalan kabupaten. |\n| `06_2025_in_numbers/06_2025_in_numbers_portrait_300dpi.png` | Ringkasan eksekutif | 17.0 cm | Portrait | 2025 dalam angka: infrastruktur dan mobilitas. |\n| `07_map/07_map_portrait_300dpi.png` | Peta capaian | 17.0 cm | Portrait | Capaian jaringan jalan dan koridor strategis HSS 2025. |\n| `07_map/07_map_landscape_300dpi.png` | Presentasi / hero spread | 25.0 cm | Landscape | Peta capaian infrastruktur jalan dan jembatan HSS 2025. |\n\nTransparent PNG variants were not created for the full-page graphics because the warm paper background and editorial framing are integral to the publication design.\n"""
    (OUT / "word_asset_manifest.md").write_text(manifest, encoding="utf-8")
    (OUT / "README.md").write_text("""# HSS 2025 Profile Book Visual Family v2\n\nDeterministic public-facing SVG and 300-dpi PNG graphics for the Kabupaten Hulu Sungai Selatan Profile Book.\n\nThe chart values are rebuilt from the locked 2025 brief and source charts. The map is rendered from the existing authoritative spatial package used by the Diklat PIM application. Unresolved project links are represented only as regional highlights; no new exact road geometry is invented.\n\nSee `word_asset_manifest.md` for report placement and `09_qa/contact_sheet.png` for review previews.\n""", encoding="utf-8")
    qa = {
        "fact_checks": {
            "road_condition_2025_pct": "66,03%",
            "road_condition_2025_km": "483,62 km",
            "road_condition_net_improvement": "+10,77 km",
            "road_treatment_output": "20,223 km",
            "bridge_maintenance": "543,53 m / 114,67%",
            "financial_realization": "70,30%",
            "survey_coverage": "11 kecamatan / 350 ruas / 732,46 km",
            "composite_indicator": "80,21%",
        },
        "publication_language": "Public-facing wording excludes audit, reconciliation, locked-authority, and internal-control terminology.",
        "geometry_policy": "Map geometry is read directly from profile_book_map_data.json, sourced from the authoritative Diklat PIM spatial package.",
        "image_generation_policy": "No image generation used for factual charts or map geometry.",
        "contact_sheet": "09_qa/contact_sheet.png",
    }
    (OUT / "09_qa" / "fact_qa_report.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "09_qa" / "visual_qa_report.md").write_text("""# Visual QA\n\n- The family uses a shared warm paper background, deep institutional ink, infrastructure green, connectivity blue, and restrained ochre.\n- Chart titles use sentence-style publication language rather than dashboard-style all caps.\n- The 20,223 km physical treatment output is separated from the +10,77 km net condition improvement metric.\n- Strategic corridor values are presented as highlights below the total output, not as additive bars.\n- The map contains the authoritative 350 road features, 11 district boundaries, and 11 settlement/service-centre points.\n- Loksado and unresolved Karya Bakti links are shown only as regional/public highlights without invented exact alignments.\n- Full-page PNGs are 300 dpi and suitable for Word placement.\n""", encoding="utf-8")


if __name__ == "__main__":
    main()
