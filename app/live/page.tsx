"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./live.css";
import type {
  LiveSession,
  LiveSnapshot,
  LocationReading,
  RoutePoint,
} from "../../lib/live-hike";
import { processReading, SIMULATION_SCENARIOS } from "../../lib/live-hike";
import { estimateBaselineHours, TRAIL_CATALOG } from "../../lib/trail-catalog";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const TRAILS = TRAIL_CATALOG;
type PostHike = {
  actualDurationMinutes: number;
  movingMinutes: number;
  stoppedMinutes: number;
  actualFinish: string | null;
  predictedFinish: string;
  maximumOffRouteDistanceM: number;
  warningsTriggered: unknown[];
  profileCalibrationSuggestion: string;
  requiresProfileConfirmation: boolean;
};
function dist(a: RoutePoint, b: RoutePoint) {
  const R = 6371e3,
    p1 = (a.lat * Math.PI) / 180,
    p2 = (b.lat * Math.PI) / 180,
    dp = ((b.lat - a.lat) * Math.PI) / 180,
    dl = ((b.lon - a.lon) * Math.PI) / 180,
    q =
      Math.sin(dp / 2) ** 2 +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}
function line(points: RoutePoint[]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: points.map((p) => [p.lon, p.lat]),
    },
  };
}
function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
export default function LiveHike() {
  const searchParams = useSearchParams(),
    requested = searchParams.get("trail"),
    demo = searchParams.get("demo") === "1";
  const [trailId, setTrailId] = useState(() =>
      TRAILS.some((t) => t.id === requested) ? requested! : "jouar-el-haouz",
    ),
    [route, setRoute] = useState<RoutePoint[]>([]),
    [session, setSession] = useState<LiveSession | null>(null),
    [summary, setSummary] = useState<LiveSnapshot | null>(null),
    [postHike, setPostHike] = useState<PostHike | null>(null),
    [gps, setGps] = useState("READY"),
    [scenario, setScenario] =
      useState<keyof typeof SIMULATION_SCENARIOS>("normal"),
    [simulating, setSimulating] = useState(false),
    [speed, setSpeed] = useState(8);
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const container = useRef<HTMLDivElement>(null),
    map = useRef<mapboxgl.Map | null>(null),
    watch = useRef<number | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    simIndex = useRef(0);
  const trail = TRAILS.find((t) => t.id === trailId)!;
  useEffect(() => {
    navigator.serviceWorker?.register("/sw.js");
  }, []);
  useEffect(() => {
    fetch(trail.file)
      .then(async (r) => (trail.file.endsWith(".json") ? r.json() : r.text()))
      .then((payload) => {
        if (typeof payload !== "string") {
          setRoute((payload as { points: RoutePoint[] }).points);
          setSession(null);
          setSummary(null);
          setPostHike(null);
          return;
        }
        const xml = new DOMParser().parseFromString(payload, "application/xml");
        let distance = 0;
        const pts = [...xml.getElementsByTagNameNS("*", "trkpt")].map(
          (n, i, all) => {
            const p: RoutePoint = {
              lat: +(n.getAttribute("lat") || 0),
              lon: +(n.getAttribute("lon") || 0),
              ele: +(n.getElementsByTagNameNS("*", "ele")[0]?.textContent || 0),
              distance,
            };
            if (i) {
              const prev: RoutePoint = {
                lat: +(all[i - 1].getAttribute("lat") || 0),
                lon: +(all[i - 1].getAttribute("lon") || 0),
                ele: 0,
                distance: 0,
              };
              distance += dist(prev, p);
              p.distance = distance;
            }
            return p;
          },
        );
        setRoute(pts);
        setSession(null);
        setSummary(null);
        setPostHike(null);
      });
  }, [trail]);
  useEffect(() => {
    if (session?.state !== "COMPLETED") return;
    fetch(`/api/live-hikes/${session.id}/summary`)
      .then((r) => r.json())
      .then((data) => setPostHike(data as PostHike))
      .catch(() => setGps("SUMMARY UNAVAILABLE · HIKE SAVED"));
  }, [session?.id, session?.state]);
  useEffect(() => {
    if (!route.length || !container.current) return;
    mapboxgl.accessToken = TOKEN;
    map.current?.remove();
    const bounds = route.reduce(
      (b, p) => b.extend([p.lon, p.lat]),
      new mapboxgl.LngLatBounds(),
    );
    const m = new mapboxgl.Map({
      container: container.current,
      style: "mapbox://styles/mapbox/standard",
      bounds,
      fitBoundsOptions: { padding: 40 },
      attributionControl: false,
    });
    map.current = m;
    m.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      "bottom-right",
    );
    const resizeObserver = new ResizeObserver(() => m.resize());
    resizeObserver.observe(container.current);
    m.once("load", () => m.resize());
    m.on("error", () => setGps("MAP TILES UNAVAILABLE · TRACKING ACTIVE"));
    m.on("load", () => {
      m.addSource("planned", { type: "geojson", data: line(route) });
      m.addLayer({
        id: "remaining",
        type: "line",
        source: "planned",
        paint: {
          "line-color": "#78f29f",
          "line-width": 6,
          "line-opacity": 0.9,
        },
      });
      m.addSource("completed", {
        type: "geojson",
        data: line(route.slice(0, 2)),
      });
      m.addLayer({
        id: "done",
        type: "line",
        source: "completed",
        paint: { "line-color": "#ffffff", "line-width": 7 },
      });
      m.addSource("live-user", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Point",
            coordinates: [route[0].lon, route[0].lat],
          },
        },
      });
      m.addLayer({
        id: "user",
        type: "circle",
        source: "live-user",
        paint: {
          "circle-radius": 8,
          "circle-color": "#55b8ff",
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 3,
        },
      });
    });
    return () => {
      resizeObserver.disconnect();
      m.remove();
      map.current = null;
    };
  }, [route]);
  useEffect(() => {
    const m = map.current;
    if (!m || !summary || !route.length) return;
    const idx = Math.max(
      1,
      route.findIndex((p) => p.distance >= summary.progressM),
    );
    (m.getSource("completed") as mapboxgl.GeoJSONSource | undefined)?.setData(
      line(route.slice(0, idx + 1)),
    );
    (m.getSource("planned") as mapboxgl.GeoJSONSource | undefined)?.setData(
      line(route.slice(idx)),
    );
    if (summary.lastPosition)
      (m.getSource("live-user") as mapboxgl.GeoJSONSource | undefined)?.setData(
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Point",
            coordinates: [
              summary.lastPosition.longitude,
              summary.lastPosition.latitude,
            ],
          },
        },
      );
  }, [summary, route]);
  async function api(path: string, body?: unknown) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await r.json()) as Record<string, unknown>;
    if (!r.ok)
      throw new Error(
        typeof data.error === "string" ? data.error : "Live request failed",
      );
    return data;
  }
  async function create() {
    const data = (await api("/api/live-hikes", {
      trailId,
      route,
      predictedHours: estimateBaselineHours(trail),
      sunsetHour: 19.75,
    })) as LiveSession;
    setSession(data);
    setSummary(data.summary);
    setGps("SESSION CREATED");
  }
  async function action(name: string) {
    if (!session) return;
    const data = (await api(
      `/api/live-hikes/${session.id}/${name}`,
    )) as LiveSession;
    setSession(data);
    setSummary(data.summary);
    if (name === "start") startGps(data);
    if (["pause", "finish", "cancel"].includes(name)) stopTracking();
    if (name === "resume") startGps(data);
  }
  function queue(reading: LocationReading) {
    const key = "trailsense-live-queue",
      items = JSON.parse(
        localStorage.getItem(key) || "[]",
      ) as LocationReading[];
    localStorage.setItem(key, JSON.stringify([...items, reading].slice(-500)));
  }
  async function send(
    reading: LocationReading,
    target = session,
    forceNetwork = false,
  ) {
    if (!target) return;
    if (!navigator.onLine && !forceNetwork) {
      const result = processReading(target, reading);
      setSession(structuredClone(target));
      setSummary(result);
      queue(reading);
      setGps("OFFLINE · BASIC TRACKING · QUEUED");
      return;
    }
    try {
      const key = "trailsense-live-queue",
        queued = JSON.parse(
          localStorage.getItem(key) || "[]",
        ) as LocationReading[],
        data = (await api(`/api/live-hikes/${target.id}/locations`, {
          readings: [...queued, reading],
        })) as unknown as { summary: LiveSnapshot };
      localStorage.removeItem(key);
      setSummary(data.summary);
      setGps(reading.accuracy_m > 60 ? "LOW ACCURACY" : "GPS ACTIVE");
    } catch {
      const result = processReading(target, reading);
      setSession(structuredClone(target));
      setSummary(result);
      queue(reading);
      setGps("NETWORK LOST · BASIC TRACKING");
    }
  }
  function startGps(target: LiveSession) {
    if (!navigator.geolocation) {
      setGps("GPS UNAVAILABLE");
      return;
    }
    watch.current = navigator.geolocation.watchPosition(
      (p) =>
        send(
          {
            session_id: target.id,
            timestamp: new Date(p.timestamp).toISOString(),
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracy_m: p.coords.accuracy,
            altitude_m: p.coords.altitude,
            speed_mps: p.coords.speed,
            heading_degrees: p.coords.heading,
          },
          target,
        ),
      (e) =>
        setGps(
          e.code === 1
            ? "LOCATION PERMISSION DENIED"
            : e.code === 3
              ? "LOCATION TIMEOUT"
              : "GPS UNAVAILABLE",
        ),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    );
  }
  function stopTracking() {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setSimulating(false);
  }
  async function startSimulation() {
    let live = session;
    const baseline = estimateBaselineHours(trail);
    if (!live) {
      live = (await api("/api/live-hikes", {
        trailId,
        route,
        predictedHours: baseline,
        sunsetHour: 19.7,
        weather: { apparent: 26, rain: 12, wind: 18, source: "seeded-demo" },
      })) as LiveSession;
      setSession(live);
      setSummary(live.summary);
    }
    if (live.state === "CREATED") {
      live = (await api(`/api/live-hikes/${live.id}/start`)) as LiveSession;
      setSession(live);
      setSummary(live.summary);
    }
    simIndex.current = 0;
    setSimulating(true);
    const cfg = SIMULATION_SCENARIOS[scenario],
      started = Date.now(),
      step = Math.max(1, Math.round(route.length / 36)),
      predictedPaceKmh = trail.distanceKm / baseline;
    let elapsedHours = 0,
      previousDistanceM = route[0]?.distance || 0;
    timer.current = setInterval(
      async () => {
        if (simIndex.current >= route.length - 1) {
          stopTracking();
          return;
        }
        simIndex.current = Math.min(route.length - 1, simIndex.current + step);
        const p = route[simIndex.current],
          segmentDistanceKm = Math.max(
            0,
            (p.distance - previousDistanceM) / 1000,
          ),
          off =
            scenario === "offroute" &&
            simIndex.current > route.length * 0.38 &&
            simIndex.current < route.length * 0.52
              ? cfg.offRouteM / 111111
              : 0,
          timestamp = new Date(started + elapsedHours * 36e5).toISOString(),
          reading = {
            session_id: live!.id,
            timestamp,
            latitude: p.lat + off,
            longitude: p.lon,
            accuracy_m: cfg.noiseM,
            altitude_m: p.ele,
            speed_mps: null,
            heading_degrees: null,
          };
        elapsedHours += segmentDistanceKm / (predictedPaceKmh * cfg.pace);
        previousDistanceM = p.distance;
        reading.timestamp = new Date(started + elapsedHours * 36e5).toISOString();
        await send(reading, live, true);
        if (simIndex.current >= route.length - 1) {
          for (let i = 1; i <= 4; i++)
            await send(
              {
                ...reading,
                timestamp: new Date(
                  new Date(timestamp).getTime() + i * 10000,
                ).toISOString(),
              },
              live,
              true,
            );
          stopTracking();
          const done = (await api(
            `/api/live-hikes/${live!.id}/finish`,
          )) as LiveSession;
          setSession(done);
          setGps("SIMULATION COMPLETE · SUMMARY READY");
        }
      },
      Math.max(450, 1800 / speed),
    );
  }
  return (
    <main className="live-page">
      <div ref={container} className="live-map" />
      <header className="live-header">
        <Link href="/">TI · TRAIL-INTEL</Link>
        <span className={online ? "online" : "offline"}>
          {online ? "ONLINE" : "OFFLINE · BASIC TRACKING"}
        </span>
      </header>
      <section className="live-sheet">
        {demo && (
          <div className="live-demo-guide">
            <b>HACKATHON DEMO · STEP 3 OF 3</b>
            <span>Select Slower Than Expected, then start the simulated live hike.</span>
            <Link
              href="/demo"
              onClick={() => localStorage.removeItem("trailsense-live-queue")}
            >
              Reset Demo
            </Link>
          </div>
        )}
        <div className="live-title">
          <div>
            <p>LIVE HIKE MODE · {session?.state || "NOT STARTED"}</p>
            <h1>{trail.name}</h1>
          </div>
          <span className="gps">● {gps}</span>
        </div>
        {!session && (
          <div className="setup">
            <label>
              Trail
              <select
                value={trailId}
                onChange={(e) => setTrailId(e.target.value)}
              >
                {TRAILS.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={create}>Create live session</button>
          </div>
        )}
        {session && (
          <>
            <div className="live-metrics">
              <article>
                <strong>{summary?.progressPct || 0}%</strong>
                <span>PROGRESS</span>
              </article>
              <article>
                <strong>
                  {summary?.distanceRemainingKm.toFixed(1) || "—"} km
                </strong>
                <span>REMAINING</span>
              </article>
              <article>
                <strong>{summary?.currentPaceKmh || 0} km/h</strong>
                <span>ACTUAL PACE</span>
                <small>{summary?.predictedPaceKmh || 0} planned</small>
              </article>
              <article>
                <strong>{summary?.estimatedFinish || "—"}</strong>
                <span>UPDATED FINISH</span>
              </article>
              <article>
                <strong>{summary?.daylightBufferMinutes ?? "—"} min</strong>
                <span>DAYLIGHT</span>
              </article>
              <article>
                <strong>
                  {summary?.gpsAccuracyM
                    ? `${Math.round(summary.gpsAccuracyM)} m`
                    : "—"}
                </strong>
                <span>GPS ACCURACY</span>
              </article>
              <article><strong>{summary?.fatigueScore ?? "—"}/100</strong><span>FATIGUE</span></article>
              <article><strong>{summary?.weatherSuitability ?? "—"}/100</strong><span>WEATHER FIT</span></article>
            </div>
            {summary?.primaryWarning ? (
              <div
                className={`primary-warning ${summary.primaryWarning.severity}`}
              >
                <p>{summary.primaryWarning.title}</p>
                <strong>{summary.primaryWarning.message}</strong>
                <span>{summary.primaryWarning.recommended_action}</span>
              </div>
            ) : (
              <div className="primary-warning clear">
                <p>CURRENT GUIDANCE</p>
                <strong>Continue monitoring progress and conditions.</strong>
                <span>
                  Live estimates are decision support, not a declaration of
                  safety.
                </span>
              </div>
            )}
            <div className="next-row">
              <span>
                <b>{summary?.nextDifficultSegment || "Waiting for progress"}</b>
                next difficult section
              </span>
              <span>
                <b>{summary?.nextWaypoint || "Route finish"}</b>
                {summary?.distanceToWaypointM ?? "—"} m away
              </span>
              <span>
                <b>{summary?.offRouteStatus || "ON_ROUTE"}</b>
                {Math.round(summary?.routeDistanceM || 0)} m from route
              </span>
            </div>
            {summary?.recommendation && (
              <div className="live-recommendation">
                <p>STRUCTURED RECOMMENDATION</p>
                <strong>{summary.recommendation}</strong>
                <span>
                  Derived from current progress, pace, fatigue, route difficulty,
                  weather timing, and daylight margin.
                </span>
              </div>
            )}
            <div className="live-actions">
              {session.state === "CREATED" && (
                <button onClick={() => action("start")}>Start GPS hike</button>
              )}
              {session.state === "ACTIVE" && (
                <button onClick={() => action("pause")}>Pause</button>
              )}
              {session.state === "PAUSED" && (
                <button onClick={() => action("resume")}>Resume</button>
              )}
              {["ACTIVE", "PAUSED"].includes(session.state) && (
                <button className="finish" onClick={() => action("finish")}>
                  Finish
                </button>
              )}
            </div>
          </>
        )}
        {postHike && (
          <section className="post-hike" aria-label="Post-hike summary">
            <p>POST-HIKE SUMMARY</p><h2>Hike completed</h2>
            <div>
              <span><b>{postHike.actualDurationMinutes} min</b>actual duration</span><span><b>{postHike.movingMinutes} min</b>moving</span><span><b>{postHike.stoppedMinutes} min</b>stopped</span>
              <span><b>{postHike.maximumOffRouteDistanceM} m</b>maximum deviation</span><span><b>{postHike.warningsTriggered.length}</b>warnings</span><span><b>{postHike.predictedFinish}</b>final predicted finish</span>
            </div>
            <strong>{postHike.profileCalibrationSuggestion}</strong><small>No profile change is applied without your confirmation.</small>
          </section>
        )}
        <div className="simulation">
          <p>DEMO REPLAY · SAME LIVE PIPELINE</p>
          <select
            aria-label="Simulation scenario"
            value={scenario}
            onChange={(e) =>
              setScenario(e.target.value as keyof typeof SIMULATION_SCENARIOS)
            }
          >
            {Object.entries(SIMULATION_SCENARIOS).map(([id, s]) => (
              <option value={id} key={id}>
                {s.label}
              </option>
            ))}
          </select>
          <label>
            Speed{" "}
            <input
              aria-label="Playback speed"
              type="range"
              min="1"
              max="20"
              value={speed}
              onChange={(e) => setSpeed(+e.target.value)}
            />{" "}
            {speed}×
          </label>
          <button onClick={simulating ? stopTracking : startSimulation}>
            {simulating ? "Stop replay" : "Start Simulated Live Hike"}
          </button>
        </div>
        <footer>
          Keep this page in the foreground. Browser background GPS is not
          guaranteed. Raw location stays in this live session and queued
          readings stay on this device until synchronized.
        </footer>
      </section>
    </main>
  );
}
