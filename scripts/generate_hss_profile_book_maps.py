"""Generate publication maps for the 2025 Kabupaten HSS Profile Book.

The renderer reads only the authoritative clean spatial exports that drive the
existing Diklat PIM map.  It never reconstructs road geometry from pixels or
screenshots.  Project links are deliberately conservative: exact named road
matches are shown, while partial or missing project extents are reported in
the reconciliation list instead of being invented.
"""

from __future__ import annotations

import csv
import html
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "01_authoritative_seed" / "diklat_pim_data_seed_v5_authoritative_registry"
OUT = ROOT / "reports" / "profile_book_map"

ROADS_PATH = SEED / "spatial" / "roads_county.geojson"
DISTRICTS_PATH = SEED / "administration" / "districts.geojson"
SETTLEMENTS_PATH = SEED / "spatial" / "rtrw_pusat_permukiman.geojson"

ROAD_KEYS = {
    "bajayau_sawaja": "HSS-KAB-340",
    "samuda_bajayau": "HSS-KAB-299",
    "karya_bakti_biti": "HSS-KAB-082",
    "karya_bakti_balimau": "HSS-KAB-257",
}

RECONCILIATION = [
    {
        "project": "Bajayau Tengah–Buas–Buas (Sawaja)",
        "claimed_length_km": 4.538,
        "funding_or_note": "Strategic 2025 corridor",
        "status": "EXACT_NAMED_MATCH_PARTIAL_EXTENT",
        "road_keys": ROAD_KEYS["bajayau_sawaja"],
        "evidence": "Per project clarification, Buas Buas / Sawaja is the authoritative Bajayau – Bajayau Tengah feature HSS-KAB-340. The 4.538 km project extent is shorter than the full authoritative feature and is not linear-referenced in the supplied data.",
        "map_treatment": "Full authoritative named road shown with extent-uncertain highlight; no partial segment inferred.",
    },
    {
        "project": "Samuda–Bajayau",
        "claimed_length_km": 0.913,
        "funding_or_note": "DBH Sawit",
        "status": "EXACT_NAMED_MATCH_PARTIAL_EXTENT",
        "road_keys": ROAD_KEYS["samuda_bajayau"],
        "evidence": "Exact canonical road-name match to HSS-KAB-299; authoritative feature length is 8.443 km, so the 0.913 km project extent is not identifiable from supplied data.",
        "map_treatment": "Full authoritative named road shown with dashed extent-uncertain highlight; no partial segment inferred.",
    },
    {
        "project": "Loksado strategic corridor",
        "claimed_length_km": 6.154,
        "funding_or_note": "Across relevant packages",
        "status": "UNRESOLVED",
        "road_keys": "",
        "evidence": "No package list or project-to-road crosswalk is present. Multiple Loksado road features exist, so selecting a subset would be speculative.",
        "map_treatment": "No corridor alignment drawn; reconciliation callout only.",
    },
    {
        "project": "Karya Bakti TNI road packages",
        "claimed_length_km": 7.209,
        "funding_or_note": "Six packages",
        "status": "PARTIALLY_RECONCILED",
        "road_keys": f"{ROAD_KEYS['karya_bakti_biti']}; {ROAD_KEYS['karya_bakti_balimau']}",
        "evidence": "Two exact source-name matches are present: HSS-KAB-082 (1.816 km) and HSS-KAB-257 (0.856 km), together 2.673 km. Four additional package links are not present.",
        "map_treatment": "Two exact named matches highlighted; remaining four packages stay unresolved.",
    },
]


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def all_coords(geometry: dict[str, Any]) -> list[tuple[float, float]]:
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
    if kind == "GeometryCollection":
        return [p for g in geometry.get("geometries", []) for p in all_coords(g)]
    return []


def line_parts(geometry: dict[str, Any]) -> list[list[tuple[float, float]]]:
    kind = geometry.get("type")
    coords = geometry.get("coordinates")
    if kind == "LineString":
        return [[tuple(p) for p in coords]]
    if kind == "MultiLineString":
        return [[tuple(p) for p in part] for part in coords]
    if kind == "GeometryCollection":
        return [part for g in geometry.get("geometries", []) for part in line_parts(g)]
    return []


def polygon_parts(geometry: dict[str, Any]) -> list[list[tuple[float, float]]]:
    kind = geometry.get("type")
    coords = geometry.get("coordinates")
    if kind == "Polygon":
        return [[tuple(p) for p in ring] for ring in coords]
    if kind == "MultiPolygon":
        return [[tuple(p) for p in ring] for poly in coords for ring in poly]
    if kind == "GeometryCollection":
        return [part for g in geometry.get("geometries", []) for part in polygon_parts(g)]
    return []


def text_lines(value: str, max_chars: int) -> list[str]:
    words = value.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > max_chars:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or [""]


@dataclass
class Box:
    x: float
    y: float
    w: float
    h: float


class Projector:
    def __init__(self, bounds: tuple[float, float, float, float], box: Box):
        min_lon, min_lat, max_lon, max_lat = bounds
        self.min_lon = min_lon
        self.max_lat = max_lat
        lat0 = (min_lat + max_lat) / 2
        self.m_per_lon = 111_320 * math.cos(math.radians(lat0))
        self.m_per_lat = 110_540
        world_w = max((max_lon - min_lon) * self.m_per_lon, 1)
        world_h = max((max_lat - min_lat) * self.m_per_lat, 1)
        self.scale = min(box.w / world_w, box.h / world_h)
        drawn_w = world_w * self.scale
        drawn_h = world_h * self.scale
        self.origin_x = box.x + (box.w - drawn_w) / 2
        self.origin_y = box.y + (box.h - drawn_h) / 2

    def xy(self, point: tuple[float, float]) -> tuple[float, float]:
        lon, lat = point
        x = self.origin_x + (lon - self.min_lon) * self.m_per_lon * self.scale
        y = self.origin_y + (self.max_lat - lat) * self.m_per_lat * self.scale
        return x, y


def source_bounds(*collections: dict[str, Any]) -> tuple[float, float, float, float]:
    points: list[tuple[float, float]] = []
    for collection in collections:
        for feature in collection.get("features", []):
            points.extend(all_coords(feature.get("geometry") or {}))
    lons = [p[0] for p in points]
    lats = [p[1] for p in points]
    return min(lons), min(lats), max(lons), max(lats)


