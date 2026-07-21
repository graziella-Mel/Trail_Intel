"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  DEFAULT_HIKER_PROFILE,
  TRAIL_CATALOG,
  type HikerProfile,
} from "../lib/trail-catalog";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./mapbox-overrides.css";
import "./profile-modal.css";
import "./timing.css";
import "./layout-fixes.css";
import "./environment.css";
import "./briefing.css";
import "./trail-catalog.css";
import "./demo.css";

type Point = {
  lat: number;
  lon: number;
  ele: number;
  time?: string;
  distance: number;
};
type Waypoint = { lat: number; lon: number; ele: number; name: string };
type Profile = HikerProfile;
type EffortSegment = {
  start: number;
  end: number;
  score: number;
  raw: number;
  gain: number;
  grade: number;
  center: Point;
};
type TimedSegment = EffortSegment & {
  speedKmh: number;
  durationHours: number;
  arrivalHours: number;
  slowdownPct: number;
};
type WeatherSample = {
  hourly: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature: number[];
    precipitation_probability: number[];
    wind_speed_10m: number[];
    cloud_cover: number[];
  };
  daily: { time: string[]; sunrise: string[]; sunset: string[] };
};
type SegmentEnvironment = {
  segment: TimedSegment;
  temperature: number;
  apparent: number;
  rain: number;
  wind: number;
  cloud: number;
};
type Briefing = {
  headline: string;
  summary: string;
  keyFindings: {
    title: string;
    evidence: string;
    priority: "high" | "medium" | "low";
  }[];
  turnaroundGuidance: string;
  uncertainties: string[];
  disclaimer: string;
};

const DEFAULT_PROFILE: Profile = DEFAULT_HIKER_PROFILE;
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const TRAILS = TRAIL_CATALOG;

