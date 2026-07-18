# Hackathon testing instructions

```powershell
npm install
npm run trails:import -- --dry-run
npm run trails:import
npm run db:generate
npx tsc --noEmit
npm run lint
npm test
npm run dev
```

Then open `/demo`, rank trails, confirm three explained recommendation groups, open the best trail, enter Live Hike Mode, select **Slower Than Expected · 23%**, and start the simulated hike. Verify progress and updated finish/daylight values, a structured warning, completion, and the post-hike summary. Also check `/health` and `/ready` return HTTP 200.

Mobile smoke test: use a narrow viewport, ensure cards and live metrics do not overflow, and verify the primary controls remain reachable.

To exercise the conservative no-weather fallback, start the runtime with `TRAIL-INTEL_DISABLE_WEATHER=1`. The hackathon demo remains deterministic because its seeded forecast is intentionally independent of the external provider.
