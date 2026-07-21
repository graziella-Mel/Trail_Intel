# Demo trail catalogue

The shared `TRAIL_CATALOG` powers recommendations, analytics, and Live Hike Mode. Five newly imported demo-only routes are Sannine Loop, Dhour El Choueir, Zaarour–Balouh Valley, Hbaline Ghost Town, and Kfardebian Roman Bridge. Their distances, ascent, high point, and difficulty are calculated from the supplied GPX, not manually fabricated.

The project owner places every curated `.gpx` file in `data/trails/`. All trails use this one source collection, regardless of country or when they were added. Every valid GPX in that folder is discovered automatically. The adjacent `metadata.json` provides per-file identity, presentation, and provenance; files without an entry receive safe deterministic defaults.

`npm run dev` and `npm run build` run ingestion before the application starts or builds. Ingestion calculates distance, ascent, high point, difficulty, coordinates, checksum, duplicate signals, and a decimated browser route. It then regenerates the single `data/generated/trail-catalog.json` consumed by recommendations, analytics, and Live Hike Mode. Judges never upload GPX files.

Run `npm run trails:import -- --dry-run` to audit inputs without writes, or `npm run trails:import` to regenerate the seed and derived routes directly. Invalid GPX files or duplicate IDs fail the build instead of silently disappearing.
