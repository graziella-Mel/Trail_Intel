# Deployment

Trail-Intel targets the existing OpenAI Sites project declared in `.openai/hosting.json`. The production build is produced by `npm run build` and must pass before publishing.

Before deployment, place every permission-cleared Lebanon GPX in `data/import/lebanon-trails/`. The build automatically discovers and ingests every `.gpx`, regenerates the file-backed catalogue seed, and packages the derived routes into the public demo. Do not add a judge-facing upload step.

Set `NEXT_PUBLIC_MAPBOX_TOKEN` to a public Mapbox `pk.` token restricted to the deployed origin. This variable is required for the interactive maps. Optional production variables are `OPENAI_API_KEY` and `OPENAI_BRIEFING_MODEL`. Do not expose a secret Mapbox token.

Operational probes:

- `GET /health` confirms the worker is responding.
- `GET /ready` checks the seeded catalogue and fallback availability without revealing secrets.

Rollback is performed by redeploying the last known-good Sites version. No database migration is required for this release.