def safe_font(size: int, bold: bool = False, italic: bool = False) -> ImageFont.FreeTypeFont:
    candidates = []
    if bold:
        candidates.append(Path("C:/Windows/Fonts/segoeuib.ttf"))
    elif italic:
        candidates.append(Path("C:/Windows/Fonts/segoeuii.ttf"))
    else:
        candidates.append(Path("C:/Windows/Fonts/segoeui.ttf"))
    candidates.extend([Path("C:/Windows/Fonts/arial.ttf"), Path("C:/Windows/Fonts/Arial.ttf")])
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def svg_attrs(attrs: dict[str, Any]) -> str:
    return " ".join(f'{key}="{html.escape(str(value), quote=True)}"' for key, value in attrs.items())


def svg_text(x: float, y: float, content: str, size: float, fill: str, *, weight: str = "400", anchor: str = "start", family: str = "Arial, sans-serif", italic: bool = False) -> str:
    style = f"font-family:{family};font-size:{size}px;font-weight:{weight};"
    if italic:
        style += "font-style:italic;"
    return f'<text x="{x:.1f}" y="{y:.1f}" fill="{fill}" text-anchor="{anchor}" style="{style}">{html.escape(content)}</text>'


def svg_path(parts: Iterable[list[tuple[float, float]]], projector: Projector, attrs: dict[str, Any]) -> str:
    commands: list[str] = []
    for part in parts:
        if len(part) < 2:
            continue
        x0, y0 = projector.xy(part[0])
        commands.append(f"M {x0:.2f} {y0:.2f}")
        for p in part[1:]:
            x, y = projector.xy(p)
            commands.append(f"L {x:.2f} {y:.2f}")
    return f'<path d="{" ".join(commands)}" {svg_attrs(attrs)}/>'


def svg_polygon(parts: Iterable[list[tuple[float, float]]], projector: Projector, attrs: dict[str, Any]) -> str:
    rings = []
    for part in parts:
        points = [projector.xy(p) for p in part]
        if len(points) > 2:
            rings.append(" ".join(f"{x:.2f},{y:.2f}" for x, y in points))
    return f'<polygon points="{" ".join(rings)}" {svg_attrs(attrs)}/>'


def get_road(roads: dict[str, Any], key: str) -> dict[str, Any]:
    return next(f for f in roads["features"] if f.get("properties", {}).get("road_key") == key)


def settlement_name(feature: dict[str, Any]) -> str:
    note = feature.get("properties", {}).get("keterangan", "")
    match = re.search(r"Kecamatan\s+(.+)$", note)
    return match.group(1).strip() if match else note


def add_svg_legend(parts: list[str], x: float, y: float, compact: bool = False) -> float:
    size = 18 if compact else 22
    gap = 34 if compact else 42
    parts.append(svg_text(x, y, "LEGENDA", size, "#203539", weight="700"))
    y += gap
    entries = [
        ("#8c999a", "Jalan kabupaten — seluruh 350 fitur otoritatif", "line"),
        ("#2d8c87", "Sawaja — HSS-KAB-340; extent parsial", "dash"),
        ("#bb6f93", "Karya Bakti TNI — match nama eksak", "line"),
        ("#c17c00", "Samuda–Bajayau — extent parsial", "dash"),
        ("#b7c1c2", "Batas kecamatan", "boundary"),
        ("#334e52", "Pusat permukiman utama", "point"),
    ]
    for color, label, kind in entries:
        if kind == "line":
            parts.append(f'<line x1="{x:.1f}" y1="{y-6:.1f}" x2="{x+42:.1f}" y2="{y-6:.1f}" stroke="{color}" stroke-width="5" stroke-linecap="round"/>')
        elif kind == "dash":
            parts.append(f'<line x1="{x:.1f}" y1="{y-6:.1f}" x2="{x+42:.1f}" y2="{y-6:.1f}" stroke="{color}" stroke-width="5" stroke-dasharray="9 6" stroke-linecap="round"/>')
        elif kind == "boundary":
            parts.append(f'<line x1="{x:.1f}" y1="{y-6:.1f}" x2="{x+42:.1f}" y2="{y-6:.1f}" stroke="{color}" stroke-width="2"/>')
        else:
            parts.append(f'<circle cx="{x+21:.1f}" cy="{y-6:.1f}" r="5" fill="{color}" stroke="#f7f5ef" stroke-width="2"/>')
        for i, line in enumerate(text_lines(label, 38 if compact else 48)):
            parts.append(svg_text(x + 58, y + i * (size + 5), line, size, "#3c4f52"))
        y += max(1, len(text_lines(label, 38 if compact else 48))) * (size + 5) + 14
    return y


def add_svg_scale_bar(parts: list[str], projector: Projector, box: Box, y: float) -> None:
    km = 5
    width = km * 1000 * projector.scale
    if width > box.w * 0.22:
        km = 2
        width = km * 1000 * projector.scale
    x = box.x + 40
    height = 12
    parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{width/2:.1f}" height="{height}" fill="#334e52"/>')
    parts.append(f'<rect x="{x+width/2:.1f}" y="{y:.1f}" width="{width/2:.1f}" height="{height}" fill="#f7f5ef" stroke="#334e52" stroke-width="1"/>')
    parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{width:.1f}" height="{height}" fill="none" stroke="#334e52" stroke-width="1"/>')
    parts.append(svg_text(x, y + 32, "0", 16, "#334e52"))
    parts.append(svg_text(x + width / 2, y + 32, f"{km/2:g}", 16, "#334e52", anchor="middle"))
    parts.append(svg_text(x + width, y + 32, f"{km:g} km", 16, "#334e52", anchor="end"))


def add_svg_north_arrow(parts: list[str], box: Box) -> None:
    x = box.x + box.w - 55
    y = box.y + 48
    parts.append(svg_text(x, y - 10, "N", 24, "#203539", weight="700", anchor="middle"))
    parts.append(f'<path d="M {x:.1f} {y+55:.1f} L {x:.1f} {y+4:.1f} L {x-10:.1f} {y+22:.1f} M {x:.1f} {y+4:.1f} L {x+10:.1f} {y+22:.1f}" fill="none" stroke="#203539" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>')


def add_svg_stat_cards(parts: list[str], width: int, *, compact: bool) -> None:
    stats = [
        ("350", "RUAS KABUPATEN"),
        ("732,460 km", "TOTAL JARINGAN"),
        ("11", "KECAMATAN"),
        ("148", "DESA / KELURAHAN"),
        ("4", "RUAS DENGAN MATCH PROYEK"),
        ("2,673 km", "MATCH KARYA BAKTI EKSAK"),
    ]
    cols = 3 if compact else 6
    card_gap = 14
    outer = 150
    card_w = (width - (outer * 2) - (card_gap * (cols - 1))) / cols
    card_h = 82
    start_y = 225 if compact else 215
    for i, (value, label) in enumerate(stats):
        row, col = divmod(i, cols)
        x = outer + col * (card_w + card_gap)
        y = start_y + row * (card_h + 12)
        parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{card_w:.1f}" height="{card_h}" rx="10" fill="#fbfaf6" stroke="#d5ddda" stroke-width="2"/>')
        parts.append(svg_text(x + 18, y + 36, value, 27 if not compact else 24, "#1e6d70", weight="700"))
        parts.append(svg_text(x + 18, y + 62, label, 13 if not compact else 12, "#687879", weight="700"))


