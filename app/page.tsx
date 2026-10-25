"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import ClassCard, { type Units } from "@/components/ClassCard";
import type { PlanResponse } from "@/app/api/plan/route";

// Leaflet touches `window`, so render it client-side only.
const RouteMap = dynamic(() => import("@/components/RouteMap"), { ssr: false });

type Mode = "walk" | "bike" | "drive";
type Home = { lat: number; lon: number } | null;

function dayRange(offset: number) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() + offset);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const pill = (on: boolean) =>
  `rounded-full px-3 py-1 text-sm ${on ? "bg-blue-600 text-white" : "bg-slate-200 dark:bg-slate-800"}`;

export default function Page() {
  const [icalUrl, setIcalUrl] = useState("");
  const [icsText, setIcsText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [gps, setGps] = useState<Home>(null);
  const [address, setAddress] = useState("");
  const [locating, setLocating] = useState(false);
  const [mode, setMode] = useState<Mode>("walk");
  const [day, setDay] = useState(0);
  const [units, setUnits] = useState<Units>("F");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [planMode, setPlanMode] = useState<Mode>("walk");

  function useMyLocation() {
    if (!navigator.geolocation) return setError("Your browser can't share location. Type your address instead.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps({ lat: p.coords.latitude, lon: p.coords.longitude });
        setLocating(false);
        setError("");
      },
      () => {
        setLocating(false);
        setError("Location was blocked. Type your address instead.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) return setError("That file is over 2 MB.");
    setIcsText(await f.text());
    setFileName(f.name);
    setIcalUrl("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!icalUrl && !icsText) return setError("Paste your calendar link or upload a .ics file.");
    if (!gps && address.trim().length < 3) return setError("Use your location or type a home address.");

    setLoading(true);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(icsText ? { icsText } : { icalUrl }),
          home: gps ?? { address: address.trim() },
          mode,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...dayRange(day),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setPlan(data);
      setPlanMode(mode);
    } catch (err) {
      setPlan(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const first = plan?.classes.find((c) => c.leaveBy);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">ClassCast ☔</h1>
        <p className="text-slate-500">When to leave, what to bring, and how to get there.</p>
      </header>

      <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="ical">
            Class calendar (iCal link)
          </label>
          <input
            id="ical"
            className={input}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://… or webcal://…"
            value={icalUrl}
            onChange={(e) => {
              setIcalUrl(e.target.value);
              setIcsText(null);
              setFileName("");
            }}
          />
          <p className="text-xs text-slate-500">
            or{" "}
            <label className="cursor-pointer text-blue-600 underline">
              upload a .ics file
              <input type="file" accept=".ics,text/calendar" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {fileName && <span> · {fileName}</span>}. Your link is only used for this request and never saved.
          </p>
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-medium">Starting from</span>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={useMyLocation} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white dark:bg-slate-100 dark:text-slate-900">
              {locating ? "Locating…" : gps ? "📍 Using your location" : "📍 Use my location"}
            </button>
            {gps && (
              <button type="button" className="text-xs text-slate-500 underline" onClick={() => setGps(null)}>
                clear
              </button>
            )}
          </div>
          {!gps && (
            <input className={input} placeholder="or type your address (e.g. 123 College Ave, State College)" value={address} onChange={(e) => setAddress(e.target.value)} />
          )}
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex gap-1" role="group" aria-label="Travel mode">
            {(["walk", "bike", "drive"] as Mode[]).map((m) => (
              <button type="button" key={m} className={pill(mode === m)} onClick={() => setMode(m)}>
                {{ walk: "🚶 Walk", bike: "🚲 Bike", drive: "🚗 Drive" }[m]}
              </button>
            ))}
          </div>
          <div className="flex gap-1" role="group" aria-label="Day">
            {["Today", "Tomorrow"].map((d, i) => (
              <button type="button" key={d} className={pill(day === i)} onClick={() => setDay(i)}>
                {d}
              </button>
            ))}
          </div>
          <div className="flex gap-1" role="group" aria-label="Units">
            {(["F", "C"] as Units[]).map((u) => (
              <button type="button" key={u} className={pill(units === u)} onClick={() => setUnits(u)}>
                °{u}
              </button>
            ))}
          </div>
        </div>

        <button disabled={loading} className="w-full rounded-lg bg-blue-600 py-2.5 font-semibold text-white disabled:opacity-60">
          {loading ? "Planning your day…" : "Plan my day"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {plan && (
        <section className="mt-6 space-y-4">
          {plan.classes.length === 0 ? (
            <p className="text-center text-slate-500">No classes {day === 0 ? "today" : "tomorrow"}. Enjoy 🎉</p>
          ) : (
            <>
              <div className="rounded-xl bg-blue-600 p-4 text-white">
                {first && (
                  <p className="text-lg font-semibold">
                    First leave-by: {new Date(first.leaveBy!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </p>
                )}
                {plan.brief && <p className="mt-1 text-sm opacity-90">{plan.brief}</p>}
                {!plan.aiUsed && <p className="mt-1 text-xs opacity-70">AI brief unavailable; showing the basics.</p>}
              </div>
              <RouteMap plan={plan} />
              {plan.classes.map((c, i) => (
                <ClassCard key={c.id} c={c} units={units} index={i} mode={planMode} />
              ))}
            </>
          )}
        </section>
      )}

      <footer className="mt-10 text-center text-xs text-slate-400">
        Weather: Open-Meteo · Maps: © OpenStreetMap · Routes: openrouteservice
      </footer>
    </main>
  );
}
