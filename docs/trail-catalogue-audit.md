# Trail catalogue audit

The catalogue contains 14 active trails: 12 in Lebanon and two in the United States. The import records source type, contribution date, permission, visibility, original-file checksum, ingestion time, and analytics version.

All original GPX files and their shared metadata live under `data/trails/`; there is no separate legacy catalogue. Original files are never copied into `public/`. Public clients receive decimated derived geometry under `public/derived-routes/`; original-download permission is explicitly false. Exact SHA-256 and normalized geometry signatures are checked before output. Re-running the importer is idempotent.

The Point State–Emerald View and Mount Baker files are included as permission-cleared U.S. routes. Unknown source platform, URL, and author fields remain null rather than being invented.
