# Live Hike Mode

Live Hike Mode compares planned pace with filtered browser GPS progress and recalculates the remaining hike. Real GPS and all three replay scenarios use the same `processReading` pipeline.

## Lifecycle and API

- `POST /api/live-hikes` creates a session with trail geometry.
- `POST /api/live-hikes/{id}/start|pause|resume|finish|cancel` changes lifecycle state.
- `POST /api/live-hikes/{id}/locations` accepts one reading or a queued batch.
- `GET /api/live-hikes/{id}` returns raw readings, filtered readings, state, and the current snapshot.
- `GET /api/live-hikes/{id}/summary` returns post-hike timing, maximum deviation, warnings, and a profile-calibration suggestion requiring confirmation.

Sessions are intentionally memory-only for the hackathon. No location database migration was added.

## GPS filtering and map matching

The processor rejects invalid readings, accuracy worse than 120 m, and jumps above 12 m/s. Accepted readings use accuracy-weighted exponential smoothing. Each reading is projected onto every planned route segment with a backward-progress penalty; accepted progress is monotonic. This is explainable and handles route crossings more safely than simply choosing the closest GPX point.

Potential off-route status begins beyond `max(40 m, 2 × reported accuracy)`. Confirmation requires the condition to persist for 45 seconds across accepted updates. A single noisy reading cannot confirm an alert.

## Adaptive estimates and warnings

Rolling pace uses filtered progress and timestamps rather than browser-reported speed. Remaining time, finish, daylight margin, route feasibility, and primary warning update after accepted batches. The UI batches network recovery readings and simulation is intentionally throttled. Warning objects contain type, severity, evidence, timestamp, confidence, action, affected segment, and acknowledgement requirement.

Weather rematching remains network-dependent and is represented as unavailable when the live page is offline; cached GPX geometry still supports progress and off-route calculations.

## Offline and browser limitations

- The service worker caches the Live page and seven GPX files.
- Unsent readings are queued in device-local storage and synchronized on the next successful update.
- Browsers do not guarantee background GPS. Keep the page open in the foreground.
- Location permission can be denied or revoked, and GPS can be unavailable, delayed, or inaccurate.
- Browser geolocation requires HTTPS outside localhost.
- Cached geometry does not make live weather or server synchronization available offline.

## Privacy

Raw and filtered locations are kept separately in the current in-memory session. Offline readings remain only in the browser queue until sent. Sessions disappear when the server restarts. Trail-Intel does not automatically alter the hiker profile from a completed hike.
