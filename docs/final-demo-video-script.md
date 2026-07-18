# Trail-Intel demo video script

Target runtime: **2 minutes 40 seconds**. Maximum: **2 minutes 55 seconds**.
Record at 1920×1080 with microphone audio and browser zoom at 100%. Use the
public `/demo` flow in a clean browser session.

## 0:00–0:18 — Problem and product

**Screen:** Open the Trail-Intel landing page, then click **Try Hackathon Demo**.

**Narration:** “Most hiking apps show a route. Trail-Intel answers a harder
question: how will this route unfold for this hiker, on this day? It combines
personal capacity, terrain, pace, weather, and daylight before the hike, then
updates the prediction as the hike progresses.”

## 0:18–0:52 — Daily recommendation

**Screen:** Show date, starting point, available time, hiker profile, preferred
features, and avoid options. Click **Rank Today’s Trails**.

**Narration:** “The daily engine evaluates the shared trail catalogue using
deterministic scoring. Barouk is the Best Match for this seeded scenario because
its distance, ascent, forest and viewpoint features, forecast, and daylight fit
the selected hiker better than the alternatives. Every result explains its
score, exclusions, confidence, and evidence.”

**Screen:** Briefly compare Barouk with the two displayed alternatives.

## 0:52–1:23 — Personalized trail analytics

**Screen:** Open Barouk’s full analysis. Show the interactive map, route metrics,
fatigue colors, elevation chart, and direction. Click **Where will I struggle?**

**Narration:** “The recommendation opens the same analytics pipeline. GPX
geometry is divided into segments, then Trail-Intel calculates slope, speed,
moving time, accumulated fatigue, rest allowance, finish range, and daylight.
The red segment is this hiker’s highest modeled fatigue section, and the map
flies to its exact location.”

## 1:23–2:03 — Adaptive Live Hike

**Screen:** Continue to Live Hike. Select **Slower Than Expected · 23%**, then
start the simulation. Pause when the pace warning appears.

**Narration:** “For a repeatable judge demo, simulated GPS readings pass through
the real Live Hike pipeline. When pace slows by 23 percent, actual pace diverges
from plan, predicted finish moves later, daylight margin shrinks, and an upcoming
segment becomes less suitable. The recommendation is generated from measured
progress, pace, fatigue, weather timing, and daylight—not LLM-generated numbers.”

## 2:03–2:22 — Completion

**Screen:** Complete the simulation and show the post-hike summary.

**Narration:** “At completion, Trail-Intel reports duration, moving and stopped
time, route deviation, warnings, and final timing. Profile calibration remains
an opt-in suggestion rather than an automatic change.”

## 2:22–2:48 — How Codex and GPT-5.6 were used

**Screen:** Show the GitHub README collaboration section, then return to the app.

**Narration:** “I defined the hiking problem, supplied permission-cleared GPX
data, and made the product and design decisions. I used Codex with GPT-5.6 to
accelerate implementation, connect the shared analytics across recommendations
and Live Hike Mode, diagnose browser and deployment failures, and build the test
suite. I repeatedly tested the experience and directed revisions when the
fatigue display, profile controls, weather behavior, or maps were unclear.”

## 2:48–2:55 — Close

**Screen:** End card with the public URL and GitHub repository.

**Narration:** “Trail-Intel turns a trail line into personalized, explainable,
adaptive hiking intelligence. It supports decisions; it does not guarantee
safety.”

## Recording checklist

- Keep the final export below three minutes.
- Record audible narration; do not rely only on captions.
- Use `/demo` so weather and simulation evidence remain deterministic.
- Confirm the Mapbox route is interactive before recording.
- Avoid exposing browser bookmarks, API keys, notifications, or personal data.
- Leave each changed metric visible long enough for judges to read it.
