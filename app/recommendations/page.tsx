"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  DEFAULT_HIKER_PROFILE,
  DEMO_HIKER_PROFILE,
  TRAIL_CATALOG,
} from "../../lib/trail-catalog";
import type { DailyRequest, Recommendation } from "../../lib/recommendations";
import "./recommendations.css";

const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });
export default function DailyRecommendations() {
  const demo = useSearchParams().get("demo") === "1";
  const initialForm: DailyRequest = {
    date: demo ? "2026-07-25" : today(),
    preferred_departure_time: "07:00",
    starting_location: { latitude: 33.8938, longitude: 35.5018 },
    maximum_drive_minutes: 90,
    available_total_hours: 8,
    preferred_difficulty: ["moderate"],
    preferred_features: ["forest", "viewpoint"],
    avoid_features: ["high_exposure"],
    profile: demo ? DEMO_HIKER_PROFILE : DEFAULT_HIKER_PROFILE,
    demo_mode: demo,
  };
  const [form, setForm] = useState<DailyRequest>(initialForm),
    [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
      "idle",
    ),
    [groups, setGroups] = useState<Recommendation[]>([]),
    [partial, setPartial] = useState(false),
    [error, setError] = useState("");
  const toggle = (
    key: "preferred_features" | "avoid_features",
    value: string,
  ) =>
    setForm({
      ...form,
      [key]: form[key].includes(value)
        ? form[key].filter((x) => x !== value)
        : [...form[key], value],
    });
  async function recommend() {
    setStatus("loading");
    setError("");
    try {
      const r = await fetch("/api/recommendations/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await r.json()) as {
        groups?: Recommendation[];
        partialData?: boolean;
        error?: string;
      };
      if (!r.ok) throw new Error(data.error);
      setGroups(data.groups || []);
      setPartial(!!data.partialData);
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recommendations unavailable");
      setStatus("error");
    }
  }
  const resetDemo = () => {
    setForm(initialForm);
    setGroups([]);
    setPartial(false);
    setError("");
    setStatus("idle");
  };
  return (
    <main className="daily-page">
      <header className="daily-nav">
        <Link href="/" className="daily-brand">
          <b>TS</b>
          <span>
            TRAIL-INTEL<small>DAILY DECISION ENGINE</small>
          </span>
        </Link>
        <span>
          {demo && <button onClick={resetDemo}>Reset Demo</button>}{" "}
          <Link href="/">Full trail analysis →</Link>
        </span>
      </header>
      {demo && (
        <section className="demo-guide">
          <b>HACKATHON DEMO · STEP 1 OF 3</b>
          <span>
            Rank the seeded routes, open the strongest recommendation, then
            start its simulated live hike.
          </span>
        </section>
      )}
      <section className="daily-hero">
        <p>DETERMINISTIC DAILY RANKING</p>
        <h1>Where should you hike?</h1>
        <span>
          Compare every available Lebanon trail against your time, fitness,
          preferences, forecast, and daylight.
        </span>
      </section>
      <div className="daily-layout">
        <aside className="recommend-form">
          <h2>Plan the day</h2>
          <label>
            Date
            <input
              aria-label="Recommendation date"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </label>
          <label>
            Departure
            <input
              aria-label="Preferred departure"
              type="time"
              value={form.preferred_departure_time}
              onChange={(e) =>
                setForm({ ...form, preferred_departure_time: e.target.value })
              }
            />
          </label>
          <div className="two">
            <label>
              Max drive
              <input
                aria-label="Maximum drive minutes"
                type="number"
                min="15"
                max="240"
                value={form.maximum_drive_minutes}
                onChange={(e) =>
                  setForm({ ...form, maximum_drive_minutes: +e.target.value })
                }
              />
              <small>minutes</small>
            </label>
            <label>
              Total hike time
              <input
                aria-label="Available hiking hours"
                type="number"
                min="2"
                max="16"
                value={form.available_total_hours}
                onChange={(e) =>
                  setForm({ ...form, available_total_hours: +e.target.value })
                }
              />
              <small>hours</small>
            </label>
          </div>
          <label>
            Starting coordinates
            <div className="two">
              <input
                aria-label="Starting latitude"
                type="number"
                step=".0001"
                value={form.starting_location.latitude}
                onChange={(e) =>
                  setForm({
                    ...form,
                    starting_location: {
                      ...form.starting_location,
                      latitude: +e.target.value,
                    },
                  })
                }
              />
              <input
                aria-label="Starting longitude"
                type="number"
                step=".0001"
                value={form.starting_location.longitude}
                onChange={(e) =>
                  setForm({
                    ...form,
                    starting_location: {
                      ...form.starting_location,
                      longitude: +e.target.value,
                    },
                  })
                }
              />
            </div>
          </label>
          <label>
            Hiker profile
            <select aria-label="Hiker profile" disabled>
              <option>
                {demo
                  ? "Demo hiker · 11 km / 550 m"
                  : "Advanced · 18 km / 1,200 m"}
              </option>
            </select>
          </label>
          <fieldset>
            <legend>Preferred features</legend>
            {["forest", "viewpoint", "lake", "summit"].map((x) => (
              <label className="chip" key={x}>
                <input
                  type="checkbox"
                  checked={form.preferred_features.includes(x)}
                  onChange={() => toggle("preferred_features", x)}
                />
                {x}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Avoid</legend>
            {["high_exposure", "remote"].map((x) => (
              <label className="chip avoid" key={x}>
                <input
                  type="checkbox"
                  checked={form.avoid_features.includes(x)}
                  onChange={() => toggle("avoid_features", x)}
                />
                {x.replace("_", " ")}
              </label>
            ))}
          </fieldset>
          <button
            className="recommend-button"
            onClick={recommend}
            disabled={status === "loading"}
          >
            {status === "loading"
              ? `SIMULATING ${TRAIL_CATALOG.length} TRAILS…`
              : "RANK TODAY'S TRAILS"}
          </button>
        </aside>
        <section className="recommend-results" aria-live="polite">
          {partial && (
            <p className="partial">
              Live weather is temporarily unavailable. Scores use conservative
              seeded weather confidence.
            </p>
          )}
          {status === "idle" && (
            <div className="empty">
              <b>{TRAIL_CATALOG.length}</b>
              <h2>Lebanon trails ready to compare</h2>
              <p>
                Set your constraints, then rank the routes with the same
                evidence used in full trail analysis.
              </p>
            </div>
          )}
          {status === "loading" && (
            <div className="empty">
              <i />
              <h2>Simulating arrival, exposure and finish time…</h2>
            </div>
          )}
          {status === "error" && (
            <div className="empty error">
              <h2>Recommendations unavailable</h2>
              <p>{error}</p>
              <button onClick={recommend}>Try again</button>
            </div>
          )}
          {status === "ready" && !groups.length && (
            <div className="empty">
              <h2>No eligible trails</h2>
              <p>
                Increase the drive or hiking-time limit, or remove a hard
                exclusion.
              </p>
            </div>
          )}
          {groups.map((item) => (
            <article className="recommend-card" key={item.recommendationId}>
              <div className="card-map">
                <span>{item.group}</span>
                <i>{item.country.toUpperCase()} · {item.driveMinutes} MIN DRIVE</i>
              </div>
              <div className="card-main">
                <div className="score">
                  <strong>{item.overallScore}</strong>
                  <small>/100</small>
                </div>
                <p>{item.group?.toUpperCase()}</p>
                <h2>{item.name}</h2>
                <div className="card-stats">
                  <span>
                    <b>{item.hikeHours.toFixed(1)} h</b>hike
                  </span>
                  <span>
                    <b>{item.finishTime}</b>finish
                  </span>
                  <span>
                    <b>
                      {item.daylightBufferHours === null
                        ? "—"
                        : `${item.daylightBufferHours.toFixed(1)} h`}
                    </b>
                    daylight
                  </span>
                </div>
                <p className="weather-line">{item.weatherSummary}</p>
                <ul>
                  {item.positiveFactors.slice(0, 2).map((f) => (
                    <li key={f.code}>{f.message}</li>
                  ))}
                </ul>
                {item.concerns[0] && (
                  <p className="concern">Watch: {item.concerns[0]}</p>
                )}
                <div className="components">
                  {Object.entries(item.componentScores).map(([key, value]) => (
                    <span key={key}>
                      <i style={{ width: `${value}%` }} />
                      <small>
                        {key} {value}
                      </small>
                    </span>
                  ))}
                </div>
                <Link href={`/?trail=${item.trailId}${demo ? "&demo=1" : ""}`}>
                  Open full trail analysis →
                </Link>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
