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
    [speed, setSpeed] = useState(8),
    [sessionKind, setSessionKind] = useState<"real" | "simulation" | null>(null),
    [weatherStatus, setWeatherStatus] = useState("Not started");
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const container = useRef<HTMLDivElement>(null),
    sheet = useRef<HTMLElement>(null),
    map = useRef<mapboxgl.Map | null>(null),
    watch = useRef<number | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    speedRef = useRef(speed),
    syncQueue = useRef<Promise<void>>(Promise.resolve()),
    simIndex = useRef(0),
    lastWeatherRefresh = useRef(0);
  const trail = TRAILS.find((t) => t.id === trailId)!;
  const baselineHours = estimateBaselineHours(trail);
  const plannedPaceKmh = trail.distanceKm / baselineHours;
  const sessionId = session?.id;
  useEffect(() => {
    navigator.serviceWorker
      ?.register("/sw.js?v=6", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => undefined);
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
    if (sessionId) sheet.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [sessionId]);
  useEffect(() => {
    if (!route.length || !container.current) return;
    if (!TOKEN) {
      console.error(
        "Interactive map unavailable: NEXT_PUBLIC_MAPBOX_TOKEN was not provided at build time.",
      );
      return;
    }
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
        id: "remaining-outline",
        type: "line",
        source: "planned",
        paint: {
          "line-color": "#07110e",
          "line-width": 13,
          "line-opacity": 0.95,
        },
      });
      m.addLayer({
        id: "remaining",
        type: "line",
        source: "planned",
        paint: {
          "line-color": "#ffd84d",
          "line-width": 7,
          "line-opacity": 1,
        },
      });
      m.addSource("completed", {
        type: "geojson",
        data: line(route.slice(0, 2)),
      });
      m.addLayer({
        id: "done-outline",
        type: "line",
        source: "completed",
        paint: {
          "line-color": "#07110e",
          "line-width": 14,
          "line-opacity": 0.95,
        },
      });
      m.addLayer({
        id: "done",
        type: "line",
        source: "completed",
        paint: { "line-color": "#27c7ff", "line-width": 8 },
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
          "circle-radius": 9,
          "circle-color": "#ff5367",
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 4,
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
  async function create(weather?: LiveSession["weather"]) {
    const data = (await api("/api/live-hikes", {
      trailId,
      route,
      predictedHours: estimateBaselineHours(trail),
      sunsetHour: 19.75,
      weather,
    })) as LiveSession;
    setSession(data);
    setSummary(data.summary);
    return data;
  }
  async function fetchLiveWeather(latitude: number, longitude: number) {
    const response = await fetch(
      `/api/live-weather?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`,
    );
    const data = (await response.json()) as {
      apparent?: number;
      rain?: number;
      wind?: number;
      retrievedAt?: string;
      error?: string;
    };
    if (!response.ok) throw new Error(data.error || "Live weather unavailable");
    return {
      apparent: Number(data.apparent),
      rain: Number(data.rain),
      wind: Number(data.wind),
      source: "live" as const,
      updatedAt: data.retrievedAt || new Date().toISOString(),
    };
  }
  async function refreshWeather(
    target: LiveSession,
    latitude: number,
    longitude: number,
    force = false,
  ) {
    if (!force && Date.now() - lastWeatherRefresh.current < 10 * 60 * 1000)
      return;
    lastWeatherRefresh.current = Date.now();
    try {
      const weather = await fetchLiveWeather(latitude, longitude);
      const updated = (await api(
        `/api/live-hikes/${target.id}/weather`,
        weather,
      )) as LiveSession;
      setSession(updated);
      setSummary(updated.summary);
      setWeatherStatus(`Live · updated ${new Date(weather.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    } catch {
      setWeatherStatus("Live refresh unavailable · retrying automatically");
    }
  }
  async function startRealHike() {
    if (!route.length) return;
    setSessionKind("real");
    setGps("STARTING REAL GPS SESSION");
    let weather: LiveSession["weather"];
    try {
      weather = await fetchLiveWeather(route[0].lat, route[0].lon);
      setWeatherStatus("Live weather connected");
      lastWeatherRefresh.current = Date.now();
    } catch {
      weather = {
        apparent: 27,
        rain: 15,
        wind: 20,
        source: "unavailable",
        updatedAt: new Date().toISOString(),
      };
      setWeatherStatus("Live weather unavailable · retrying automatically");
    }
    const created = await create(weather);
    const active = (await api(`/api/live-hikes/${created.id}/start`)) as LiveSession;
    setSession(active);
    setSummary(active.summary);
    startGps(active);
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
    if (forceNetwork) {
      const result = processReading(target, reading);
      setSession(structuredClone(target));
      setSummary({ ...result });
      syncQueue.current = syncQueue.current
        .then(async () => {
          await api(`/api/live-hikes/${target.id}/locations`, {
            readings: [reading],
          });
        })
        .catch(() => queue(reading));
      return;
    }
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
      (p) => {
        const reading = {
            session_id: target.id,
            timestamp: new Date(p.timestamp).toISOString(),
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracy_m: p.coords.accuracy,
            altitude_m: p.coords.altitude,
            speed_mps: p.coords.speed,
            heading_degrees: p.coords.heading,
          };
        void send(reading, target);
        void refreshWeather(target, p.coords.latitude, p.coords.longitude);
      },
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
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setSimulating(false);
  }
  async function startSimulation() {
    setSessionKind("simulation");
    setWeatherStatus("Seeded demo weather · deterministic replay");
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
    const advanceReplay = async () => {
        if (simIndex.current >= route.length - 1) {
          stopTracking();
          return;
        }
        simIndex.current = Math.min(route.length - 1, simIndex.current + step);
        const p = route[simIndex.current],
          progressRatio = simIndex.current / Math.max(1, route.length - 1),
          effectivePace =
            scenario === "slowdown"
              ? 1 - Math.min(0.23, Math.max(0, progressRatio - 0.15) * 0.46)
              : cfg.pace,
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
        elapsedHours += segmentDistanceKm / (predictedPaceKmh * effectivePace);
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
          await syncQueue.current;
          stopTracking();
          const done = (await api(
            `/api/live-hikes/${live!.id}/finish`,
          )) as LiveSession;
          setSession(done);
          setGps("SIMULATION COMPLETE · SUMMARY READY");
          return;
        }
        timer.current = setTimeout(
          advanceReplay,
          Math.max(90, 1800 / speedRef.current),
        );
      };
    timer.current = setTimeout(
      advanceReplay,
      Math.max(90, 1800 / speedRef.current),
    );
  }
  return (
    <main className="live-page">
      <div ref={container} className="live-map" />
      <div className="live-map-key" aria-label="Live route map legend">
        <span><i className="remaining-route" />Route ahead</span>
        <span><i className="completed-route" />Completed</span>
        <span><i className="current-location" />Current location</span>
      </div>
      <header className="live-header">
        <Link href="/">TI · TRAIL-INTEL</Link>
        <span className={online ? "online" : "offline"}>
          {online ? "ONLINE" : "OFFLINE · BASIC TRACKING"}
        </span>
      </header>
      <section className={`live-sheet ${session ? "session-active" : "session-setup"}`} ref={sheet}>
        {demo && (
          <div className="live-demo-guide">
            <b>HACKATHON DEMO · STEP 3 OF 3</b>
            <span>Choose Simulated Hike below, select Slower Than Expected, and start the replay.</span>
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
        {session && <div className="pace-overview" aria-label="Live pace comparison">
          <article>
            <span>PLANNED PACE</span>
            <strong>{plannedPaceKmh.toFixed(1)} km/h</strong>
            <small>Terrain-adjusted baseline</small>
          </article>
          <article>
            <span>ACTUAL PACE</span>
            <strong>
              {summary?.currentPaceKmh
                ? `${summary.currentPaceKmh.toFixed(1)} km/h`
                : "Starts with GPS or simulation"}
            </strong>
            <small>Updates from accepted location readings</small>
          </article>
        </div>}
        {!session && (
          <section className="live-start" aria-label="Choose a Live Hike mode">
            <label className="trail-choice">
              <span>1 · SELECT YOUR TRAIL</span>
              <select value={trailId} onChange={(e) => setTrailId(e.target.value)}>
                {TRAILS.map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}
              </select>
              <small>{trail.country} · {trail.region} · {trail.distanceKm} km · {trail.ascentM} m ascent</small>
            </label>
            <p className="mode-heading">2 · CHOOSE HOW TO START</p>
            <div className="mode-options">
              <article className="mode-card real-mode">
                <p>REAL HIKE SESSION</p>
                <h2>Use my phone’s GPS</h2>
                <span>Tracks your actual location, pace, progress, fatigue, finish time, daylight, and refreshed live weather.</span>
                <ul><li>Requires location permission</li><li>Keep this page open during the hike</li><li>Weather refreshes every 10 minutes</li></ul>
                <button onClick={startRealHike}>Start Real GPS Hike</button>
              </article>
              <article className="mode-card simulation-mode">
                <p>SIMULATED HIKE</p>
                <h2>Run the judge-friendly replay</h2>
                <span>Uses generated locations through the same pace, fatigue, warning, and completion pipeline.</span>
                <label>Scenario<select aria-label="Simulation scenario" value={scenario} onChange={(e) => setScenario(e.target.value as keyof typeof SIMULATION_SCENARIOS)}>{Object.entries(SIMULATION_SCENARIOS).map(([id, s]) => <option value={id} key={id}>{s.label}</option>)}</select></label>
                <label>Replay speed<select aria-label="Playback speed" value={speed} onChange={(e) => { const nextSpeed = +e.target.value; speedRef.current = nextSpeed; setSpeed(nextSpeed); }}><option value="1">1× · presentation pace</option><option value="4">4× · relaxed</option><option value="8">8× · standard demo</option><option value="20">20× · fastest</option></select></label>
                <button onClick={startSimulation}>Start Simulated Hike</button>
              </article>
            </div>
          </section>
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
              <article><strong>{summary?.weatherSuitability ?? "—"}/100</strong><span>WEATHER FIT</span><small>{weatherStatus}</small></article>
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
              {sessionKind === "real" && session.state === "ACTIVE" && (
                <button onClick={() => action("pause")}>Pause</button>
              )}
              {sessionKind === "real" && session.state === "PAUSED" && (
                <button onClick={() => action("resume")}>Resume</button>
              )}
              {sessionKind === "real" && ["ACTIVE", "PAUSED"].includes(session.state) && (
                <button className="finish" onClick={() => action("finish")}>
                  Finish
                </button>
              )}
              {sessionKind === "simulation" && simulating && (
                <button className="finish" onClick={stopTracking}>Stop simulation</button>
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
        <footer>
          Keep this page in the foreground. Browser background GPS is not
          guaranteed. Raw location stays in this live session and queued
          readings stay on this device until synchronized.
        </footer>
      </section>
    </main>
  );
}
