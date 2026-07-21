# Trail-Intel

Trail-Intel is a personalized hiking decision-support platform with trails in Lebanon and the United States. It ranks trails for a specific day and hiker, explains route effort and environmental exposure, and reuses the same route and pace models in Live Hike Mode.

## How I built Trail-Intel with Codex and GPT-5.6

I developed Trail-Intel through an iterative collaboration with Codex, powered
by GPT-5.6. I remained the product owner: I defined the problem, supplied and
cleared the GPX recordings, chose the advanced-hiker use case, and decided which
signals mattered to hikers. Those decisions included personalized fatigue by
route segment, an exact “Where will I struggle?” interaction, editable hiker
profiles, weather and daylight views, daily recommendations, Live Hike Mode,
and support for both Lebanon and United States trails.

Codex accelerated the engineering loop. It inspected the existing application,
implemented each milestone without replacing working architecture, converted
the GPX files into a shared trail catalogue, connected the recommendation and
live-hike flows to the same deterministic analytics, and added automated tests,
documentation, deployment configuration, and seeded judge data. During review,
I tested the product and challenged unclear behavior—such as fatigue colors,
readiness scoring, map focus, profile controls, weather fallbacks, and live-map
failures. Codex traced those reports through the code and deployed focused fixes.

GPT-5.6 contributed through Codex as the reasoning and implementation partner:
it helped translate product feedback into TypeScript and React changes, reason
across pace, fatigue, weather, daylight, and GPS state, identify integration
risks, and produce testable fixes. Numeric trail scores are not invented by an
LLM; they come from the deterministic models in this repository. The optional
OpenAI briefing interprets supplied evidence but does not alter measurements.

This division of work was deliberate: I made the product, safety, design, and
scope decisions; Codex made iteration, debugging, validation, and delivery much
faster. See the [under-three-minute demo video script](docs/final-demo-video-script.md)
for the complete judge walkthrough.

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

Place permission-cleared GPX files in `data/trails/`. Every trail and its
metadata entry live in this single canonical collection. The build generates
browser-ready route geometry and one catalogue from it. The importer accepts
trails from any country. Both
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
