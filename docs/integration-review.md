# Daily Recommendations and Live Hike Integration Review

## Implemented

- Consolidated the three duplicated trail catalogs into `lib/trail-catalog.ts`.
- Shared the advanced hiker profile and baseline duration helper across recommendations, analysis handoff and Live Mode.
- Preserved the existing GPX map, segment fatigue, pace, weather and daylight implementations rather than rewriting them.
- Connected Daily Recommendations → selected trail analysis → Live Hike with the trail ID retained.
- Added deterministic demo weather, 23% slowdown replay, throttled replay updates, adaptive fatigue/weather suitability, structured guidance, automatic completion and post-hike summary API.
- Kept all numeric scoring deterministic. The optional LLM briefing only explains supplied evidence.

## Mocked or seeded

- Demo weather is fixed evidence dated July 25, 2026 and labeled `seeded-demo`.
- Drive time remains a distance-based fallback.
- Trail features, exposure and difficulty are hackathon catalog metadata.
- Closures, exits, shelters and authoritative water availability are unavailable.

## Production limitations

- Live sessions and recommendation lookups are in-memory and do not survive restart or multi-instance deployment.
- Open-Meteo supplies daily recommendation forecasts and refreshes current conditions during real GPS sessions. A durable hourly forecast snapshot per session remains a production improvement.
- Service-worker caching covers the Live page and GPX tracks; offline location storage uses browser local storage rather than IndexedDB.
- Browser GPS is foreground-only and requires real-device field validation.

## Privacy and safety

- Raw and filtered locations are separated. Unsent readings stay on the device until synchronized.
- No profile calibration is applied without confirmation.
- UI guidance avoids guaranteed-safety language and exposes confidence/evidence.
- The public Mapbox token is client-safe; OpenAI secrets remain server-only.

## External APIs

- Mapbox: terrain/maps.
- Open-Meteo: forecast enrichment, no API key.
- OpenAI: optional evidence-only briefing, not scoring or Live Mode.

## Run the demo

```powershell
cd "<project-directory>"
npm install
npm run dev
```

Open `http://localhost:3000/recommendations?demo=1` and follow `docs/hackathon-demo.md`.
