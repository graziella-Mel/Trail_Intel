# Trail-Intel Hackathon Demo

This scripted demo does not require OpenAI or live-weather credentials.

1. Open `/recommendations?demo=1`. The fixed date is July 25, 2026 and weather is explicitly labeled seeded demo evidence.
2. Rank the trails. Barouk Reserve is the strong match because its forest/viewpoint profile, manageable duration, mild apparent temperature and daylight margin outperform the hotter Arsoun alternative and the less suitable exposed options.
3. Select **Open full trail analysis** on Barouk. Confirm distance, ascent, fatigue colors, pace simulation and daylight information.
4. Select **Live hike**. The Barouk trail remains selected through the URL handoff.
5. Choose **Pace slowdown · 23%** and replay at 20×.
6. Watch actual pace fall below predicted pace, updated finish move later, daylight margin decrease, fatigue rise and the next higher-effort segment become less suitable.
7. The structured primary recommendation advises shortening the next stop and reassessing before the difficult section.
8. Let replay complete. The session changes to `COMPLETED`; retrieve `/api/live-hikes/{sessionId}/summary` for actual/moving/stopped time, deviation, warning history and the profile-calibration suggestion.

The demo uses deterministic scoring and seeded numeric evidence. No LLM creates or changes a score.
