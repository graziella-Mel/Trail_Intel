# Trail-Intel

Trail-Intel is a personalized hiking decision-support platform with trails in Lebanon and the United States. It ranks trails for a specific day and hiker, explains route effort and environmental exposure, and reuses the same route and pace models in Live Hike Mode.

## Quick start

Requires Node.js 22.13 or newer.

1. Clone and enter the repository:

```bash
git clone https://github.com/graziella-Mel/Trail_Intel.git
cd Trail_Intel
```

2. Install dependencies:

```bash
npm install
```

3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_MAPBOX_TOKEN` to a
public Mapbox token. The token is required for the interactive maps; restrict it
to `http://localhost:3000` and your deployed domain in Mapbox.

```powershell
Copy-Item .env.example .env.local
```

On macOS or Linux, use `cp .env.example .env.local`.

4. Start the complete platform:

```bash
npm run dev
```

Then open `http://localhost:3000`. The `npm run dev` command automatically
ingests the curated GPX catalogue before starting, so no separate import command
is needed.

## Trail catalogue

Place permission-cleared GPX files in `data/import/lebanon-trails/`. Despite the
legacy directory name, the importer accepts trails from any country. Both
`npm run dev` and `npm run build` regenerate the analytics and shared demo
catalogue. Judges never upload GPX files.

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

## Environment variables

- `NEXT_PUBLIC_MAPBOX_TOKEN`: required for interactive analytics and Live Hike maps. Use a public `pk.` token restricted to approved origins.
- `OPENAI_API_KEY`: enables production-generated narrative briefings. Numeric analytics remain deterministic.
- `OPENAI_BRIEFING_MODEL`: optional model override; defaults to `gpt-5.4-mini`.

The demo still provides seeded recommendations, weather evidence, and structured
briefings without OpenAI credentials. Never commit `.env.local` or secret tokens.
The app does not require authentication for the public demo and does not claim
that a route is safe.
