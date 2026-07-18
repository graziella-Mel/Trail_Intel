# Demo readiness audit

## Architecture reused

The demo uses the existing vinext app, `TRAIL_CATALOG`, deterministic recommendation scorer, hiker profile, pace/fatigue model, Open-Meteo enrichment, daylight calculation, Mapbox views, and the live-session API. No parallel scoring or live engine was introduced.

## Baseline and changes

Baseline build, type check, lint, database generation, and 30 engine/integration tests passed before the catalogue work. The judge path adds `/demo`, five permission-cleared Lebanon routes, import validation, deterministic fallbacks, health endpoints, and explicit demo guidance. The two supplied U.S. GPX files were excluded as out of product scope.

## Remaining production gaps

- Live sessions are in-memory and are lost on worker restart.
- Browser background GPS is not guaranteed.
- Forecast availability is limited by Open-Meteo coverage/window; seeded demo conditions are clearly marked.
- Map tiles require network access and a valid public Mapbox token; route analytics remain usable if tiles fail.
- The catalogue has 14 permission-cleared trails: 12 in Lebanon and two in the United States.
- No authentication or durable user profile storage is present.

## Safety and privacy

Trail-Intel is decision support, not a safety certification or rescue service. Users must check local closures, access permission, weather, equipment, and emergency plans. Raw live readings remain in the current in-memory session; offline queued readings stay in browser local storage until synchronized. No location is sold or shared by the app. A production release needs retention/deletion controls and a durable privacy policy.
