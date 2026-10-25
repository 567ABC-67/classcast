import ical, { type ParameterValue, type VEvent } from "node-ical";

export type ClassEvent = {
  id: string;
  title: string;
  location: string;
  notes: string;
  start: string; // ISO UTC
  end: string; // ISO UTC
  geo?: { lat: number; lon: number };
};

const text = (v: ParameterValue | undefined): string =>
  v == null ? "" : typeof v === "string" ? v : String(v.val ?? "");

function parseGeo(geo: unknown): ClassEvent["geo"] {
  if (!geo || typeof geo !== "object") return undefined;
  const g = geo as { lat?: unknown; lon?: unknown };
  const lat = Number(g.lat);
  const lon = Number(g.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  return { lat, lon };
}

/** Timed events overlapping [from, to], recurring ones expanded, sorted by start. */
export function eventsInWindow(ics: string, from: Date, to: Date): ClassEvent[] {
  const data = ical.sync.parseICS(ics);
  const out: ClassEvent[] = [];

  for (const comp of Object.values(data)) {
    if (!comp || comp.type !== "VEVENT") continue;
    const ev = comp as VEvent;
    if (ev.status === "CANCELLED") continue;

    for (const inst of ical.expandRecurringEvent(ev, { from, to })) {
      if (inst.isFullDay) continue;
      const src = inst.event;
      const start = new Date(inst.start);
      const end = new Date(inst.end ?? inst.start);
      if (end < from || start > to) continue;
      out.push({
        id: `${ev.uid}|${start.toISOString()}`,
        title: text(src.summary).slice(0, 200) || "(untitled)",
        location: text(src.location).slice(0, 300),
        notes: text(src.description).slice(0, 500),
        start: start.toISOString(),
        end: end.toISOString(),
        geo: parseGeo(src.geo),
      });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start)).slice(0, 50);
}
