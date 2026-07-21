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

## Run Trail-Intel locally — judge instructions

The repository includes the curated GPX files, metadata, seeded recommendation
weather, and Live Hike simulation data. Judges do not need an account, database,
GPX upload, OpenAI key, or weather-provider key.

### Prerequisites

- Git
- Node.js 22.13 or newer
- npm, included with Node.js
- A free public Mapbox `pk.` token for interactive maps

### 1. Clone and install

```bash
git clone https://github.com/graziella-Mel/Trail_Intel.git
cd Trail_Intel
npm ci
```

### 2. Configure the map

Copy the supplied environment template:

```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
```

```bash
# macOS or Linux
cp .env.example .env.local
```

Open `.env.local` and replace `pk.your_public_mapbox_token` with a public
Mapbox token:

```dotenv
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_actual_public_token
```

The token must permit `http://localhost:3000`. OpenAI configuration is optional;
leave `OPENAI_API_KEY` empty to run the deterministic judge demo.

### 3. Start the application

```bash
npm run dev
```

Wait for the terminal to display the local address, then open:

- Main platform: [http://localhost:3000](http://localhost:3000)
- Judge demo: [http://localhost:3000/demo](http://localhost:3000/demo)
- Daily Recommendations: [http://localhost:3000/recommendations?demo=1](http://localhost:3000/recommendations?demo=1)
- Live Hike demo: [http://localhost:3000/live?trail=barouk&demo=1](http://localhost:3000/live?trail=barouk&demo=1)

`npm run dev` automatically imports every GPX in `data/trails/`, calculates its
analytics, regenerates the shared catalogue, and starts the complete platform.
No separate importer or database command is required.

### Recommended judge walkthrough

1. Open the homepage and select **Try the Hackathon Demo**, or open `/demo`
   directly.
2. Generate the seeded Daily Recommendations.
3. Open the **Best Match** trail analysis.
4. Continue to Live Hike Mode.
5. Choose **Simulated Hike**.
6. Select **Slower Than Expected · 23%** and **8× · standard demo**.
7. Watch actual pace, fatigue, finish time, daylight margin, route progress,
   weather fit, and adaptive guidance update.
8. Let the replay finish and inspect the post-hike summary.

The alternative **Real Hike Session** uses browser GPS and refreshes current
Open-Meteo conditions every 10 minutes. It requires HTTPS or localhost, browser
location permission, and foreground operation.

### Production-style local run

```bash
npm run build
npm run start
```

Run `npm run build` with `NEXT_PUBLIC_MAPBOX_TOKEN` configured because Mapbox's
public token is embedded into the browser bundle at build time.

## Trail catalogue

Place permission-cleared GPX files in `data/trails/`. Every trail and its
metadata entry live in this single canonical collection. The build generates
browser-ready route geometry and one catalogue from it. The importer accepts
trails from any country. Both
`npm run dev` and `npm run build` regenerate the analytics and shared demo
catalogue. Judges never upload GPX files.

Open `http://localhost:3000/demo` for the deterministic hackathon path. The
simulation does not require OpenAI or live weather credentials.

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
deterministic guidance without OpenAI credentials. The optional AI briefing
requires `OPENAI_API_KEY`. Never commit `.env.local` or secret tokens.
The app does not require authentication for the public demo and does not claim
that a route is safe.
