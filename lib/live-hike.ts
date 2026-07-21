export type LiveState =
  | "CREATED"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";
export type RoutePoint = {
  lat: number;
  lon: number;
  ele: number;
  distance: number;
};
export type LocationReading = {
  session_id: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  accuracy_m: number;
  altitude_m: number | null;
  speed_mps: number | null;
  heading_degrees: number | null;
};
export type FilteredReading = LocationReading & {
  accepted: boolean;
  reason?: string;
  filtered_latitude: number;
  filtered_longitude: number;
  route_distance_m: number;
  progress_m: number;
};
export type LiveWarningType =
  | "OFF_ROUTE"
  | "PACE_BEHIND_PLAN"
  | "DAYLIGHT_MARGIN_LOW"
  | "WEATHER_WINDOW_CHANGED"
  | "DIFFICULT_SEGMENT_AHEAD"
  | "WATER_GAP_AHEAD"
  | "TURNAROUND_RECOMMENDED"
  | "EXIT_ROUTE_AVAILABLE"
  | "GPS_ACCURACY_LOW"
  | "DATA_UNAVAILABLE";
export type LiveWarning = {
  type: LiveWarningType;
  severity: "low" | "medium" | "high";
  title: string;
  message: string;
  evidence: Record<string, number | string | null>;
  timestamp: string;
  confidence: number;
  recommended_action: string;
  affected_trail_segment: number | null;
  acknowledgement_required: boolean;
};
export type LiveSession = {
  id: string;
  trailId: string;
  state: LiveState;
  createdAt: string;
  startedAt: string | null;
  pausedAt: string | null;
  finishedAt: string | null;
  route: RoutePoint[];
  rawReadings: LocationReading[];
  filteredReadings: FilteredReading[];
  predictedHours: number;
  sunsetHour: number;
  weather: {
    apparent: number;
    rain: number;
    wind: number;
    source: "seeded-demo" | "live" | "unavailable";
    updatedAt?: string;
  };
  offRouteSince: string | null;
  warnings: LiveWarning[];
  summary: LiveSnapshot | null;
};
export type LiveSnapshot = {
  state: LiveState;
  progressM: number;
  distanceCompletedKm: number;
  distanceRemainingKm: number;
  progressPct: number;
  currentPaceKmh: number;
  predictedPaceKmh: number;
  elapsedMinutes: number;
  movingMinutes: number;
  stoppedMinutes: number;
  estimatedFinish: string;
  daylightBufferMinutes: number;
  routeDistanceM: number;
  offRouteStatus: "ON_ROUTE" | "POTENTIALLY_OFF_ROUTE" | "CONFIRMED_OFF_ROUTE";
  offRouteDurationSeconds: number;
  gpsAccuracyM: number | null;
  nextDifficultSegment: string;
  nextWaypoint: string;
  distanceToWaypointM: number | null;
  fatigueScore?: number;
  weatherSuitability?: number;
  recommendation?: string;
  primaryWarning: LiveWarning | null;
  lastPosition: { latitude: number; longitude: number } | null;
  recalculatedAt: string;
};
export const LIVE_ANALYSIS_VERSION = "live-v1";
const R = 6371000;
export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const p1 = (a.latitude * Math.PI) / 180,
    p2 = (b.latitude * Math.PI) / 180,
    dp = ((b.latitude - a.latitude) * Math.PI) / 180,
    dl = ((b.longitude - a.longitude) * Math.PI) / 180,
    q =
      Math.sin(dp / 2) ** 2 +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}
