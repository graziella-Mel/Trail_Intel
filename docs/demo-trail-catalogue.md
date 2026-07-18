# Demo trail catalogue

The shared `TRAIL_CATALOG` powers recommendations, analytics, and Live Hike Mode. Five newly imported demo-only routes are Sannine Loop, Dhour El Choueir, Zaarour–Balouh Valley, Hbaline Ghost Town, and Kfardebian Roman Bridge. Their distances, ascent, high point, and difficulty are calculated from the supplied GPX, not manually fabricated.

The project owner places curated Lebanon `.gpx` files in `data/import/lebanon-trails/`. Every valid GPX in that folder is discovered automatically. `metadata.json` is optional per-file enrichment; files without an entry receive a deterministic `curated-*` ID, a filename-derived name, conservative confidence, and owner-curated provenance defaults.

`npm run dev` and `npm run build` run ingestion before the application starts or builds. Ingestion calculates distance, ascent, high point, difficulty, coordinates, checksum, duplicate signals, and a decimated browser route. It then regenerates `data/generated/imported-trails.json`, which is the file-backed demo catalogue seed consumed by recommendations, analytics, and Live Hike Mode. Judges never upload GPX files.

Run `npm run trails:import -- --dry-run` to audit inputs without writes, or `npm run trails:import` to regenerate the seed and derived routes directly. Invalid GPX files or duplicate IDs fail the build instead of silently disappearing.
