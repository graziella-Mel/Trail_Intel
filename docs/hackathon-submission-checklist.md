# Hackathon Submission Checklist

## Verified in this workspace

- [x] Public URL opens without authentication: https://trailsense-lebanon.grazsal.chatgpt.site
- [x] Judge demo works without payment, installation, GPX upload, GPS permission, OpenAI, or live weather credentials.
- [x] Three recommendations appear and the Best Match opens into analytics and Live Hike.
- [x] Slower Than Expected replay updates pace, finish, daylight, warning, and post-hike summary.
- [x] Reset and recommendation repeat work.
- [x] Desktop and 390×844 mobile layouts were checked without horizontal overflow.
- [x] Health and readiness endpoints respond over HTTPS.
- [x] Seed import, build, lint, type check, and 35 automated tests pass.
- [x] Project description is complete.
- [x] Judge testing instructions are complete.
- [x] Privacy and safety limitations are stated in the judge and project copy.
- [x] No judge credentials are required.

## Owner actions before submission

- [ ] Upload the final two-to-three-minute demo video.
- [ ] Capture and upload the final screenshots listed in `docs/submission-screenshots.md`.
- [ ] Add the source-code link if the hackathon form requires one.
- [ ] Confirm the repository license is present and appropriate for every submitted component.
- [ ] Review Mapbox, Open-Meteo, OpenAI, Wikiloc/source-link, and other third-party attribution requirements.
- [ ] Confirm that permission to use each GPX also covers the deployed representation and any raw GPX files currently served from `public/`.
- [ ] Complete missing source-author/source-URL metadata for trails where the owner knows it.
- [ ] Confirm the public privacy statement matches the intended judging data-retention practice.
- [ ] Confirm safety wording does not imply certification, rescue coverage, or guaranteed conditions.
- [ ] Keep the public demo free throughout judging.
- [ ] Configure uptime monitoring for `/health` and `/ready` and choose an alert recipient.
- [ ] Check Cloudflare/OpenAI Sites, Mapbox, Open-Meteo, and optional OpenAI quotas for the judging window.
- [ ] Reopen the public URL in a separate private/incognito browser immediately before final submission.

## Final go/no-go

Submit only if the public URL, video, screenshots, descriptions, permissions, attribution, monitoring, and judging-period availability have all been manually confirmed.
