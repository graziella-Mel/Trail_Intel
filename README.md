# Trail-Intel

Trail-Intel is a personalized hiking decision-support platform with trails in Lebanon and the United States. It ranks trails for a specific day and hiker, explains route effort and environmental exposure, and reuses the same route and pace models in Live Hike Mode.

## Run locally

Requires Node.js 22.13 or newer.

```powershell
npm install
npm run trails:import
npm run dev
```

Curated trail ingestion is automatic. Place owner-approved GPX files in `data/import/lebanon-trails/`; both `npm run dev` and `npm run build` regenerate the shared demo catalogue before starting. Judges do not upload files.

Open `http://localhost:3000/demo` for the deterministic hackathon path. External weather and AI briefing services are optional; seeded recommendations and simulation remain available without credentials.

## Validation

```powershell
npm run trails:import -- --dry-run
npm run db:generate
npx tsc --noEmit
npm run lint
npm test
```

No database migration is currently required: demo recommendation and live-session state are seeded/in-memory. See [deployment](docs/deployment.md), [testing instructions](docs/hackathon-testing-instructions.md), and [integration review](docs/integration-review.md).

## Optional environment

- `OPENAI_API_KEY`: enables production-generated narrative briefings. Numeric analytics remain deterministic.
- `OPENAI_BRIEFING_MODEL`: optional model override; defaults to `gpt-5.4-mini`.

Never commit real API secrets. The app does not require authentication for the public demo and does not make claims that a route is safe.