def map_svg(roads: dict[str, Any], districts: dict[str, Any], settlements: dict[str, Any], *, version: str) -> str:
    if version == "technical":
        width, height = 4200, 3000
        map_box = Box(150, 350, 2800, 2450)
        panel = Box(3060, 350, 990, 2450)
        compact = False
    else:
        width, height = 3000, 4200
        map_box = Box(150, 470, 2700, 2670)
        panel = Box(150, 3260, 2700, 770)
        compact = True

    bounds = source_bounds(roads, districts, settlements)
    projector = Projector(bounds, map_box)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<defs><pattern id="uncertain" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="12" stroke="#c17c00" stroke-width="5" opacity="0.42"/></pattern></defs>',
        '<rect width="100%" height="100%" fill="#f7f5ef"/>',
        f'<rect x="{map_box.x}" y="{map_box.y}" width="{map_box.w}" height="{map_box.h}" fill="#eef2f0" stroke="#cdd7d4" stroke-width="2"/>',
        svg_text(150, 105, "KABUPATEN HULU SUNGAI SELATAN", 44 if not compact else 42, "#203539", weight="700"),
        svg_text(150, 165, "Profile Book 2025 · jaringan jalan kabupaten dan koridor strategis", 25 if not compact else 23, "#5c6c6e"),
        svg_text(width - 150, 105, "Diklat PIM", 24, "#8d5a3a", weight="700", anchor="end"),
        svg_text(width - 150, 140, "MAP PLATE · 2025", 16, "#6c7a7b", anchor="end"),
    ]
    add_svg_stat_cards(parts, width, compact=compact)

    # Administrative context first.
    district_features = districts.get("features", [])
    for i, feature in enumerate(district_features):
        fill = "#e8eeeb" if i % 2 == 0 else "#f0f3f0"
        parts.append(svg_polygon(polygon_parts(feature["geometry"]), projector, {"fill": fill, "stroke": "#b7c1c2", "stroke-width": 2, "fill-rule": "evenodd"}))

    # Base network: every authoritative county road feature, no simplification.
    for feature in roads.get("features", []):
        parts.append(svg_path(line_parts(feature["geometry"]), projector, {"fill": "none", "stroke": "#8c999a", "stroke-width": 2.0 if compact else 1.8, "stroke-opacity": 0.68, "stroke-linecap": "round", "stroke-linejoin": "round"}))

    # Verified named matches. Full geometry is used where a project extent is not
    # supplied; the uncertain extent is made visible through the dash treatment.
    bajayau = get_road(roads, ROAD_KEYS["bajayau_sawaja"])
    parts.append(svg_path(line_parts(bajayau["geometry"]), projector, {"fill": "none", "stroke": "#fffaf1", "stroke-width": 13 if not compact else 11, "stroke-linecap": "round", "stroke-linejoin": "round"}))
    parts.append(svg_path(line_parts(bajayau["geometry"]), projector, {"fill": "none", "stroke": "#2d8c87", "stroke-width": 7 if not compact else 6, "stroke-dasharray": "20 10", "stroke-linecap": "round", "stroke-linejoin": "round"}))
    for key in [ROAD_KEYS["karya_bakti_biti"], ROAD_KEYS["karya_bakti_balimau"]]:
        road = get_road(roads, key)
        parts.append(svg_path(line_parts(road["geometry"]), projector, {"fill": "none", "stroke": "#fffaf1", "stroke-width": 11 if not compact else 9, "stroke-linecap": "round", "stroke-linejoin": "round"}))
        parts.append(svg_path(line_parts(road["geometry"]), projector, {"fill": "none", "stroke": "#bb6f93", "stroke-width": 6 if not compact else 5, "stroke-linecap": "round", "stroke-linejoin": "round"}))
    samuda = get_road(roads, ROAD_KEYS["samuda_bajayau"])
    parts.append(svg_path(line_parts(samuda["geometry"]), projector, {"fill": "none", "stroke": "#fffaf1", "stroke-width": 12 if not compact else 10, "stroke-linecap": "round", "stroke-linejoin": "round"}))
    parts.append(svg_path(line_parts(samuda["geometry"]), projector, {"fill": "none", "stroke": "#c17c00", "stroke-width": 6 if not compact else 5, "stroke-dasharray": "18 12", "stroke-linecap": "round", "stroke-linejoin": "round"}))

    # Major settlement/service-centre labels only.
    for feature in settlements.get("features", []):
        coords = feature.get("geometry", {}).get("coordinates", [0, 0])
        x, y = projector.xy(tuple(coords))
        name = settlement_name(feature)
        is_local = "Pusat Kegiatan Lokal" in feature.get("properties", {}).get("nama_objek", "")
        parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{8 if is_local else 5}" fill="#334e52" stroke="#f7f5ef" stroke-width="3"/>')
        parts.append(svg_text(x + 13, y + 5, name, 20 if not compact else 18, "#334e52", weight="700" if is_local else "400"))

    # District labels are subtle, but make the boundaries useful in print.
    for feature in district_features:
        coords = all_coords(feature["geometry"])
        if not coords:
            continue
        lon = sum(p[0] for p in coords) / len(coords)
        lat = sum(p[1] for p in coords) / len(coords)
        x, y = projector.xy((lon, lat))
        name = feature.get("properties", {}).get("district_name", "")
        parts.append(svg_text(x, y, name.upper(), 14 if not compact else 12, "#839092", weight="700", anchor="middle"))

    add_svg_north_arrow(parts, map_box)
    add_svg_scale_bar(parts, projector, map_box, map_box.y + map_box.h - 55)

    # Panel / editorial callouts.
    parts.append(f'<rect x="{panel.x}" y="{panel.y}" width="{panel.w}" height="{panel.h}" rx="18" fill="#fbfaf6" stroke="#d5ddda" stroke-width="2"/>')
    px = panel.x + 42
    py = panel.y + 55
    if version == "technical":
        parts.append(svg_text(px, py, "REKONSILIASI PROYEK STRATEGIS 2025", 21, "#203539", weight="700"))
        py += 38
        parts.append(svg_text(px, py, "Only authoritative named matches are mapped.", 19, "#5c6c6e"))
        py += 45
        mapped = [
            ("TERPETAKAN · MATCH NAMA EKSAK", "Bajayau Tengah–Buas–Buas (Sawaja) · HSS-KAB-340", "4.538 km diklaim · extent parsial belum terukur", "#2d8c87"),
            ("TERPETAKAN · MATCH NAMA EKSAK", "Samuda–Bajayau · HSS-KAB-299", "0.913 km diklaim · extent parsial belum terukur", "#c17c00"),
            ("TERPETAKAN · 2 DARI 6 MATCH NAMA", "Karya Bakti TNI · HSS-KAB-082 + HSS-KAB-257", "2.673 km match eksak · total klaim 7.209 km", "#bb6f93"),
        ]
        for kicker, title, body, color in mapped:
            parts.append(f'<rect x="{px}" y="{py}" width="{panel.w-84}" height="105" rx="10" fill="#f7f5ef" stroke="{color}" stroke-width="3"/>')
            parts.append(svg_text(px + 18, py + 27, kicker, 16, color, weight="700"))
            parts.append(svg_text(px + 18, py + 56, title, 19, "#203539", weight="700"))
            parts.append(svg_text(px + 18, py + 82, body, 16, "#5c6c6e"))
            py += 125
        unresolved = [
            ("BELUM TEREKONSILIASI", "Loksado strategic corridor", "≈6.154 km · daftar paket / crosswalk ruas belum tersedia", "#8f5d40"),
        ]
        for kicker, title, body, color in unresolved:
            parts.append(f'<rect x="{px}" y="{py}" width="{panel.w-84}" height="92" rx="10" fill="#f4f0e8" stroke="#d4c2b2" stroke-width="2"/>')
            parts.append(svg_text(px + 18, py + 25, kicker, 16, color, weight="700"))
            parts.append(svg_text(px + 18, py + 52, title, 18, "#463c37", weight="700"))
            parts.append(svg_text(px + 18, py + 76, body, 15, "#6d625b"))
            py += 110
        py += 15
        py = add_svg_legend(parts, px, py, compact=False)
        source_y = panel.y + panel.h - 160
        parts.append(svg_text(px, source_y, "CATATAN SUMBER", 18, "#203539", weight="700"))
        source_text = "Seed otoritatif Diklat PIM v5: roads_county.geojson (turunan ruas_jalan_kabupaten.gpkg), districts.geojson, dan rtrw_pusat_permukiman.geojson. CRS EPSG:4326. Layer sungai utama tidak tersedia; sungai tidak digambar. Extent paket tidak diada-adakan."
        for i, line in enumerate(text_lines(source_text, 62)):
            parts.append(svg_text(px, source_y + 28 + i * 21, line, 15, "#6b7778"))
    else:
        parts.append(svg_text(px, py, "KORIDOR STRATEGIS 2025", 19, "#203539", weight="700"))
        py += 34
        profile_text = "Lempeng profil ini menampilkan seluruh jaringan jalan kabupaten dengan overlay strategis yang terukur. Match nama eksak ditebalkan; extent proyek yang belum ada dalam register tetap terbuka untuk rekonsiliasi."
        for i, line in enumerate(text_lines(profile_text, 94)):
            parts.append(svg_text(px, py + i * 23, line, 17, "#5c6c6e"))
        py += len(text_lines(profile_text, 94)) * 23 + 28
        parts.append(f'<rect x="{px}" y="{py}" width="{panel.w-84}" height="78" rx="10" fill="#e6f3f1" stroke="#2d8c87" stroke-width="2"/>')
        parts.append(svg_text(px+18, py+27, "4.538 km · SAWAJA", 17, "#2d746f", weight="700"))
        parts.append(svg_text(px+18, py+54, "Bajayau Tengah–Buas–Buas — HSS-KAB-340; extent parsial", 17, "#4d443a"))
        py += 96
        parts.append(f'<rect x="{px}" y="{py}" width="{panel.w-84}" height="78" rx="10" fill="#fff3d6" stroke="#e2b457" stroke-width="2"/>')
        parts.append(svg_text(px+18, py+27, "0.913 km · DBH SAWIT", 17, "#9a6500", weight="700"))
        parts.append(svg_text(px+18, py+54, "Samuda–Bajayau — HSS-KAB-299; extent parsial", 17, "#4d443a"))
        py += 96
        parts.append(f'<rect x="{px}" y="{py}" width="{panel.w-84}" height="78" rx="10" fill="#f7e9f0" stroke="#bb6f93" stroke-width="2"/>')
        parts.append(svg_text(px+18, py+27, "2 match nama eksak", 17, "#922b59", weight="700"))
        parts.append(svg_text(px+18, py+54, "Karya Bakti TNI — HSS-KAB-082 and HSS-KAB-257", 17, "#4d443a"))
        py += 110
        parts.append(svg_text(px, py, "REKONSILIASI LANJUTAN", 17, "#8f5d40", weight="700"))
        py += 29
        for line in [
            "Loksado strategic corridor · ≈6.154 km",
            "Empat paket Karya Bakti lain · sisa menuju 7.209 km",
        ]:
            parts.append(svg_text(px, py, "• " + line, 16, "#6d625b"))
            py += 25
        py += 10
        add_svg_legend(parts, px, py, compact=True)
        source_y = panel.y + panel.h - 85
        parts.append(svg_text(px, source_y, "Sumber: seed otoritatif Diklat PIM v5 · EPSG:4326 · geometri jalan eksak; layer sungai utama tidak tersedia.", 14, "#6b7778"))

    parts.append(svg_text(150, height - 55, "Geometri peta mengikuti data spasial otoritatif; extent proyek tidak diada-adakan saat register belum lengkap.", 16, "#708080"))
    parts.append(svg_text(width - 150, height - 55, "BUKU PROFIL 2025 · HSS", 16, "#708080", anchor="end", weight="700"))
    parts.append("</svg>")
    return "\n".join(parts)


