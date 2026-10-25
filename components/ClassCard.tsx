import type { PlannedClass } from "@/app/api/plan/route";
import type { Weather } from "@/lib/weather";

export type Units = "F" | "C";

// WMO codes -> emoji + words
function describe(code: number): [string, string] {
  if (code === 0) return ["☀️", "Clear"];
  if (code <= 2) return ["🌤️", "Partly cloudy"];
  if (code === 3) return ["☁️", "Cloudy"];
  if (code <= 48) return ["🌫️", "Fog"];
  if (code <= 57) return ["🌦️", "Drizzle"];
  if (code <= 67 || (code >= 80 && code <= 82)) return ["🌧️", "Rain"];
  if (code <= 77 || code === 85 || code === 86) return ["🌨️", "Snow"];
  return ["⛈️", "Storms"];
}

export const temp = (c: number, u: Units) => `${Math.round(u === "F" ? (c * 9) / 5 + 32 : c)}°${u}`;
const wind = (kmh: number, u: Units) => (u === "F" ? `${Math.round(kmh / 1.609)} mph` : `${Math.round(kmh)} km/h`);
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function WeatherLine({ w, units }: { w: Weather; units: Units }) {
  const [icon, label] = describe(w.code);
  return (
    <p className="text-sm text-slate-600 dark:text-slate-300">
      {icon} {label} · {temp(w.tempC, units)} (feels {temp(w.feelsC, units)}) · 💧 {w.precipProb}% · 💨 {wind(w.windKmh, units)}
    </p>
  );
}

const MODE_ICON = { walk: "🚶", bike: "🚲", drive: "🚗" } as const;

export default function ClassCard({
  c,
  units,
  index,
  mode,
  showSource = false,
}: {
  c: PlannedClass;
  units: Units;
  index: number;
  mode: keyof typeof MODE_ICON;
  showSource?: boolean;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">
            <span className="mr-2 text-slate-400">{index + 1}.</span>
            {c.title}
          </h3>
          <p className="text-sm text-slate-500">
            {time(c.start)}–{time(c.end)} · {c.location || "no location"}
          </p>
          {showSource && <p className="mt-0.5 text-xs text-slate-400">📅 {c.source}</p>}
        </div>
        {c.leaveBy && (
          <div className="shrink-0 text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500">Leave by</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{time(c.leaveBy)}</p>
          </div>
        )}
      </div>

      {c.lateByMin > 0 && (
        <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          ⚠️ Your previous class ends too late. You&apos;ll be about {c.lateByMin} min late.
        </p>
      )}
      {c.note && <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{c.note}</p>}

      <div className="mt-3 space-y-1">
        {c.route && (
          <p className="text-sm">
            {MODE_ICON[mode]} {c.travelMin} min from {c.from} · {(c.route.meters / 1609).toFixed(1)} mi
            {c.route.estimated && <span className="text-slate-400"> (estimate)</span>}
          </p>
        )}
        {c.weather ? <WeatherLine w={c.weather} units={units} /> : c.coords && <p className="text-sm text-slate-400">No forecast yet for this time.</p>}
      </div>

      {c.bring.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {c.bring.map((b) => (
            <li key={b} className="rounded-full bg-slate-100 px-3 py-1 text-xs dark:bg-slate-800">
              {b}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
