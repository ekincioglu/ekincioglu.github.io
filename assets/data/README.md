# Built-in building footprints

`mannheim-buildings.geojson` is the local dataset behind the GEO/LAB playground.
It is fetched lazily when the playground approaches the viewport — never from a
third-party data API at runtime.

- **Source:** © OpenStreetMap contributors, retrieved from the OSM `map` API
  (`bbox=8.4620,49.4810,8.4830,49.4930`) on 2026-10-25.
- **Licence:** ODbL 1.0 — https://www.openstreetmap.org/copyright
- **Contents:** 2,503 building footprints around Mannheim's Innenstadt, filtered
  to footprints ≥ 55 m² and simplified to ~0.5 m. Properties: `height` (metres),
  `kind`, and optional `name` / `levels`.
- **Heights:** where OSM has a `height` or `building:levels` tag it is used;
  otherwise a deterministic, type-based estimate is generated so the 3D scene
  reads well. These are illustrative, not survey-grade values.
- **Generated for:** the self-contained GEO/LAB demo (skyline scene). Flows and
  the sensor field are synthetic and generated in the browser.

The demo credits OpenStreetMap in the card footer and in the in-map credit line.