function clock(date: Date) {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Beirut",
  });
}
function project(
  reading: LocationReading,
  route: RoutePoint[],
  previousProgress = 0,
) {
  let best = {
    distance: Infinity,
    progress: previousProgress,
    lat: route[0]?.lat || reading.latitude,
    lon: route[0]?.lon || reading.longitude,
    index: 0,
  };
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      scale = Math.cos((reading.latitude * Math.PI) / 180),
      px = reading.longitude * scale,
      py = reading.latitude,
      ax = a.lon * scale,
      ay = a.lat,
      bx = b.lon * scale,
      by = b.lat,
      dx = bx - ax,
      dy = by - ay,
      t = Math.max(
        0,
        Math.min(
          1,
          ((px - ax) * dx + (py - ay) * dy) /
            Math.max(1e-16, dx * dx + dy * dy),
        ),
      ),
      lat = ay + (by - ay) * t,
      lon = (ax + (bx - ax) * t) / scale,
      d = haversineMeters(reading, { latitude: lat, longitude: lon }),
      progress = a.distance + (b.distance - a.distance) * t;
    const backwardPenalty =
      progress < previousProgress - 50 ? (previousProgress - progress) * 2 : 0;
    if (d + backwardPenalty < best.distance) {
      best = {
        distance: d + backwardPenalty,
        progress,
        lat,
        lon,
        index: i - 1,
      };
    }
  }
  return {
    ...best,
    distance: haversineMeters(reading, {
      latitude: best.lat,
      longitude: best.lon,
    }),
    progress: Math.max(previousProgress - 20, best.progress),
  };
}
export function filterReading(
  reading: LocationReading,
  previous: FilteredReading | null,
  route: RoutePoint[],
): FilteredReading {
  if (
    !Number.isFinite(reading.latitude) ||
    !Number.isFinite(reading.longitude) ||
    reading.accuracy_m <= 0
  )
    return {
      ...reading,
      accepted: false,
      reason: "INVALID_READING",
      filtered_latitude: reading.latitude,
      filtered_longitude: reading.longitude,
      route_distance_m: Infinity,
      progress_m: previous?.progress_m || 0,
    };
  if (reading.accuracy_m > 120)
    return {
      ...reading,
      accepted: false,
      reason: "GPS_ACCURACY_LOW",
      filtered_latitude: reading.latitude,
      filtered_longitude: reading.longitude,
      route_distance_m: Infinity,
      progress_m: previous?.progress_m || 0,
    };
  if (previous) {
    const seconds =
        (new Date(reading.timestamp).getTime() -
          new Date(previous.timestamp).getTime()) /
        1000,
      d = haversineMeters(
        {
          latitude: previous.filtered_latitude,
          longitude: previous.filtered_longitude,
        },
        reading,
      );
    if (seconds > 0 && d / seconds > 12)
      return {
        ...reading,
        accepted: false,
        reason: "IMPOSSIBLE_JUMP",
        filtered_latitude: reading.latitude,
        filtered_longitude: reading.longitude,
        route_distance_m: Infinity,
        progress_m: previous.progress_m,
      };
  }
  const alpha = Math.max(
      0.2,
      Math.min(0.75, 30 / Math.max(10, reading.accuracy_m)),
    ),
    lat = previous
      ? previous.filtered_latitude +
        (reading.latitude - previous.filtered_latitude) * alpha
      : reading.latitude,
    lon = previous
      ? previous.filtered_longitude +
        (reading.longitude - previous.filtered_longitude) * alpha
      : reading.longitude,
    p = project(
      { ...reading, latitude: lat, longitude: lon },
      route,
      previous?.progress_m || 0,
    );
  return {
    ...reading,
    accepted: true,
    filtered_latitude: lat,
    filtered_longitude: lon,
    route_distance_m: p.distance,
    progress_m: Math.max(previous?.progress_m || 0, p.progress),
  };
}
function warning(
  type: LiveWarningType,
  severity: LiveWarning["severity"],
  message: string,
  evidence: LiveWarning["evidence"],
  timestamp: string,
  action: string,
  confidence = 0.85,
): LiveWarning {
  return {
    type,
    severity,
    title: type
      .split("_")
      .map((x) => x[0] + x.slice(1).toLowerCase())
      .join(" "),
    message,
    evidence,
    timestamp,
    confidence,
    recommended_action: action,
    affected_trail_segment: null,
    acknowledgement_required: severity === "high",
  };
}
function pace(readings: FilteredReading[]) {
  const recent = readings.filter((r) => r.accepted).slice(-12);
  if (recent.length < 2) return 0;
  const first = recent[0],
    last = recent.at(-1)!,
    hours =
      (new Date(last.timestamp).getTime() -
        new Date(first.timestamp).getTime()) /
      36e5;
  return hours > 0 ? (last.progress_m - first.progress_m) / 1000 / hours : 0;
}
function movingMinutes(readings: FilteredReading[]) {
  return readings.slice(1).reduce((minutes, reading, index) => {
    const previous = readings[index];
    if (reading.progress_m - previous.progress_m <= 2) return minutes;
    const interval =
      (new Date(reading.timestamp).getTime() -
        new Date(previous.timestamp).getTime()) /
      60000;
    return minutes + Math.max(0, Math.min(30, interval));
  }, 0);
}
export function snapshot(session: LiveSession, now = new Date()): LiveSnapshot {
  const valid = session.filteredReadings.filter((r) => r.accepted),
    last = valid.at(-1),
    total = session.route.at(-1)?.distance || 0,
    progress = Math.min(total, last?.progress_m || 0),
    currentPace = pace(valid),
    predictedPace = total / 1000 / session.predictedHours,
    started = session.startedAt ? new Date(session.startedAt) : now,
    elapsed = Math.max(0, (now.getTime() - started.getTime()) / 60000),
    moving = Math.min(elapsed, movingMinutes(valid)),
    remaining = Math.max(0, total - progress),
    calibrated = currentPace > 1 ? currentPace : predictedPace,
    remainingHours = remaining / 1000 / Math.max(1, calibrated),
    finish = new Date(now.getTime() + remainingHours * 36e5),
    finishHour =
      +new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Beirut",
      })
        .format(finish)
        .slice(0, 2) +
      +new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Beirut",
      })
        .format(finish)
        .slice(3) /
        60,
    buffer = Math.round((session.sunsetHour - finishHour) * 60),
    offDuration = session.offRouteSince
      ? (now.getTime() - new Date(session.offRouteSince).getTime()) / 1000
      : 0,
    threshold = Math.max(40, 2 * (last?.accuracy_m || 20)),
    off =
      last && last.route_distance_m > threshold
        ? offDuration >= 45
          ? "CONFIRMED_OFF_ROUTE"
          : "POTENTIALLY_OFF_ROUTE"
        : "ON_ROUTE";
  const warnings = [...session.warnings];
  if (last && last.accuracy_m > 60)
    warnings.push(
      warning(
        "GPS_ACCURACY_LOW",
        "medium",
        `GPS accuracy is approximately ${Math.round(last.accuracy_m)} m.`,
        { accuracy_m: last.accuracy_m },
        now.toISOString(),
        "Wait for a clearer GPS reading before acting on route position.",
        0.65,
      ),
    );
  if (off === "CONFIRMED_OFF_ROUTE" && last)
    warnings.push(
      warning(
        "OFF_ROUTE",
        "high",
        `Position has remained about ${Math.round(last.route_distance_m)} m from the route for ${Math.round(offDuration)} seconds.`,
        {
          distance_m: last.route_distance_m,
          duration_seconds: Math.round(offDuration),
        },
        now.toISOString(),
        "Stop and compare your position with the planned route before continuing.",
      ),
    );
  if (buffer < 45)
    warnings.push(
      warning(
        "DAYLIGHT_MARGIN_LOW",
        buffer < 20 ? "high" : "medium",
        `Current progress reduces the modeled daylight margin to ${buffer} minutes.`,
        { predicted_finish: clock(finish), buffer_minutes: buffer },
        now.toISOString(),
        "Review pace, stops, and the next mapped exit.",
      ),
    );
  if (currentPace > 0 && currentPace < predictedPace * 0.7)
    warnings.push(
      warning(
        "PACE_BEHIND_PLAN",
        "medium",
        `Rolling pace is ${currentPace.toFixed(1)} km/h versus ${predictedPace.toFixed(1)} km/h planned.`,
        {
          actual_kmh: +currentPace.toFixed(1),
          predicted_kmh: +predictedPace.toFixed(1),
        },
        now.toISOString(),
        "Reassess the remaining distance and planned stops.",
      ),
    );
  const primary =
    warnings.sort(
      (a, b) =>
        ({ high: 3, medium: 2, low: 1 })[b.severity] -
        { high: 3, medium: 2, low: 1 }[a.severity],
    )[0] || null;
  return {
    state: session.state,
    progressM: progress,
    distanceCompletedKm: +(progress / 1000).toFixed(2),
    distanceRemainingKm: +(remaining / 1000).toFixed(2),
    progressPct: total ? Math.round((progress / total) * 100) : 0,
    currentPaceKmh: +currentPace.toFixed(1),
    predictedPaceKmh: +predictedPace.toFixed(1),
    elapsedMinutes: Math.round(elapsed),
    movingMinutes: Math.round(moving),
    stoppedMinutes: Math.max(0, Math.round(elapsed - moving)),
    estimatedFinish: clock(finish),
    daylightBufferMinutes: buffer,
    routeDistanceM: last?.route_distance_m || 0,
    offRouteStatus: off,
    offRouteDurationSeconds: Math.round(offDuration),
    gpsAccuracyM: last?.accuracy_m || null,
    nextDifficultSegment: `Next higher-effort section near km ${Math.min(total / 1000, progress / 1000 + 1.5).toFixed(1)}`,
    nextWaypoint: "Route finish",
    distanceToWaypointM: Math.round(remaining),
    primaryWarning: primary,
    lastPosition: last
      ? { latitude: last.filtered_latitude, longitude: last.filtered_longitude }
      : null,
    recalculatedAt: now.toISOString(),
  };
}
export function processReading(session: LiveSession, reading: LocationReading) {
  session.rawReadings.push(reading);
  const filtered = filterReading(
    reading,
    session.filteredReadings.filter((r) => r.accepted).at(-1) || null,
    session.route,
  );
  session.filteredReadings.push(filtered);
  if (filtered.accepted) {
    const threshold = Math.max(40, 2 * filtered.accuracy_m);
    if (filtered.route_distance_m > threshold)
      session.offRouteSince ||= reading.timestamp;
    else session.offRouteSince = null;
  }
  session.summary = snapshot(session, new Date(reading.timestamp));
  const slowdown =
      session.summary.currentPaceKmh > 0
        ? Math.max(
            0,
            1 -
              session.summary.currentPaceKmh / session.summary.predictedPaceKmh,
          )
        : 0,
    apparent = session.weather.apparent + session.summary.progressPct * 0.035,
    fatigue = Math.min(
      100,
      Math.round(18 + session.summary.progressPct * 0.45 + slowdown * 70),
    ),
    weatherSuitability = Math.max(
      0,
      Math.round(
        100 -
          Math.max(0, apparent - 28) * 8 -
          session.weather.rain * 0.35 -
          Math.max(0, session.weather.wind - 25) * 1.2,
      ),
    );
  session.summary.fatigueScore = fatigue;
  session.summary.weatherSuitability = weatherSuitability;
  session.summary.recommendation =
    slowdown >= 0.2
      ? "Shorten the next stop and reassess the daylight margin before the higher-effort section."
      : "Maintain the current sustainable pace and continue monitoring conditions.";
  if (
    slowdown >= 0.2 &&
    session.summary.progressPct >= 20 &&
    !session.summary.primaryWarning
  )
    session.summary.primaryWarning = warning(
      "DIFFICULT_SEGMENT_AHEAD",
      "medium",
      `Pace is ${Math.round(slowdown * 100)}% below plan and the next higher-effort section is now less suitable.`,
      {
        slowdown_percent: Math.round(slowdown * 100),
        fatigue_score: fatigue,
        weather_suitability: weatherSuitability,
      },
      reading.timestamp,
      "Reduce optional stop time and reassess before entering the next difficult section.",
    );
  const primary = session.summary.primaryWarning;
  if (primary && session.warnings.at(-1)?.type !== primary.type)
    session.warnings.push(primary);
  if (
    session.summary.offRouteStatus !== "CONFIRMED_OFF_ROUTE" &&
    session.summary.primaryWarning?.type === "OFF_ROUTE"
  )
    session.summary.primaryWarning = null;
  return session.summary;
}
export const SIMULATION_SCENARIOS = {
  normal: {
    label: "Normal Progress",
    pace: 1,
    noiseM: 4,
    offRouteM: 0,
    rest: false,
  },
  slowdown: {
    label: "Slower Than Expected · 23%",
    pace: 0.77,
    noiseM: 7,
    offRouteM: 0,
    rest: true,
  },
  offroute: {
    label: "Off-Route Deviation",
    pace: 0.9,
    noiseM: 8,
    offRouteM: 90,
    rest: false,
  },
} as const;
