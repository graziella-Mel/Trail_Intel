import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the Trail-Intel application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Trail-Intel — Personalized Hiking Intelligence<\/title>/i);
  assert.match(html, /TRAIL-INTEL/);
  assert.match(html, /PERSONAL READINESS/);
  assert.match(html, /TIME SIMULATION/);
  assert.match(html, /ROUTE WEATHER/);
  assert.match(html, /Where will I struggle\?/);
  assert.match(html, /Mount Baker, WA/);
  assert.match(html, /Point State to Emerald View Trail/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps deterministic analytics separate from source attribution", async () => {
  const [page, layout, gpx] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/baskinta-trail.gpx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /function calculateSegments/);
  assert.match(page, /const paceSimulation = useMemo/);
  assert.match(page, /api\.open-meteo\.com\/v1\/forecast/);
  assert.match(page, /new ResizeObserver\(\(\) => m\.resize\(\)\)/);
  assert.doesNotMatch(page, /map-static-fallback|outdoors-v12\/static/);
  assert.match(page, /Recorded by Rami Rachkidi/);
  assert.match(layout, /title:\s*"Trail-Intel — Personalized Hiking Intelligence"/);
  assert.match(gpx, /<trkpt\b/);
  assert.match(gpx, /Rami Rachkidi/);
});
