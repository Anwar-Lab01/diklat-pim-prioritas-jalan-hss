# HSS 2025 Profile Book Map Outputs

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

## GPT Image visual variants

- `hero_map_gptimage_v1.png`: landscape hero, more atmospheric editorial treatment.
- `hero_map_gptimage_v2.png`: landscape hero, restrained editorial treatment and corrected budget metric card.
- `portrait_profile_map_gptimage.png`: portrait profile-book version.
- `gptimage_validation_report.json`: records the source images, locked panels, raw candidates, and visual deviations.
- `*_raw_candidate.png`: unprotected GPT Image candidates retained for audit only.

The accepted variants use GPT Image only for non-geometric visual treatment. The authoritative map and reconciliation panels were restored after generation and verified byte-for-byte against the source renders. Raw candidates are not cartographic authorities.
