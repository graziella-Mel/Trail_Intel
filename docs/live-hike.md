# Live Hike Mode

Live Hike Mode uses the shared trail catalog and hiker-profile schema. Both browser GPS and seeded replay readings pass through the same filtering, projection, pace, fatigue, weather-suitability, finish-time, daylight and warning processor.

Lifecycle endpoints cover create, start, locations, pause, resume, finish, cancel, state and summary. Raw and filtered readings are stored separately in memory. The service worker caches the page and GPX tracks; unsent readings remain in the device queue until synchronization.

GPS filtering rejects accuracy above 120 m and impossible motion above 12 m/s, applies accuracy-weighted exponential smoothing, and projects onto route segments with monotonic progress. Confirmed off-route status requires multiple accepted readings for at least 45 seconds beyond `max(40 m, 2 × accuracy)`.

Browser limitations: foreground operation is required, HTTPS is required outside localhost, location permission can be denied or revoked, and background tracking is not guaranteed. Live sessions disappear when the server restarts. See `docs/hackathon-demo.md` for the credential-free replay.
