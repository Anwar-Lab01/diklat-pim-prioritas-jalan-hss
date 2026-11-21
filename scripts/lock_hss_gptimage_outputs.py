from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "reports" / "profile_book_map"
GEN = Path(r"C:\Users\Windows 10\.codex\generated_images\01a0edb5-cf85-7790-a0e8-9a0f014bcb65")

LANDSCAPE_SOURCE = OUT / "hss_profile_book_landscape_presentation_300dpi.png"
PORTRAIT_SOURCE = OUT / "hss_profile_book_profile_book_300dpi.png"

RAW_LANDSCAPE_V1 = GEN / "exec-28abc06b-22c8-4a9a-b1e1-9bf0e03f9cea.png"
RAW_LANDSCAPE_V2 = GEN / "exec-db51ea7f-fe23-4fe4-9866-7977535be614.png"
RAW_PORTRAIT = GEN / "exec-5ff4f1a9-3ec5-4518-9a8e-80ca6d013577.png"


def font(size: int, bold: bool = False):
    candidates = [
        Path(r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf"),
        Path(r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def correct_budget_card(image: Image.Image, orientation: str) -> None:
    """Correct only the generated metric wording that drifted in GPT Image text rendering."""
    draw = ImageDraw.Draw(image)
    if orientation == "landscape":
        # Generated image coordinates before the final upscale.
        box = (1238, 140, 1453, 222)
        title_xy = (1287, 153)
        label_xy = (1287, 190)
        number = "68,80%"
        label = "REALISASI ANGGARAN"
    else:
        box = (775, 230, 1004, 288)
        title_xy = (821, 239)
        label_xy = (821, 265)
        number = "68,80%"
        label = "REALISASI ANGGARAN"
    draw.rounded_rectangle(box, radius=8, fill="#fbfaf6", outline="#c6d5d1", width=2)
    draw.text(title_xy, number, font=font(24, bold=True), fill="#075b70")
    draw.text(label_xy, label, font=font(11, bold=True), fill="#506568")


def build_variant(raw_path: Path, source_path: Path, output_path: Path, orientation: str) -> dict:
    source = Image.open(source_path).convert("RGB")
    raw = Image.open(raw_path).convert("RGB")

    # Keep the generated editorial treatment but render it at the authoritative plate size.
    generated = raw.resize(source.size, Image.Resampling.LANCZOS)
    correct_budget_card(raw, orientation)
    generated = raw.resize(source.size, Image.Resampling.LANCZOS)

    # The generated page has a different internal vertical grid than the source plate.
    # Preserve its title/stat-card treatment by fitting only the generated header into
    # the source header band; this keeps the authoritative map below it in place.
    if orientation == "landscape":
        header_crop = raw.crop((0, 0, raw.width, 230)).resize((source.width, 350), Image.Resampling.LANCZOS)
        generated.paste(header_crop, (0, 0))
    else:
        header_crop = raw.crop((0, 0, raw.width, 290)).resize((source.width, 470), Image.Resampling.LANCZOS)
        generated.paste(header_crop, (0, 0))

    if orientation == "landscape":
        locked_boxes = [
            (150, 350, 2950, 2800),  # exact map panel: roads, boundaries, labels, north arrow, scale bar
            (3060, 350, 4050, 2800),  # exact reconciliation, legend, and source-note panel
        ]
    else:
        locked_boxes = [
            (150, 470, 2850, 3140),  # exact map panel: roads, boundaries, labels, north arrow, scale bar
            (150, 3260, 2850, 4030),  # exact reconciliation, legend, and source-note panel
        ]

    for left, top, right, bottom in locked_boxes:
        generated.paste(source.crop((left, top, right, bottom)), (left, top))

    generated.save(output_path, format="PNG", dpi=(300, 300), optimize=True)
    return {
        "output": str(output_path),
        "source": str(source_path),
        "raw_candidate": str(raw_path),
        "locked_boxes": locked_boxes,
        "geometry_policy": "authoritative source pixels restored after GPT Image pass",
        "visual_deviations": [
            "GPT Image introduced editorial terrain/paper atmosphere outside locked map panels.",
            "GPT Image added or restyled typography, stat cards, and framing outside locked panels.",
            "Metric card wording for 68,80% was corrected to REALISASI ANGGARAN.",
        ],
    }


def main() -> None:
    outputs = [
        build_variant(
            RAW_LANDSCAPE_V1,
            LANDSCAPE_SOURCE,
            OUT / "hero_map_gptimage_v1.png",
            "landscape",
        ),
        build_variant(
            RAW_LANDSCAPE_V2,
            LANDSCAPE_SOURCE,
            OUT / "hero_map_gptimage_v2.png",
            "landscape",
        ),
        build_variant(
            RAW_PORTRAIT,
            PORTRAIT_SOURCE,
            OUT / "portrait_profile_map_gptimage.png",
            "portrait",
        ),
    ]

    for output in outputs:
        raw = Path(output["raw_candidate"])
        raw_copy = OUT / (Path(output["output"]).stem + "_raw_candidate.png")
        raw_copy.write_bytes(raw.read_bytes())
        output["raw_candidate_workspace_copy"] = str(raw_copy)

    (OUT / "gptimage_validation_report.json").write_text(
        json.dumps(
            {
                "authority": "hss_profile_book_profile_book_300dpi.png and hss_profile_book_landscape_presentation_300dpi.png",
                "accepted_policy": "Only non-geometric editorial treatment is retained from GPT Image.",
                "rejected_policy": "Any GPT Image pixels inside locked map/reconciliation panels were rejected and replaced with authoritative source pixels.",
                "outputs": outputs,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