function haversine(a: Point, b: Point) {
  const r = 6371e3,
    p1 = (a.lat * Math.PI) / 180,
    p2 = (b.lat * Math.PI) / 180;
  const dp = ((b.lat - a.lat) * Math.PI) / 180,
    dl = ((b.lon - a.lon) * Math.PI) / 180;
  const q =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

function formatDuration(hours: number) {
  const h = Math.floor(hours),
    m = Math.round((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function clock(hours: number) {
  const wrapped = ((hours % 24) + 24) % 24;
  const minutes = Math.round((wrapped % 1) * 60);
  return `${String((Math.floor(wrapped) + Math.floor(minutes / 60)) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function calculateSegments(points: Point[], profile: Profile): EffortSegment[] {
  if (points.length < 2) return [];
  const chunks: Omit<EffortSegment, "score">[] = [];
  let start = 0,
    cumulativeGain = 0;
  for (let i = 1; i < points.length; i++) {
    const rise = Math.max(0, points[i].ele - points[i - 1].ele);
    cumulativeGain += rise;
    const isEnd =
      points[i].distance - points[start].distance >= 450 ||
      i === points.length - 1;
    if (!isEnd) continue;
    const distanceM = Math.max(1, points[i].distance - points[start].distance);
    let gain = 0;
    for (let j = start + 1; j <= i; j++)
      gain += Math.max(0, points[j].ele - points[j - 1].ele);
    const netRise = points[i].ele - points[start].ele;
    const grade = (netRise / distanceM) * 100;
    const distanceLoad =
      (distanceM / Math.max(1000, profile.distanceKm * 1000)) * 100;
    const climbLoad = (gain / Math.max(200, profile.ascentM)) * 130;
    const steepness = Math.min(42, Math.abs(grade) * 2.4);
    const routeProgress = points[i].distance / points.at(-1)!.distance;
    const distanceRatio =
      points[i].distance / Math.max(1000, profile.distanceKm * 1000);
    const climbRatio = cumulativeGain / Math.max(200, profile.ascentM);
    const accumulated =
      distanceRatio * 16 +
      Math.max(0, distanceRatio - 0.65) * 42 +
      climbRatio * 18 +
      Math.max(0, climbRatio - 0.65) * 34;
    const packPenalty = profile.packKg * (0.35 + routeProgress * 0.85);
    const pacePenalty = Math.max(
      -5,
      (4.8 - profile.paceKmh) * (3 + routeProgress * 4),
    );
    chunks.push({
      start,
      end: i,
      raw:
        distanceLoad +
        climbLoad +
        steepness +
        accumulated +
        packPenalty +
        pacePenalty,
      gain,
      grade,
      center: points[Math.floor((start + i) / 2)],
    });
    start = i;
  }
  return chunks.map((s) => ({
    ...s,
    score: Math.max(8, Math.min(100, Math.round(8 + s.raw))),
  }));
}

function segmentGeoJSON(
  points: Point[],
  segments: EffortSegment[],
  environment?: { enriched: SegmentEnvironment[]; sunsetHour: number } | null,
) {
  return {
    type: "FeatureCollection" as const,
    features: segments.map((s, index) => {
      const timed = s as TimedSegment;
      const conditions = environment?.enriched[index];
      const weatherRisk = conditions
        ? Math.max(
            Math.max(0, conditions.apparent - 26) * 7,
            Math.max(0, conditions.wind - 20) * 2.2,
            conditions.rain,
          )
        : 0;
      const daylightState =
        timed.arrivalHours && environment
          ? timed.arrivalHours >= environment.sunsetHour
            ? 2
            : timed.arrivalHours >= environment.sunsetHour - 1
              ? 1
              : 0
          : 0;
      return {
        type: "Feature" as const,
        properties: {
          effort: s.score,
          index,
          startKm: +(points[s.start].distance / 1000).toFixed(1),
          endKm: +(points[s.end].distance / 1000).toFixed(1),
          gain: Math.round(s.gain),
          grade: +s.grade.toFixed(1),
          speedKmh: timed.speedKmh ? +timed.speedKmh.toFixed(1) : null,
          arrival: timed.arrivalHours ? clock(timed.arrivalHours) : null,
          slowdown: timed.slowdownPct ?? null,
          apparent: conditions ? Math.round(conditions.apparent) : null,
          wind: conditions ? Math.round(conditions.wind) : null,
          rain: conditions ? Math.round(conditions.rain) : null,
          cloud: conditions ? Math.round(conditions.cloud) : null,
          weatherRisk: Math.round(weatherRisk),
          daylightState,
        },
        geometry: {
          type: "LineString" as const,
          coordinates: points
            .slice(s.start, s.end + 1)
            .map((p) => [p.lon, p.lat]),
        },
      };
    }),
  };
}

export default function Home() {
  const searchParams = useSearchParams();
  const requestedTrailId = searchParams.get("trail");
  const [manualTrailId, setManualTrailId] = useState<string | null>(null);
  const selectedTrailId =
    manualTrailId ||
    (TRAILS.some((trail) => trail.id === requestedTrailId)
      ? requestedTrailId!
      : TRAILS[0].id);
  const [points, setPoints] = useState<Point[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [departure, setDeparture] = useState(7);
  const [showStruggle, setShowStruggle] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [hikeDate, setHikeDate] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" }),
  );
  const [weather, setWeather] = useState<WeatherSample[]>([]);
  const [weatherStatus, setWeatherStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [mapMode, setMapMode] = useState<"fatigue" | "weather" | "daylight">(
    "fatigue",
  );
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingStatus, setBriefingStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [briefingError, setBriefingError] = useState("");
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const struggleMarker = useRef<mapboxgl.Marker | null>(null);
  const simulationPanel = useRef<HTMLElement>(null);
  const selectedTrail =
    TRAILS.find((trail) => trail.id === selectedTrailId) || TRAILS[0];
  useEffect(() => {
    struggleMarker.current?.remove();
    map.current?.remove();
    map.current = null;
    fetch(selectedTrail.file)
      .then(async (r) => {
        if (!r.ok) throw new Error("Route unavailable");
        return selectedTrail.file.endsWith(".json") ? r.json() : r.text();
      })
      .then((payload) => {
        if (typeof payload !== "string") {
          setPoints((payload as { points: Point[] }).points);
          setWaypoints([]);
          return;
        }
        const text = payload;
        const xml = new DOMParser().parseFromString(text, "application/xml");
        let distance = 0;
        const parsed = [...xml.getElementsByTagNameNS("*", "trkpt")].map(
          (n, i, all) => {
            const p: Point = {
              lat: +(n.getAttribute("lat") || 0),
              lon: +(n.getAttribute("lon") || 0),
              ele: +(n.getElementsByTagNameNS("*", "ele")[0]?.textContent || 0),
              time:
                n.getElementsByTagNameNS("*", "time")[0]?.textContent ||
                undefined,
              distance,
            };
            if (i)
              distance += haversine(
                {
                  ...p,
                  lat: +(all[i - 1].getAttribute("lat") || 0),
                  lon: +(all[i - 1].getAttribute("lon") || 0),
                },
                p,
              );
            p.distance = distance;
            return p;
          },
        );
        const wpts = [...xml.getElementsByTagNameNS("*", "wpt")].map((n) => ({
          lat: +(n.getAttribute("lat") || 0),
          lon: +(n.getAttribute("lon") || 0),
          ele: +(n.getElementsByTagNameNS("*", "ele")[0]?.textContent || 0),
          name:
            n.getElementsByTagNameNS("*", "name")[0]?.textContent || "Waypoint",
        }));
        setPoints(parsed);
        setWaypoints(wpts);
      })
      .catch((error) =>
        console.error(`Could not load ${selectedTrail.name}`, error),
      );
  }, [selectedTrail]);

  const segments = useMemo(
    () => calculateSegments(points, profile),
    [points, profile],
  );
  const struggleSegment = useMemo(
    () =>
      segments.reduce<EffortSegment | null>(
        (best, s) => (!best || s.score > best.score ? s : best),
        null,
      ),
    [segments],
  );
  const paceSimulation = useMemo(() => {
    if (!segments.length || !points.length) return null;
    const simulation = segments.reduce<{
      timed: TimedSegment[];
      elapsed: number;
    }>(
      (acc, s) => {
        const distanceKm =
          (points[s.end].distance - points[s.start].distance) / 1000;
        const slope =
          (points[s.end].ele - points[s.start].ele) /
          Math.max(1, distanceKm * 1000);
        const terrainSpeed = 6 * Math.exp(-3.5 * Math.abs(slope + 0.05));
        const fatigueFactor = 1 + Math.max(0, s.score - 35) / 180;
        const speedKmh = Math.max(
          1.1,
          Math.min(
            profile.paceKmh * 1.15,
            (terrainSpeed * (profile.paceKmh / 5.04)) / fatigueFactor,
          ),
        );
        const durationHours = distanceKm / speedKmh;
        const elapsed = acc.elapsed + durationHours;
        return {
          elapsed,
          timed: [
            ...acc.timed,
            {
              ...s,
              speedKmh,
              durationHours,
              arrivalHours: departure + elapsed,
              slowdownPct: Math.max(
                0,
                Math.round((1 - speedKmh / profile.paceKmh) * 100),
              ),
            },
          ],
        };
      },
      { timed: [], elapsed: 0 },
    );
    const timed = simulation.timed;
    const movingHours = simulation.elapsed;
    const restHours = Math.max(
      0.25,
      Math.floor(movingHours / 1.5) * 0.1 +
        segments.filter((s) => s.score >= 75).length * 0.035,
    );
    const totalHours = movingHours + restHours;
    const firstSlowdown =
      timed.find((s) => s.speedKmh < profile.paceKmh * 0.62) ||
      timed[Math.floor(timed.length * 0.65)];
    const highPointIndex = points.reduce(
      (best, p, i) => (p.ele > points[best].ele ? i : best),
      0,
    );
    const highPointSegment =
      timed.find((s) => highPointIndex >= s.start && highPointIndex <= s.end) ||
      timed[0];
    const turnaroundReviewHours = departure + totalHours * 0.52;
    return {
      timed,
      movingHours,
      restHours,
      totalHours,
      lowHours: totalHours * 0.92,
      highHours: totalHours * 1.13,
      firstSlowdown,
      highPointSegment,
      turnaroundReviewHours,
    };
  }, [segments, points, profile, departure]);

  useEffect(() => {
    if (!paceSimulation?.timed.length) return;
    const timed = paceSimulation.timed;
    const sampleIndexes = Array.from(
      { length: Math.min(7, timed.length) },
      (_, i) =>
        Math.round(
          (i * (timed.length - 1)) / Math.max(1, Math.min(7, timed.length) - 1),
        ),
    );
    const samples = sampleIndexes.map((i) => timed[i].center);
    const params = new URLSearchParams({
      latitude: samples.map((p) => p.lat.toFixed(5)).join(","),
      longitude: samples.map((p) => p.lon.toFixed(5)).join(","),
      hourly:
        "temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,cloud_cover",
      daily: "sunrise,sunset",
      timezone: "Asia/Beirut",
      forecast_days: "16",
    });
    const controller = new AbortController();
    fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error("Forecast unavailable");
        return r.json();
      })
      .then((json) => {
        setWeather(Array.isArray(json) ? json : [json]);
        setWeatherStatus("ready");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setWeatherStatus("error");
      });
    return () => controller.abort();
  }, [paceSimulation]);

  const environment = useMemo(() => {
    if (!paceSimulation || !weather.length) return null;
    if (!weather[0].daily.time.includes(hikeDate)) return null;
    const enriched = paceSimulation.timed.map((s, i, all) => {
      const sampleIndex = Math.round(
        (i / Math.max(1, all.length - 1)) * (weather.length - 1),
      );
      const sample = weather[sampleIndex];
      const hour = `${hikeDate}T${clock(s.arrivalHours).slice(0, 2)}:00`;
      let hi = sample.hourly.time.indexOf(hour);
      if (hi < 0)
        hi = sample.hourly.time.findIndex((t) => t.startsWith(hikeDate));
      if (hi < 0)
        return {
          segment: s,
          temperature: NaN,
          apparent: NaN,
          rain: NaN,
          wind: NaN,
          cloud: NaN,
        };
      return {
        segment: s,
        temperature: sample.hourly.temperature_2m[hi],
        apparent: sample.hourly.apparent_temperature[hi],
        rain: sample.hourly.precipitation_probability[hi],
        wind: sample.hourly.wind_speed_10m[hi],
        cloud: sample.hourly.cloud_cover[hi],
      };
    });
    const dailyIndex = Math.max(0, weather[0].daily.time.indexOf(hikeDate));
    const sunset = weather[0].daily.sunset[dailyIndex];
    const sunsetHour = sunset
      ? +sunset.slice(11, 13) + +sunset.slice(14, 16) / 60
      : 19.5;
    const finishHour = departure + paceSimulation.totalHours;
    const hottest = enriched.reduce(
      (a, b) => (b.apparent > a.apparent ? b : a),
      enriched[0],
    );
    const windiest = enriched.reduce(
      (a, b) => (b.wind > a.wind ? b : a),
      enriched[0],
    );
    const wettest = enriched.reduce(
      (a, b) => (b.rain > a.rain ? b : a),
      enriched[0],
    );
    const warnings = [
      hottest.apparent >= 30
        ? `Heat peaks near km ${(hottest.segment.center.distance / 1000).toFixed(1)}`
        : null,
      windiest.wind >= 30
        ? `Strong wind near km ${(windiest.segment.center.distance / 1000).toFixed(1)}`
        : null,
      wettest.rain >= 45
        ? `Rain risk reaches ${Math.round(wettest.rain)}%`
        : null,
      finishHour > sunsetHour ? "Predicted finish after sunset" : null,
    ].filter(Boolean) as string[];
    return {
      enriched,
      sunset,
      sunsetHour,
      daylightBuffer: sunsetHour - finishHour,
      hottest,
      windiest,
      wettest,
      warnings,
    };
  }, [paceSimulation, weather, hikeDate, departure]);
  const forecastRange = useMemo(
    () =>
      weather[0]?.daily.time.length
        ? { min: weather[0].daily.time[0], max: weather[0].daily.time.at(-1)! }
        : null,
    [weather],
  );
  const dateInForecast =
    !!forecastRange &&
    hikeDate >= forecastRange.min &&
    hikeDate <= forecastRange.max;

  useEffect(() => {
    const restoreLayout = () =>
      requestAnimationFrame(() => {
        if (simulationPanel.current) simulationPanel.current.scrollLeft = 0;
        map.current?.resize();
      });
    window.addEventListener("pageshow", restoreLayout);
    window.addEventListener("popstate", restoreLayout);
    window.addEventListener("resize", restoreLayout);
    return () => {
      window.removeEventListener("pageshow", restoreLayout);
      window.removeEventListener("popstate", restoreLayout);
      window.removeEventListener("resize", restoreLayout);
    };
  }, []);

  useEffect(() => {
    if (!points.length || !mapContainer.current || map.current) return;
    if (!MAPBOX_TOKEN) {
      console.error(
        "Interactive map unavailable: NEXT_PUBLIC_MAPBOX_TOKEN was not provided at build time.",
      );
      return;
    }
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const bounds = points.reduce(
      (b, p) => b.extend([p.lon, p.lat]),
      new mapboxgl.LngLatBounds(),
    );
    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/standard",
      bounds,
      fitBoundsOptions: { padding: 58 },
      pitch: 57,
      bearing: -18,
      antialias: true,
      attributionControl: false,
    });
    map.current = m;
    m.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      "top-left",
    );
    m.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      "bottom-right",
    );
    const resizeObserver = new ResizeObserver(() => m.resize());
    resizeObserver.observe(mapContainer.current);
    m.once("load", () => m.resize());
    m.on("style.load", () => {
      m.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
      m.setTerrain({ source: "mapbox-dem", exaggeration: 1.35 });
      m.addSource("trail", {
        type: "geojson",
        data: segmentGeoJSON(
          points,
          calculateSegments(points, DEFAULT_PROFILE),
        ),
      });
      m.addLayer({
        id: "trail-glow",
        type: "line",
        source: "trail",
        paint: {
          "line-color": "#07110e",
          "line-width": 10,
          "line-opacity": 0.72,
        },
      });
      m.addLayer({
        id: "trail-effort",
        type: "line",
        source: "trail",
        paint: {
          "line-width": 5,
          "line-color": [
            "interpolate",
            ["linear"],
            ["get", "effort"],
            20,
            "#78f29f",
            48,
            "#dff16b",
            70,
            "#ff9a57",
            88,
            "#ff5367",
          ],
        },
      });
      m.addLayer({
        id: "trail-direction",
        type: "symbol",
        source: "trail",
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 95,
          "text-field": "▶",
          "text-size": 12,
          "text-rotation-alignment": "map",
          "text-keep-upright": false,
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#07110e",
          "text-halo-width": 1.5,
          "text-opacity": 0.95,
        },
      });
      m.addSource("weather-samples", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "weather-sample-dots",
        type: "circle",
        source: "weather-samples",
        layout: { visibility: "none" },
        paint: {
          "circle-radius": 8,
          "circle-color": "#10221a",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      m.addLayer({
        id: "weather-sample-labels",
        type: "symbol",
        source: "weather-samples",
        layout: {
          visibility: "none",
          "text-field": ["concat", ["to-string", ["get", "temperature"]], "°"],
          "text-size": 9,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
      });
      m.addSource("trail-ends", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { label: "START", kind: "start" },
              geometry: {
                type: "Point",
                coordinates: [points[0].lon, points[0].lat],
              },
            },
            {
              type: "Feature",
              properties: { label: "FINISH", kind: "finish" },
              geometry: {
                type: "Point",
                coordinates: [points.at(-1)!.lon, points.at(-1)!.lat],
              },
            },
          ],
        },
      });
      m.addLayer({
        id: "trail-end-dots",
        type: "circle",
        source: "trail-ends",
        paint: {
          "circle-radius": 7,
          "circle-color": [
            "match",
            ["get", "kind"],
            "start",
            "#78f29f",
            "#ffffff",
          ],
          "circle-stroke-color": "#07110e",
          "circle-stroke-width": 3,
        },
      });
      m.addLayer({
        id: "trail-end-labels",
        type: "symbol",
        source: "trail-ends",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 10,
          "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
          "text-offset": [0, -1.7],
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#07110e",
          "text-halo-width": 2,
        },
      });
      m.addSource("struggle-highlight", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      m.addLayer({
        id: "struggle-glow",
        type: "line",
        source: "struggle-highlight",
        layout: { visibility: "none" },
        paint: {
          "line-color": "#ff304d",
          "line-width": 16,
          "line-opacity": 0.34,
          "line-blur": 5,
        },
      });
      m.addLayer({
        id: "struggle-line",
        type: "line",
        source: "struggle-highlight",
        layout: { visibility: "none" },
        paint: { "line-color": "#ff304d", "line-width": 8, "line-opacity": 1 },
      });
      m.addSource("recorded-waypoints", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: waypoints.map((w) => ({
            type: "Feature",
            properties: { name: w.name, elevation: Math.round(w.ele) },
            geometry: { type: "Point", coordinates: [w.lon, w.lat] },
          })),
        },
      });
      m.addLayer({
        id: "waypoints",
        type: "circle",
        source: "recorded-waypoints",
        paint: {
          "circle-radius": 4,
          "circle-color": "#e9f3ee",
          "circle-stroke-color": "#0b1713",
          "circle-stroke-width": 2,
        },
      });
      m.on("click", "waypoints", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const coords = (f.geometry as { coordinates: number[] }).coordinates;
        new mapboxgl.Popup({ offset: 8, closeButton: false })
          .setLngLat([coords[0], coords[1]])
          .setHTML(
            `<strong>${f.properties?.name}</strong><small>${f.properties?.elevation} m · recorded waypoint</small>`,
          )
          .addTo(m);
      });
      m.on(
        "mouseenter",
        "waypoints",
        () => (m.getCanvas().style.cursor = "pointer"),
      );
      m.on("mouseleave", "waypoints", () => (m.getCanvas().style.cursor = ""));
      m.on("click", "trail-effort", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties || {};
        const level =
          p.effort >= 88
            ? "Severe"
            : p.effort >= 70
              ? "Demanding"
              : p.effort >= 48
                ? "Moderate"
                : "Comfortable";
        const direction =
          p.grade > 1
            ? "Ascending"
            : p.grade < -1
              ? "Descending"
              : "Rolling / level";
        const signedGrade = `${p.grade > 0 ? "+" : ""}${p.grade}%`;
        const weatherDetails =
          p.apparent == null
            ? ""
            : `<div class="segment-weather"><span><b>${p.apparent}°C</b>feels like</span><span><b>${p.wind} km/h</b>wind</span><span><b>${p.rain}%</b>rain</span></div>`;
        new mapboxgl.Popup({
          offset: 10,
          closeButton: false,
          className: "fatigue-popup",
        })
          .setLngLat(e.lngLat)
          .setHTML(
            `<p>SEGMENT ANALYSIS · ${direction}</p><strong>${p.effort}/100 <em>${level}</em></strong><small>km ${p.startKm}–${p.endKm} · +${p.gain} m · ${signedGrade} average net grade</small><div class="segment-timing"><span><b>${p.speedKmh ?? "—"} km/h</b>predicted speed</span><span><b>${p.arrival ?? "—"}</b>arrival</span><span><b>${p.slowdown ?? 0}%</b>slowdown</span></div>${weatherDetails}`,
          )
          .addTo(m);
      });
      m.on(
        "mouseenter",
        "trail-effort",
        () => (m.getCanvas().style.cursor = "crosshair"),
      );
      m.on(
        "mouseleave",
        "trail-effort",
        () => (m.getCanvas().style.cursor = ""),
      );
    });
    return () => {
      resizeObserver.disconnect();
      struggleMarker.current?.remove();
      m.remove();
      map.current = null;
    };
  }, [points, waypoints]);

  useEffect(() => {
    const source = map.current?.getSource("trail") as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (source && segments.length)
      source.setData(
        segmentGeoJSON(points, paceSimulation?.timed || segments, environment),
      );
    const weatherSource = map.current?.getSource("weather-samples") as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (weatherSource && environment) {
      const sampleCount = Math.min(7, environment.enriched.length);
      const sampleIndexes = Array.from({ length: sampleCount }, (_, i) =>
        Math.round(
          (i * (environment.enriched.length - 1)) /
            Math.max(1, sampleCount - 1),
        ),
      );
      weatherSource.setData({
        type: "FeatureCollection",
        features: sampleIndexes.map((i) => ({
          type: "Feature",
          properties: {
            temperature: Math.round(environment.enriched[i].apparent),
          },
          geometry: {
            type: "Point",
            coordinates: [
              environment.enriched[i].segment.center.lon,
              environment.enriched[i].segment.center.lat,
            ],
          },
        })),
      });
    }
  }, [segments, points, paceSimulation, environment]);

  useEffect(() => {
    const m = map.current;
    if (!m?.getLayer("trail-effort")) return;
    const fatigueColors: mapboxgl.Expression = [
      "interpolate",
      ["linear"],
      ["get", "effort"],
      20,
      "#78f29f",
      48,
      "#dff16b",
      70,
      "#ff9a57",
      88,
      "#ff5367",
    ];
    const weatherColors: mapboxgl.Expression = [
      "interpolate",
      ["linear"],
      ["get", "weatherRisk"],
      0,
      "#66d9ff",
      30,
      "#dff16b",
      55,
      "#ff9a57",
      80,
      "#ff5367",
    ];
    const daylightColors: mapboxgl.Expression = [
      "match",
      ["get", "daylightState"],
      0,
      "#78f29f",
      1,
      "#ff9a57",
      2,
      "#6f63ff",
      "#78f29f",
    ];
    m.setPaintProperty(
      "trail-effort",
      "line-color",
      mapMode === "fatigue"
        ? fatigueColors
        : mapMode === "weather"
          ? weatherColors
          : daylightColors,
    );
    const visibility = mapMode === "weather" ? "visible" : "none";
    m.setLayoutProperty("weather-sample-dots", "visibility", visibility);
    m.setLayoutProperty("weather-sample-labels", "visibility", visibility);
  }, [mapMode, environment]);

  useEffect(() => {
    if (!map.current || !struggleSegment) return;
    const source = map.current.getSource("struggle-highlight") as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (!source) return;
    source.setData({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: points
          .slice(struggleSegment.start, struggleSegment.end + 1)
          .map((p) => [p.lon, p.lat]),
      },
    });
    map.current.setLayoutProperty(
      "struggle-glow",
      "visibility",
      showStruggle ? "visible" : "none",
    );
    map.current.setLayoutProperty(
      "struggle-line",
      "visibility",
      showStruggle ? "visible" : "none",
    );
    struggleMarker.current?.remove();
    if (!showStruggle) return;
    const p = struggleSegment.center;
    const marker = document.createElement("div");
    marker.className = "struggle-marker";
    marker.innerHTML = `<i></i><b>MOST FATIGUING SEGMENT</b><span>${struggleSegment.score}/100 · km ${(p.distance / 1000).toFixed(1)}</span>`;
    struggleMarker.current = new mapboxgl.Marker({
      element: marker,
      anchor: "bottom",
    })
      .setLngLat([p.lon, p.lat])
      .addTo(map.current);
    map.current.flyTo({
      center: [p.lon, p.lat],
      zoom: 14.5,
      pitch: 42,
      bearing: 0,
      duration: 1500,
    });
  }, [showStruggle, struggleSegment, points]);

  const data = useMemo(() => {
    if (!points.length) return null;
    let gain = 0,
      loss = 0;
    for (let i = 1; i < points.length; i++) {
      const d = points[i].ele - points[i - 1].ele;
      if (d > 0) gain += d;
      else loss -= d;
    }
    const start = points[0],
      end = points.at(-1)!;
    const recordedHours =
      start.time && end.time
        ? (new Date(end.time).getTime() - new Date(start.time).getTime()) / 36e5
        : 0;
    const predicted =
      points.at(-1)!.distance / 1000 / profile.paceKmh +
      gain / 600 +
      0.75 +
      profile.packKg * 0.025;
    return {
      distance: end.distance / 1000,
      gain,
      loss,
      min: Math.min(...points.map((p) => p.ele)),
      max: Math.max(...points.map((p) => p.ele)),
      recordedHours,
      predicted,
    };
  }, [points, profile]);

  const elevationPath = useMemo(() => {
    if (!data) return "";
    return points
      .filter((_, i) => i % Math.max(1, Math.floor(points.length / 300)) === 0)
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${((p.distance / points.at(-1)!.distance) * 100).toFixed(2)},${(92 - ((p.ele - data.min) / (data.max - data.min)) * 75).toFixed(2)}`,
      )
      .join(" ");
  }, [points, data]);

  const readiness = useMemo(() => {
    if (!data || !segments.length) return 0;
    const distanceRatio = data.distance / Math.max(1, profile.distanceKm);
    const ascentRatio = data.gain / Math.max(100, profile.ascentM);
    const averageFatigue =
      segments.reduce((sum, s) => sum + s.score, 0) / segments.length;
    const distanceStrength = (profile.distanceKm - 6) / (35 - 6);
    const ascentStrength = (profile.ascentM - 200) / (2200 - 200);
    const paceStrength = (profile.paceKmh - 2.5) / (6.5 - 2.5);
    const overallStrength = Math.max(
      0,
      Math.min(1, (distanceStrength + ascentStrength + paceStrength) / 3),
    );
    const distancePenalty =
      Math.max(0, distanceRatio - 0.55) *
      29 *
      Math.pow(1 - distanceStrength, 1.35);
    const ascentPenalty =
      Math.max(0, ascentRatio - 0.55) * 31 * Math.pow(1 - ascentStrength, 1.35);
    const fatiguePenalty = averageFatigue * 0.19 * (1 - overallStrength);
    const packPenalty = profile.packKg * 0.65;
    const pacePenalty = Math.max(0, 4.6 - profile.paceKmh) * 4;
    const latePenalty = Math.max(0, departure - 8) * 5;
    const weatherPenalty = environment
      ? Math.max(0, environment.hottest.apparent - 27) * 1.2 +
        Math.max(0, environment.windiest.wind - 25) * 0.35 +
        Math.max(0, environment.wettest.rain - 35) * 0.12 +
        Math.max(0, -environment.daylightBuffer) * 12
      : 0;
    return Math.max(
      5,
      Math.min(
        100,
        Math.round(
          100 -
            distancePenalty -
            ascentPenalty -
            fatiguePenalty -
            packPenalty -
            pacePenalty -
            latePenalty -
            weatherPenalty,
        ),
      ),
    );
  }, [data, segments, profile, departure, environment]);
  const struggleKm = struggleSegment
    ? struggleSegment.center.distance / 1000
    : 0;

  function selectTrail(id: string) {
    setPoints([]);
    setWaypoints([]);
    setShowStruggle(false);
    setBriefing(null);
    setManualTrailId(id);
  }

  async function generateBriefing() {
    if (!data || !paceSimulation || !struggleSegment) return;
    setBriefingStatus("loading");
    setBriefingError("");
    const evidence = {
      trail: {
        name: selectedTrail.name,
        distanceKm: +data.distance.toFixed(1),
        ascentM: Math.round(data.gain),
        highPointM: Math.round(data.max),
      },
      hiker: profile,
      readiness: { score: readiness, scale: 100 },
      timing: {
        departure: clock(departure),
        movingTime: formatDuration(paceSimulation.movingHours),
        restAllowance: formatDuration(paceSimulation.restHours),
        finishRange: `${clock(departure + paceSimulation.lowHours)}-${clock(departure + paceSimulation.highHours)}`,
        highPointArrival: clock(paceSimulation.highPointSegment.arrivalHours),
        firstSlowdownKm: +(
          paceSimulation.firstSlowdown.center.distance / 1000
        ).toFixed(1),
        turnaroundReview: clock(paceSimulation.turnaroundReviewHours),
      },
      hardestSegment: {
        kilometer: +struggleKm.toFixed(1),
        fatigueScore: struggleSegment.score,
        direction:
          struggleSegment.grade > 1
            ? "ascending"
            : struggleSegment.grade < -1
              ? "descending"
              : "rolling",
        netGradePercent: +struggleSegment.grade.toFixed(1),
        ascentM: Math.round(struggleSegment.gain),
      },
      conditions: environment
        ? {
            hikeDate,
            sunset: environment.sunset,
            daylightBufferHours: +environment.daylightBuffer.toFixed(2),
            peakFeelsLikeC: Math.round(environment.hottest.apparent),
            maxWindKmh: Math.round(environment.windiest.wind),
            maxRainProbability: Math.round(environment.wettest.rain),
            warnings: environment.warnings,
          }
        : { hikeDate, forecastAvailable: false },
      limitations: [
        "GPX geometry and elevation may contain recording error",
        "Weather is forecast, not an observation",
        "Fatigue and timing are modeled estimates",
      ],
    };
    try {
      const response = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidence }),
      });
      const result = (await response.json()) as {
        configured?: boolean;
        error?: string;
        briefing?: Briefing;
      };
      if (!response.ok)
        throw new Error(
          result.configured === false
            ? "AI briefing is not configured on this deployment. Add the hosted OpenAI API key to enable it; route analysis remains available."
            : result.error,
        );
      if (!result.briefing)
        throw new Error("The briefing response was incomplete.");
      setBriefing(result.briefing);
      setBriefingStatus("idle");
    } catch (error) {
      setBriefingStatus("error");
      setBriefingError(
        error instanceof Error ? error.message : "Briefing unavailable.",
      );
    }
  }

  return (
    <main>
      <header>
        <a className="brand" href="#">
          <span className="mark">TS</span>
          <span>TRAIL-INTEL</span>
          <small>TRAIL INTELLIGENCE</small>
        </a>
        <nav>
          <span className="live">
            <i /> LIVE ANALYSIS
          </span>
          <Link className="daily-link demo-link" href="/demo">
            Try Hackathon Demo
          </Link>
          <Link
            className="daily-link"
            href={`/live?trail=${selectedTrailId}${searchParams.get("demo") === "1" ? "&demo=1" : ""}`}
          >
            Live hike
          </Link>
          <Link className="daily-link" href="/recommendations">
            Daily picks
          </Link>
          <label className="trail-picker">
            <span>TRAIL</span>
            <select
              aria-label="Select trail"
              value={selectedTrailId}
              onChange={(e) => selectTrail(e.target.value)}
            >
              {TRAILS.map((trail) => (
                <option value={trail.id} key={trail.id}>
                  {trail.name}
                </option>
              ))}
            </select>
          </label>
          <span className="avatar">GR</span>
        </nav>
      </header>
      {searchParams.get("demo") === "1" && (
        <section className="analytics-demo-guide">
          <b>HACKATHON DEMO · STEP 2 OF 3</b>
          <span>Review the route evidence, then continue into Live Hike Mode.</span>
          <Link href={`/live?trail=${selectedTrailId}&demo=1`}>Continue to Live Hike →</Link>
          <Link href="/demo">Reset Demo</Link>
        </section>
      )}
      <section className="trailbar">
        <div>
          <p className="eyebrow">
            {(selectedTrail.country || "Lebanon").toUpperCase()} · {selectedTrail.region.toUpperCase()}
          </p>
          <h1>{selectedTrail.name}</h1>
          <p className="route-name">{selectedTrail.detail}</p>
        </div>
        <div className="trail-score">
          <span>ADVANCED PROFILE</span>
          <strong>
            {readiness}
            <small>/100</small>
          </strong>
          <em>PERSONAL READINESS</em>
        </div>
      </section>

      <section className="workspace">
        <aside className="metrics">
          <p className="section-label">ROUTE SIGNAL</p>
          <div className="metric-grid">
            <article>
              <span>DISTANCE</span>
              <strong>
                {data ? data.distance.toFixed(1) : "—"}
                <small> km</small>
              </strong>
            </article>
            <article>
              <span>ASCENT</span>
              <strong>
                {data ? Math.round(data.gain) : "—"}
                <small> m</small>
              </strong>
            </article>
            <article>
              <span>HIGH POINT</span>
              <strong>
                {data ? Math.round(data.max) : "—"}
                <small> m</small>
              </strong>
            </article>
            <article>
              <span>PREDICTED</span>
              <strong>
                {paceSimulation
                  ? formatDuration(paceSimulation.totalHours)
                  : "—"}
              </strong>
            </article>
          </div>
          <div className="dna">
            <div className="dna-head">
              <span>TRAIL DNA</span>
              <b>ADVANCED</b>
            </div>
            {[
              ["Endurance", 88],
              ["Climbing", 83],
              ["Technicality", 68],
              ["Exposure", 72],
              ["Remoteness", 61],
            ].map(([n, v]) => (
              <div className="bar" key={n}>
                <span>{n}</span>
                <i>
                  <b style={{ width: `${v}%` }} />
                </i>
                <em>{v}</em>
              </div>
            ))}
          </div>
          <div className="profile">
            <p className="section-label">HIKER MODEL</p>
            <div>
              <span className="profile-icon">A</span>
              <p>
                <strong>Advanced hiker</strong>
                <small>
                  {profile.distanceKm} km · {profile.ascentM} m ascent
                </small>
              </p>
              <button onClick={() => setEditingProfile(true)}>Adjust</button>
            </div>
          </div>
        </aside>

        <div className="map-panel">
          <div
            ref={mapContainer}
            className="mapbox-canvas"
            aria-label={`Interactive 3D terrain map of ${selectedTrail.name}`}
          />
          <div className="map-modes" aria-label="Map analysis mode">
            <button
              className={mapMode === "fatigue" ? "active" : ""}
              onClick={() => setMapMode("fatigue")}
            >
              Fatigue
            </button>
            <button
              className={mapMode === "weather" ? "active" : ""}
              onClick={() => setMapMode("weather")}
            >
              Weather
            </button>
            <button
              className={mapMode === "daylight" ? "active" : ""}
              onClick={() => setMapMode("daylight")}
            >
              Daylight
            </button>
          </div>
          <div className={`legend ${mapMode}`}>
            {mapMode === "fatigue" ? (
              <>
                <span>
                  <i className="easy" /> 18–47
                </span>
                <span>
                  <i className="medium" /> 48–69
                </span>
                <span>
                  <i className="hard" /> 70–87
                </span>
                <span>
                  <i className="severe" /> 88–100
                </span>
                <b>FATIGUE SCORE</b>
              </>
            ) : mapMode === "weather" ? (
              <>
                <span>
                  <i className="cool" /> Mild
                </span>
                <span>
                  <i className="medium" /> Watch
                </span>
                <span>
                  <i className="hard" /> Stress
                </span>
                <span>
                  <i className="severe" /> Severe
                </span>
                <b>7 FORECAST SAMPLES</b>
              </>
            ) : (
              <>
                <span>
                  <i className="easy" /> Daylight
                </span>
                <span>
                  <i className="hard" /> Final hour
                </span>
                <span>
                  <i className="dark" /> After sunset
                </span>
                <b>ARRIVAL TIMELINE</b>
              </>
            )}
          </div>
          <div className={`insight ${showStruggle ? "open" : ""}`}>
            <p>LIKELY STRUGGLE POINT · KM {struggleKm.toFixed(1)}</p>
            <strong>
              {struggleSegment?.score ?? 0}/100 ·{" "}
              {struggleSegment
                ? struggleSegment.grade > 1
                  ? "ascending"
                  : struggleSegment.grade < -1
                    ? "descending"
                    : "rolling"
                : "calculating"}
            </strong>
            <span>
              {struggleSegment
                ? `${Math.round(struggleSegment.gain)} m accumulated climbing in this segment at ${struggleSegment.grade > 0 ? "+" : ""}${struggleSegment.grade.toFixed(1)}% average net grade, after previous route effort. The same score colors this segment red.`
                : "Calculating route effort…"}
            </span>
          </div>
          <button
            className="struggle"
            onClick={() => setShowStruggle((v) => !v)}
          >
            <span>⌁</span>
            {showStruggle ? "Hide struggle point" : "Where will I struggle?"}
          </button>
        </div>

        <aside className="simulation" ref={simulationPanel}>
          <p className="section-label">TIME SIMULATION</p>
          <div className="time">
            <strong>{String(departure).padStart(2, "0")}:00</strong>
            <span>DEPARTURE</span>
          </div>
          <input
            aria-label="Departure time"
            type="range"
            min="5"
            max="14"
            value={departure}
            onChange={(e) => setDeparture(+e.target.value)}
          />
          <div className="ticks">
            <span>05:00</span>
            <span>10:00</span>
            <span>14:00</span>
          </div>
          <label className="hike-date">
            <span>HIKE DATE</span>
            <input
              type="date"
              min={forecastRange?.min}
              max={forecastRange?.max}
              value={hikeDate}
              onChange={(e) => setHikeDate(e.target.value)}
            />
          </label>
          <div className="timing">
            <div>
              <span>FINISH RANGE</span>
              <strong>
                {paceSimulation
                  ? `${clock(departure + paceSimulation.lowHours)}–${clock(departure + paceSimulation.highHours)}`
                  : "—"}
              </strong>
            </div>
            <div>
              <span>TURNAROUND REVIEW</span>
              <strong className="good">
                {paceSimulation
                  ? clock(paceSimulation.turnaroundReviewHours)
                  : "—"}
              </strong>
            </div>
          </div>
          <div className="pace-details">
            <div>
              <span>MOVING</span>
              <strong>
                {paceSimulation
                  ? formatDuration(paceSimulation.movingHours)
                  : "—"}
              </strong>
            </div>
            <div>
              <span>REST ALLOWANCE</span>
              <strong>
                {paceSimulation
                  ? formatDuration(paceSimulation.restHours)
                  : "—"}
              </strong>
            </div>
            <div>
              <span>HIGH POINT ETA</span>
              <strong>
                {paceSimulation
                  ? clock(paceSimulation.highPointSegment.arrivalHours)
                  : "—"}
              </strong>
            </div>
            <div>
              <span>FIRST SLOWDOWN</span>
              <strong>
                {paceSimulation
                  ? `km ${(paceSimulation.firstSlowdown.center.distance / 1000).toFixed(1)}`
                  : "—"}
              </strong>
            </div>
          </div>
          <div className="environment">
            <p className="section-label">
              ROUTE WEATHER ·{" "}
              {weatherStatus === "loading"
                ? "UPDATING"
                : weatherStatus === "error"
                  ? "UNAVAILABLE"
                  : !dateInForecast
                    ? "OUTSIDE 16-DAY FORECAST"
                    : "LIVE FORECAST"}
            </p>
            <div className="environment-grid">
              <div>
                <span>PEAK FEELS LIKE</span>
                <strong>
                  {environment
                    ? `${Math.round(environment.hottest.apparent)}°C`
                    : "—"}
                </strong>
              </div>
              <div>
                <span>MAX WIND</span>
                <strong>
                  {environment
                    ? `${Math.round(environment.windiest.wind)} km/h`
                    : "—"}
                </strong>
              </div>
              <div>
                <span>RAIN RISK</span>
                <strong>
                  {environment
                    ? `${Math.round(environment.wettest.rain)}%`
                    : "—"}
                </strong>
              </div>
              <div>
                <span>DAYLIGHT BUFFER</span>
                <strong
                  className={
                    environment && environment.daylightBuffer < 0
                      ? "danger"
                      : "good"
                  }
                >
                  {environment
                    ? `${environment.daylightBuffer < 0 ? "−" : ""}${formatDuration(Math.abs(environment.daylightBuffer))}`
                    : "—"}
                </strong>
              </div>
            </div>
            {environment?.warnings.length ? (
              <ul>
                {environment.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : environment ? (
              <p className="weather-clear">
                No major modeled weather threshold crossed.
              </p>
            ) : forecastRange ? (
              <p className="forecast-unavailable">
                Choose a date from {forecastRange.min} through{" "}
                {forecastRange.max}. Longer-range August conditions require
                climate data, not a live forecast.
              </p>
            ) : null}
          </div>
          <div className="evidence">
            <p className="section-label">RECORDED EVIDENCE</p>
            {waypoints.slice(12, 17).map((w, i) => (
              <div key={i}>
                <i>{i === 0 ? "▲" : i === 3 ? "!" : "•"}</i>
                <span>
                  {w.name}
                  <small>{Math.round(w.ele)} m</small>
                </span>
              </div>
            ))}
          </div>
        </aside>
      </section>
      {editingProfile && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setEditingProfile(false)}
        >
          <section
            className="profile-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="section-label">PERSONAL SIMULATION</p>
                <h2>Adjust hiker model</h2>
              </div>
              <button
                aria-label="Close"
                onClick={() => setEditingProfile(false)}
              >
                ×
              </button>
            </div>
            <p className="modal-copy">
              These values immediately recalculate every segment’s effort,
              fatigue color, and likely struggle point.
            </p>
            <label>
              <span>
                Typical hiking distance <b>{profile.distanceKm} km</b>
              </span>
              <input
                type="range"
                min="6"
                max="35"
                value={profile.distanceKm}
                onChange={(e) =>
                  setProfile({ ...profile, distanceKm: +e.target.value })
                }
              />
            </label>
            <label>
              <span>
                Typical elevation gain <b>{profile.ascentM} m</b>
              </span>
              <input
                type="range"
                min="200"
                max="2200"
                step="50"
                value={profile.ascentM}
                onChange={(e) =>
                  setProfile({ ...profile, ascentM: +e.target.value })
                }
              />
            </label>
            <label>
              <span>
                Flat walking speed <b>{profile.paceKmh.toFixed(1)} km/h</b>
              </span>
              <input
                type="range"
                min="2.5"
                max="6.5"
                step=".1"
                value={profile.paceKmh}
                onChange={(e) =>
                  setProfile({ ...profile, paceKmh: +e.target.value })
                }
              />
            </label>
            <label>
              <span>
                Backpack weight <b>{profile.packKg} kg</b>
              </span>
              <input
                type="range"
                min="0"
                max="20"
                value={profile.packKg}
                onChange={(e) =>
                  setProfile({ ...profile, packKg: +e.target.value })
                }
              />
            </label>
            <button
              className="apply-profile"
              onClick={() => setEditingProfile(false)}
            >
              Apply advanced profile
            </button>
          </section>
        </div>
      )}

      <section className="briefing" aria-labelledby="briefing-title">
        <div className="briefing-head">
          <div>
            <p className="section-label">MILESTONE 5 · AI INTERPRETATION</p>
            <h2 id="briefing-title">Evidence-based trail briefing</h2>
            <p className="briefing-copy">
              Turns the current hiker profile, segment fatigue, timing, weather,
              and daylight calculations into a concise briefing. Measured values
              remain authoritative.
            </p>
          </div>
          <button
            onClick={generateBriefing}
            disabled={briefingStatus === "loading" || !data}
          >
            {briefingStatus === "loading"
              ? "Generating…"
              : briefing
                ? "Refresh briefing"
                : "Generate briefing"}
          </button>
        </div>
        {briefingError && <p className="briefing-error">{briefingError}</p>}
        {briefing && (
          <div className="briefing-result">
            <h2>{briefing.headline}</h2>
            <p>{briefing.summary}</p>
            <div className="briefing-findings">
              {briefing.keyFindings.map((finding, i) => (
                <article
                  className={finding.priority}
                  key={`${finding.title}-${i}`}
                >
                  <span>{finding.priority.toUpperCase()} PRIORITY</span>
                  <h3>{finding.title}</h3>
                  <p>{finding.evidence}</p>
                </article>
              ))}
            </div>
            <p className="briefing-guidance">
              <strong>Turnaround guidance: </strong>
              {briefing.turnaroundGuidance}
            </p>
            {briefing.uncertainties.length > 0 && (
              <p className="briefing-note">
                <strong>Verify before departure: </strong>
                {briefing.uncertainties.join(" · ")}
              </p>
            )}
            <small className="briefing-disclaimer">{briefing.disclaimer}</small>
          </div>
        )}
      </section>
      <section className="elevation">
        <div className="elevation-title">
          <span>ELEVATION & EFFORT</span>
          <p>
            <i /> Recorded altitude <b /> Predicted effort
          </p>
        </div>
        <div className="chart">
          <span className="axis top">{data ? Math.round(data.max) : ""} m</span>
          <span className="axis bottom">
            {data ? Math.round(data.min) : ""} m
          </span>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#75f5a3" stopOpacity=".35" />
                <stop offset="1" stopColor="#75f5a3" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="area" d={`${elevationPath} L100,100 L0,100Z`} />
            <path className="eline" d={elevationPath} />
          </svg>
        </div>
        <div className="chart-labels">
          <span>0 km</span>
          <span>{data ? (data.distance * 0.25).toFixed(1) : ""} km</span>
          <span>{data ? (data.distance * 0.5).toFixed(1) : ""} km</span>
          <span>{data ? (data.distance * 0.75).toFixed(1) : ""} km</span>
          <span>{data ? data.distance.toFixed(1) : ""} km</span>
        </div>
      </section>
      <footer>
        <span>
          Analysis uses recorded GPX geometry and an interpretable hiking model.
          Estimates are not a declaration of safety.
        </span>
        {"source" in selectedTrail ? (
          <a href={selectedTrail.source} target="_blank">
            Recorded by Rami Rachkidi · View source ↗
          </a>
        ) : (
          <span>Recorded by Rami Rachkidi · Used with permission</span>
        )}
      </footer>
    </main>
  );
}