def draw_wrapped(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font: ImageFont.FreeTypeFont, fill: str, max_width: int, line_gap: int = 6) -> int:
    x, y = xy
    lines: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if current and draw.textbbox((0, 0), candidate, font=font)[2] > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    line_h = draw.textbbox((0, 0), "Ag", font=font)[3]
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        y += line_h + line_gap
    return y


def draw_stat_cards(draw: ImageDraw.ImageDraw, width: int, *, compact: bool) -> None:
    stats = [
        ("350", "RUAS KABUPATEN"),
        ("732,460 km", "TOTAL JARINGAN"),
        ("11", "KECAMATAN"),
        ("148", "DESA / KELURAHAN"),
        ("4", "RUAS DENGAN MATCH PROYEK"),
        ("2,673 km", "MATCH KARYA BAKTI EKSAK"),
    ]
    cols = 3 if compact else 6
    gap = 14
    outer = 150
    card_w = (width - (outer * 2) - (gap * (cols - 1))) / cols
    card_h = 82
    start_y = 225 if compact else 215
    for i, (value, label) in enumerate(stats):
        row, col = divmod(i, cols)
        x = outer + col * (card_w + gap)
        y = start_y + row * (card_h + 12)
        draw.rounded_rectangle((x, y, x + card_w, y + card_h), radius=10, fill="#fbfaf6", outline="#d5ddda", width=2)
        draw.text((x + 18, y + 13), value, font=safe_font(27 if not compact else 24, bold=True), fill="#1e6d70")
        draw.text((x + 18, y + 49), label, font=safe_font(13 if not compact else 12, bold=True), fill="#687879")


def map_png(roads: dict[str, Any], districts: dict[str, Any], settlements: dict[str, Any], *, version: str) -> Image.Image:
    if version == "technical":
        width, height = 4200, 3000
        map_box = Box(150, 350, 2800, 2450)
        panel = Box(3060, 350, 990, 2450)
        compact = False
    else:
        width, height = 3000, 4200
        map_box = Box(150, 470, 2700, 2670)
        panel = Box(150, 3260, 2700, 770)
        compact = True
    bounds = source_bounds(roads, districts, settlements)
    projector = Projector(bounds, map_box)
    image = Image.new("RGB", (width, height), "#f7f5ef")
    d = ImageDraw.Draw(image)
    d.rectangle((map_box.x, map_box.y, map_box.x + map_box.w, map_box.y + map_box.h), fill="#eef2f0", outline="#cdd7d4", width=2)
    title_font = safe_font(44 if not compact else 42, bold=True)
    sub_font = safe_font(25 if not compact else 23)
    d.text((150, 54), "KABUPATEN HULU SUNGAI SELATAN", font=title_font, fill="#203539")
    d.text((150, 124), "Profile Book 2025 · jaringan jalan kabupaten dan koridor strategis", font=sub_font, fill="#5c6c6e")
    d.text((width - 150, 54), "Diklat PIM", font=safe_font(24, bold=True), fill="#8d5a3a", anchor="ra")
    d.text((width - 150, 91), "MAP PLATE · 2025", font=safe_font(16), fill="#6c7a7b", anchor="ra")
    draw_stat_cards(d, width, compact=compact)

    for i, feature in enumerate(districts.get("features", [])):
        points = [projector.xy(p) for p in polygon_parts(feature["geometry"])[0]]
        d.polygon(points, fill="#e8eeeb" if i % 2 == 0 else "#f0f3f0", outline="#b7c1c2")
    for feature in roads.get("features", []):
        for part in line_parts(feature["geometry"]):
            d.line([projector.xy(p) for p in part], fill="#8c999a", width=2, joint="curve")
    for part in line_parts(get_road(roads, ROAD_KEYS["bajayau_sawaja"])["geometry"]):
        points = [projector.xy(p) for p in part]
        d.line(points, fill="#fffaf1", width=13 if not compact else 11, joint="curve")
        d.line(points, fill="#2d8c87", width=7 if not compact else 6, joint="curve")
    for key in [ROAD_KEYS["karya_bakti_biti"], ROAD_KEYS["karya_bakti_balimau"]]:
        for part in line_parts(get_road(roads, key)["geometry"]):
            points = [projector.xy(p) for p in part]
            d.line(points, fill="#fffaf1", width=11 if not compact else 9, joint="curve")
            d.line(points, fill="#bb6f93", width=6 if not compact else 5, joint="curve")
    for part in line_parts(get_road(roads, ROAD_KEYS["samuda_bajayau"])["geometry"]):
        points = [projector.xy(p) for p in part]
        d.line(points, fill="#fffaf1", width=12 if not compact else 10, joint="curve")
        d.line(points, fill="#c17c00", width=6 if not compact else 5, joint="curve")

    label_font = safe_font(20 if not compact else 18)
    small_font = safe_font(14 if not compact else 12, bold=True)
    for feature in settlements.get("features", []):
        x, y = projector.xy(tuple(feature["geometry"]["coordinates"]))
        is_local = "Pusat Kegiatan Lokal" in feature.get("properties", {}).get("nama_objek", "")
        d.ellipse((x - (8 if is_local else 5), y - (8 if is_local else 5), x + (8 if is_local else 5), y + (8 if is_local else 5)), fill="#334e52", outline="#f7f5ef", width=2)
        d.text((x + 13, y - 11), settlement_name(feature), font=label_font, fill="#334e52", stroke_width=0)
    for feature in districts.get("features", []):
        pts = all_coords(feature["geometry"])
        if pts:
            x, y = projector.xy((sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)))
            d.text((x, y), feature.get("properties", {}).get("district_name", "").upper(), font=small_font, fill="#839092", anchor="mm")

    # North arrow and scale bar.
    arrow_x = map_box.x + map_box.w - 55
    arrow_y = map_box.y + 48
    d.text((arrow_x, arrow_y - 30), "N", font=safe_font(24, bold=True), fill="#203539", anchor="ma")
    d.line((arrow_x, arrow_y + 55, arrow_x, arrow_y + 4), fill="#203539", width=3)
    d.polygon([(arrow_x, arrow_y + 4), (arrow_x - 10, arrow_y + 22), (arrow_x + 10, arrow_y + 22)], fill="#203539")
    km = 5
    width_bar = km * 1000 * projector.scale
    if width_bar > map_box.w * 0.22:
        km = 2
        width_bar = km * 1000 * projector.scale
    xbar = map_box.x + 40
    ybar = map_box.y + map_box.h - 55
    d.rectangle((xbar, ybar, xbar + width_bar / 2, ybar + 12), fill="#334e52")
    d.rectangle((xbar + width_bar / 2, ybar, xbar + width_bar, ybar + 12), fill="#f7f5ef", outline="#334e52")
    d.rectangle((xbar, ybar, xbar + width_bar, ybar + 12), outline="#334e52")
    d.text((xbar, ybar + 18), "0", font=safe_font(16), fill="#334e52")
    d.text((xbar + width_bar / 2, ybar + 18), f"{km/2:g}", font=safe_font(16), fill="#334e52", anchor="ma")
    d.text((xbar + width_bar, ybar + 18), f"{km:g} km", font=safe_font(16), fill="#334e52", anchor="ra")

    d.rounded_rectangle((panel.x, panel.y, panel.x + panel.w, panel.y + panel.h), radius=18, fill="#fbfaf6", outline="#d5ddda", width=2)
    px, py = panel.x + 42, panel.y + 55
    if version == "technical":
        d.text((px, py), "REKONSILIASI PROYEK STRATEGIS 2025", font=safe_font(21, bold=True), fill="#203539")
        py += 38
        d.text((px, py), "Only authoritative named matches are mapped.", font=safe_font(19), fill="#5c6c6e")
        py += 45
        for kicker, title, body, color in [
            ("TERPETAKAN · MATCH NAMA EKSAK", "Bajayau Tengah–Buas–Buas (Sawaja) · HSS-KAB-340", "4.538 km diklaim · extent parsial belum terukur", "#2d8c87"),
            ("TERPETAKAN · MATCH NAMA EKSAK", "Samuda–Bajayau · HSS-KAB-299", "0.913 km diklaim · extent parsial belum terukur", "#c17c00"),
            ("TERPETAKAN · 2 DARI 6 MATCH NAMA", "Karya Bakti TNI · HSS-KAB-082 + HSS-KAB-257", "2.673 km match eksak · total klaim 7.209 km", "#bb6f93"),
        ]:
            d.rounded_rectangle((px, py, px + panel.w - 84, py + 105), radius=10, fill="#f7f5ef", outline=color, width=3)
            d.text((px + 18, py + 14), kicker, font=safe_font(16, bold=True), fill=color)
            d.text((px + 18, py + 42), title, font=safe_font(19, bold=True), fill="#203539")
            d.text((px + 18, py + 72), body, font=safe_font(16), fill="#5c6c6e")
            py += 125
        for kicker, title, body, color in [
            ("BELUM TEREKONSILIASI", "Loksado strategic corridor", "≈6.154 km · daftar paket / crosswalk ruas belum tersedia", "#8f5d40"),
        ]:
            d.rounded_rectangle((px, py, px + panel.w - 84, py + 92), radius=10, fill="#f4f0e8", outline="#d4c2b2", width=2)
            d.text((px + 18, py + 13), kicker, font=safe_font(16, bold=True), fill=color)
            d.text((px + 18, py + 40), title, font=safe_font(18, bold=True), fill="#463c37")
            d.text((px + 18, py + 68), body, font=safe_font(15), fill="#6d625b")
            py += 110
        py += 15
        d.text((px, py), "LEGENDA", font=safe_font(22, bold=True), fill="#203539")
        py += 36
        for color, label in [("#8c999a", "Jalan kabupaten — seluruh 350 fitur"), ("#2d8c87", "Sawaja — HSS-KAB-340; extent parsial"), ("#bb6f93", "Karya Bakti TNI — match nama eksak"), ("#c17c00", "Samuda–Bajayau — extent parsial"), ("#b7c1c2", "Batas kecamatan"), ("#334e52", "Pusat permukiman utama")]:
            d.line((px, py + 9, px + 42, py + 9), fill=color, width=5)
            py = draw_wrapped(d, (px + 58, py), label, safe_font(18), "#3c4f52", panel.w - 150, line_gap=4) + 12
        source_y = panel.y + panel.h - 160
        d.text((px, source_y), "CATATAN SUMBER", font=safe_font(18, bold=True), fill="#203539")
        source_text = "Seed otoritatif Diklat PIM v5: roads_county.geojson (turunan ruas_jalan_kabupaten.gpkg), districts.geojson, dan rtrw_pusat_permukiman.geojson. CRS EPSG:4326. Layer sungai utama tidak tersedia; sungai tidak digambar."
        draw_wrapped(d, (px, source_y + 28), source_text, safe_font(15), "#6b7778", panel.w - 84, line_gap=4)
    else:
        d.text((px, py), "KORIDOR STRATEGIS 2025", font=safe_font(19, bold=True), fill="#203539")
        py += 34
        profile_text = "Lempeng profil ini menampilkan seluruh jaringan jalan kabupaten dengan overlay strategis yang terukur. Match nama eksak ditebalkan; extent proyek yang belum ada dalam register tetap terbuka untuk rekonsiliasi."
        py = draw_wrapped(d, (px, py), profile_text, safe_font(17), "#5c6c6e", panel.w - 84, line_gap=4) + 22
        d.rounded_rectangle((px, py, px + panel.w - 84, py + 78), radius=10, fill="#e6f3f1", outline="#2d8c87", width=2)
        d.text((px + 18, py + 15), "4.538 km · SAWAJA", font=safe_font(17, bold=True), fill="#2d746f")
        d.text((px + 18, py + 42), "Bajayau Tengah–Buas–Buas — HSS-KAB-340; extent parsial", font=safe_font(17), fill="#4d443a")
        py += 96
        d.rounded_rectangle((px, py, px + panel.w - 84, py + 78), radius=10, fill="#fff3d6", outline="#e2b457", width=2)
        d.text((px + 18, py + 15), "0.913 km · DBH SAWIT", font=safe_font(17, bold=True), fill="#9a6500")
        d.text((px + 18, py + 42), "Samuda–Bajayau — HSS-KAB-299; extent parsial", font=safe_font(17), fill="#4d443a")
        py += 96
        d.rounded_rectangle((px, py, px + panel.w - 84, py + 78), radius=10, fill="#f7e9f0", outline="#bb6f93", width=2)
        d.text((px + 18, py + 15), "2 match nama eksak", font=safe_font(17, bold=True), fill="#922b59")
        d.text((px + 18, py + 42), "Karya Bakti TNI — HSS-KAB-082 and HSS-KAB-257", font=safe_font(17), fill="#4d443a")
        py += 110
        d.text((px, py), "REKONSILIASI LANJUTAN", font=safe_font(17, bold=True), fill="#8f5d40")
        py += 29
        for line in ["Loksado strategic corridor · ≈6.154 km", "Empat paket Karya Bakti lain · sisa menuju 7.209 km"]:
            d.text((px, py), "• " + line, font=safe_font(16), fill="#6d625b")
            py += 25
        py += 10
        d.text((px, py), "LEGENDA", font=safe_font(18, bold=True), fill="#203539")
        py += 30
        for color, label in [("#8c999a", "Seluruh 350 jalan kabupaten"), ("#2d8c87", "Sawaja; HSS-KAB-340"), ("#bb6f93", "Karya Bakti; match nama eksak"), ("#c17c00", "Samuda–Bajayau; extent parsial")]:
            d.line((px, py + 8, px + 36, py + 8), fill=color, width=5)
            d.text((px + 50, py), label, font=safe_font(15), fill="#3c4f52")
            py += 25
        d.text((px, panel.y + panel.h - 85), "Sumber: seed otoritatif Diklat PIM v5 · EPSG:4326 · geometri eksak; layer sungai utama tidak tersedia.", font=safe_font(14), fill="#6b7778")

    d.text((150, height - 55), "Geometri peta mengikuti data spasial otoritatif; extent proyek tidak diada-adakan saat register belum lengkap.", font=safe_font(16), fill="#708080")
    d.text((width - 150, height - 55), "BUKU PROFIL 2025 · HSS", font=safe_font(16, bold=True), fill="#708080", anchor="ra")
    return image


def write_preview(data: dict[str, Any]) -> None:
    map_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    reconciliation_rows = "".join(
        f'<tr><td>{html.escape(row["project"])}</td><td>{row["claimed_length_km"]:.3f}</td><td>{html.escape(row["status"])}</td><td>{html.escape(row["road_keys"] or "—")}</td></tr>'
        for row in RECONCILIATION
    )
    html_doc = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kabupaten HSS · Profile Book 2025 map preview</title>
<link rel="stylesheet" href="../../src/public/vendor/leaflet/leaflet.css">
<style>
  :root {{ color-scheme: light; --ink:#203539; --muted:#5c6c6e; --paper:#f7f5ef; --panel:#fbfaf6; }}
  * {{ box-sizing:border-box; }} body {{ margin:0; font:14px/1.45 Segoe UI,Arial,sans-serif; color:var(--ink); background:var(--paper); }}
  header {{ padding:20px 28px 16px; display:flex; justify-content:space-between; gap:24px; align-items:end; border-bottom:1px solid #d5ddda; }}
  h1 {{ margin:0; font-size:25px; letter-spacing:.04em; }} h2 {{ font-size:15px; margin:0 0 10px; letter-spacing:.06em; }} p {{ color:var(--muted); margin:6px 0; }}
  .layout {{ display:grid; grid-template-columns:minmax(0,1fr) 360px; gap:18px; padding:18px; }}
  #map {{ min-height:720px; border:1px solid #cdd7d4; background:#eef2f0; }}
  aside {{ background:var(--panel); border:1px solid #d5ddda; border-radius:12px; padding:18px; }}
  .controls {{ display:grid; gap:8px; margin-bottom:16px; }} label {{ display:flex; align-items:center; gap:8px; color:var(--muted); }}
  .legend {{ display:grid; gap:7px; margin:10px 0 18px; }} .swatch {{ display:inline-block; width:34px; height:5px; border-radius:4px; margin-right:8px; vertical-align:middle; }}
  table {{ width:100%; border-collapse:collapse; font-size:12px; }} th,td {{ text-align:left; padding:7px 5px; border-bottom:1px solid #e5e9e6; vertical-align:top; }} th {{ color:var(--muted); }}
  .note {{ margin-top:16px; padding-top:14px; border-top:1px solid #e5e9e6; font-size:12px; }}
  @media (max-width:900px) {{ .layout {{ grid-template-columns:1fr; }} #map {{ min-height:560px; }} }}
</style></head><body>
<header><div><h1>KABUPATEN HULU SUNGAI SELATAN</h1><p>Buku Profil 2025 · pratinjau jaringan jalan otoritatif</p></div><div style="text-align:right;color:#8d5a3a;font-weight:700">DIKLAT PIM</div></header>
<main class="layout"><div id="map"></div><aside>
<h2>LAYERS</h2><div class="controls">
<label><input id="roads" type="checkbox" checked> Seluruh 350 ruas kabupaten</label>
<label><input id="districts" type="checkbox" checked> Batas kecamatan</label>
<label><input id="settlements" type="checkbox" checked> Label pusat permukiman</label>
<label><input id="strategic" type="checkbox" checked> Match proyek terverifikasi</label>
</div>
<div class="legend"><div><span class="swatch" style="background:#8c999a"></span>Jalan kabupaten</div><div><span class="swatch" style="background:#2d8c87"></span>Sawaja · HSS-KAB-340</div><div><span class="swatch" style="background:#bb6f93"></span>Karya Bakti · match nama eksak</div><div><span class="swatch" style="background:#c17c00"></span>Samuda–Bajayau · extent parsial</div></div>
<h2>REKONSILIASI</h2><table><thead><tr><th>Proyek</th><th>km</th><th>Status</th><th>road_key</th></tr></thead><tbody>{reconciliation_rows}</tbody></table>
<div class="note"><b>Catatan sumber.</b> Geometri jalan disalin dari clean export otoritatif `roads_county.geojson`, turunan `ruas_jalan_kabupaten.gpkg`, dengan identitas kanonik `road_key`. Batas kecamatan dan pusat permukiman memakai clean export otoritatif. Layer sungai utama tidak tersedia dalam bundle.</div>
</aside></main>
<script src="../../src/public/vendor/leaflet/leaflet.js"></script><script>
const MAP_DATA={map_json};
const map=L.map('map',{{zoomControl:true,attributionControl:false,preferCanvas:true}});
const roadLayer=L.geoJSON(MAP_DATA.roads,{{style:{{color:'#8c999a',weight:1.2,opacity:.72}}}});
const districtLayer=L.geoJSON(MAP_DATA.districts,{{style:{{color:'#b7c1c2',weight:1.2,fillColor:'#e8eeeb',fillOpacity:.45}}}});
const settlementLayer=L.layerGroup();
MAP_DATA.settlements.features.forEach(f=>{{const c=f.geometry.coordinates.slice().reverse(); const n=f.properties.keterangan.replace(/^.*Kecamatan\\s+/,''); L.marker(c,{{icon:L.divIcon({{className:'settlement-label',html:'<span style="color:#334e52;font-weight:600;white-space:nowrap">'+n+'</span>',iconAnchor:[0,-5]}})}}).addTo(settlementLayer);}});
const strategicLayer=L.layerGroup();
function addStrategic(key,color,dash){{const f=MAP_DATA.roads.features.find(x=>x.properties.road_key===key); if(!f)return; L.geoJSON(f,{{style:{{color:'#fffaf1',weight:8,opacity:.95}}}}).addTo(strategicLayer); L.geoJSON(f,{{style:{{color,weight:4,opacity:1,dashArray:dash||null}}}}).addTo(strategicLayer);}}
addStrategic('HSS-KAB-340','#2d8c87','12 8'); addStrategic('HSS-KAB-082','#bb6f93',null); addStrategic('HSS-KAB-257','#bb6f93',null); addStrategic('HSS-KAB-299','#c17c00','12 8');
const layers={{roads:roadLayer,districts:districtLayer,settlements:settlementLayer,strategic:strategicLayer}}; Object.values(layers).forEach(l=>l.addTo(map));
map.fitBounds(roadLayer.getBounds(),{{padding:[20,20]}});
document.querySelectorAll('input[type=checkbox]').forEach(input=>input.addEventListener('change',e=>{{const layer=layers[e.target.id]; if(e.target.checked)layer.addTo(map); else map.removeLayer(layer);}}));
</script></body></html>'''
    (OUT / "profile_book_map_preview.html").write_text(html_doc, encoding="utf-8")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    roads = load_json(ROADS_PATH)
    districts = load_json(DISTRICTS_PATH)
    settlements = load_json(SETTLEMENTS_PATH)
    if len(roads.get("features", [])) != 350:
        raise RuntimeError(f"Expected 350 authoritative county road features, found {len(roads.get('features', []))}")
    if len(districts.get("features", [])) != 11:
        raise RuntimeError(f"Expected 11 district features, found {len(districts.get('features', []))}")

    for version in ["technical", "profile_book"]:
        svg_name = f"hss_profile_book_{version}.svg"
        png_name = f"hss_profile_book_{version}_300dpi.png"
        svg = map_svg(roads, districts, settlements, version="technical" if version == "technical" else "profile_book")
        (OUT / svg_name).write_text(svg, encoding="utf-8")
        image = map_png(roads, districts, settlements, version="technical" if version == "technical" else "profile_book")
        image.save(OUT / png_name, format="PNG", dpi=(300, 300), optimize=True)
        if version == "technical":
            # The technical landscape plate is also the presentation/hero spread:
            # it carries the six stat cards and three strategic callout cards.
            (OUT / "hss_profile_book_landscape_presentation.svg").write_bytes((OUT / svg_name).read_bytes())
            image.save(OUT / "hss_profile_book_landscape_presentation_300dpi.png", format="PNG", dpi=(300, 300), optimize=True)

    data = {
        "title": "Kabupaten Hulu Sungai Selatan · Profile Book 2025",
        "crs": "EPSG:4326",
        "authoritative_spatial_source": "01_authoritative_seed/diklat_pim_data_seed_v5_authoritative_registry/spatial/roads_county.geojson",
        "raw_geometry_source": "02_raw_sources/spatial_network/ruas_jalan_kabupaten.gpkg",
        "boundary_source": "01_authoritative_seed/diklat_pim_data_seed_v5_authoritative_registry/administration/districts.geojson",
        "settlement_source": "01_authoritative_seed/diklat_pim_data_seed_v5_authoritative_registry/spatial/rtrw_pusat_permukiman.geojson",
        "roads": roads,
        "districts": districts,
        "settlements": settlements,
        "reconciliation": RECONCILIATION,
        "verified_named_matches": ROAD_KEYS,
        "major_rivers": {"status": "NOT_AVAILABLE", "note": "No major-river layer was present in the supplied app bundle."},
    }
    (OUT / "profile_book_map_data.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    write_preview(data)

    with (OUT / "strategic_project_reconciliation.csv").open("w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(RECONCILIATION[0].keys()))
        writer.writeheader()
        writer.writerows(RECONCILIATION)

    authority = {
        "map_authority": "Existing Diklat PIM app spatial map",
        "authoritative_road_network": "01_authoritative_seed/diklat_pim_data_seed_v5_authoritative_registry/spatial/roads_county.geojson",
        "raw_source": "02_raw_sources/spatial_network/ruas_jalan_kabupaten.gpkg",
        "canonical_identity": "road_key (HSS-KAB-001 to HSS-KAB-350)",
        "road_feature_count": 350,
        "district_feature_count": 11,
        "geometry_policy": "All road paths are read directly from the authoritative GeoJSON coordinates; no geometry is recreated from screenshots.",
        "rivers": "Omitted because no major-river layer is available in the supplied bundle.",
        "project_mapping_policy": "Exact named matches only. Partial extents and missing package links are listed as unresolved.",
        "outputs": [
            "hss_profile_book_technical.svg",
            "hss_profile_book_technical_300dpi.png",
            "hss_profile_book_profile_book.svg",
            "hss_profile_book_profile_book_300dpi.png",
            "hss_profile_book_landscape_presentation.svg",
            "hss_profile_book_landscape_presentation_300dpi.png",
            "profile_book_map_preview.html",
            "profile_book_map_data.json",
            "strategic_project_reconciliation.csv",
        ],
    }
    (OUT / "map_authority_record.json").write_text(json.dumps(authority, ensure_ascii=False, indent=2), encoding="utf-8")

    readme = """# HSS 2025 Profile Book Map Outputs

These plates are generated from the existing Diklat PIM spatial authority chain.

## Authority

- Road geometry used by the app: `01_authoritative_seed/diklat_pim_data_seed_v5_authoritative_registry/spatial/roads_county.geojson`
- Raw geometry source: `02_raw_sources/spatial_network/ruas_jalan_kabupaten.gpkg`
- Canonical road identity: `road_key` (`HSS-KAB-001` … `HSS-KAB-350`)
- Kecamatan boundaries: `01_authoritative_seed/diklat_pim_data_seed_v5_authoritative_registry/administration/districts.geojson`
- Major settlement/service-centre points: `01_authoritative_seed/diklat_pim_data_seed_v5_authoritative_registry/spatial/rtrw_pusat_permukiman.geojson`

The road paths are copied from authoritative coordinates. No road alignment, boundary, river, or project location was drawn from a screenshot. No major-river layer was available in the supplied application bundle, so rivers are omitted.

## Outputs

- `hss_profile_book_technical.svg` and `hss_profile_book_technical_300dpi.png`: technical map with source and reconciliation panel.
- `hss_profile_book_profile_book.svg` and `hss_profile_book_profile_book_300dpi.png`: editorial plate for the Profile Book.
- `hss_profile_book_landscape_presentation.svg` and `hss_profile_book_landscape_presentation_300dpi.png`: landscape hero spread with six stat cards and three strategic callout cards.
- `profile_book_map_preview.html`: optional Leaflet preview using the same GeoJSON features.
- `strategic_project_reconciliation.csv`: machine-readable project-to-spatial reconciliation list.
- `map_authority_record.json`: authority and output manifest.

The map shows full authoritative geometry for exact named matches. Where a project length is a partial extent or a package-to-road crosswalk is absent, the map labels the link as unresolved and does not invent a segment.
"""
    (OUT / "README.md").write_text(readme, encoding="utf-8")

    print(f"Generated map outputs in {OUT}")
    print("Road features:", len(roads["features"]))
    print("District features:", len(districts["features"]))


if __name__ == "__main__":
    main()
