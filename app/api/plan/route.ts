import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { aiPlan } from "@/lib/ai";
import { ruleBring } from "@/lib/bring";
import { geocodeAddress, geocodeLocation, isVirtual, type LatLon } from "@/lib/geocode";
import { eventsInWindow } from "@/lib/ical";
import { planLeave, startsFromPrevious } from "@/lib/leaveTime";
import { rateLimited } from "@/lib/rateLimit";
import { getRoute, type Route } from "@/lib/route";
import { assertLooksLikeIcs, fetchCalendar, MAX_BYTES, UnsafeUrlError } from "@/lib/safeFetch";
import { getForecasts, type Weather } from "@/lib/weather";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z
  .object({
    icalUrl: z.string().max(2000).optional(),
    icsText: z.string().max(MAX_BYTES).optional(),
    home: z.union([
      z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }),
      z.object({ address: z.string().min(3).max(200) }),
    ]),
    mode: z.enum(["walk", "bike", "drive"]).default("walk"),
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    tz: z.string().max(64).default("UTC"),
  })
  .refine((b) => !!b.icalUrl !== !!b.icsText, "Give either a calendar URL or a file.");

export type PlannedClass = {
  id: string;
  title: string;
  location: string;
  start: string;
  end: string;
  coords: LatLon | null;
  from: "home" | "previous class" | null;
  route: Route | null;
  leaveBy: string | null;
  travelMin: number | null;
  lateByMin: number;
  weather: Weather | null;
  bring: string[];
  note?: string;
};

export type PlanResponse = { home: LatLon; classes: PlannedClass[]; brief: string | null; aiUsed: boolean; aiProvider?: "gemini" | "claude"; aiError?: string };

const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

function safeTz(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

const cToF = (c: number) => Math.round((c * 9) / 5 + 32);
const kmhToMph = (k: number) => Math.round(k / 1.609);

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) return fail("Slow down a little and try again in a minute.", 429);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Bad request.");
  const b = parsed.data;

  const from = new Date(b.from);
  const to = new Date(b.to);
  if (!(to > from) || to.getTime() - from.getTime() > 8 * 86_400_000) return fail("Pick a range of up to a week.");
  const tz = safeTz(b.tz);

  // 1. Calendar (never logged: private iCal links work like passwords)
  let ics: string;
  try {
    ics = b.icalUrl ? await fetchCalendar(b.icalUrl) : b.icsText!;
    if (!b.icalUrl) assertLooksLikeIcs(ics);
  } catch (e) {
    return fail(e instanceof UnsafeUrlError ? e.message : "Couldn't load that calendar.");
  }

  let events;
  try {
    events = eventsInWindow(ics, from, to);
  } catch {
    return fail("Couldn't read that calendar file.");
  }

  // 2. Home
  const home = "address" in b.home ? await geocodeAddress(b.home.address) : b.home;
  if (!home) return fail("Couldn't find that home address. Try adding the city.");

  // 3. Class locations
  const coords: (LatLon | null)[] = [];
  for (const ev of events) coords.push(ev.geo ?? (ev.location ? await geocodeLocation(ev.location) : null));

  // 4. Weather for every point we know
  const forecast = await getForecasts([home, ...coords.filter((c): c is LatLon => !!c)]).catch(
    () => (() => null) as (p: LatLon, at: Date) => Weather | null,
  );

  // 5. Routes + leave-by, chaining back-to-back classes
  const classes: PlannedClass[] = [];
  let prev: { end: Date; coords: LatLon } | null = null;
  for (const [i, ev] of events.entries()) {
    const start = new Date(ev.start);
    const end = new Date(ev.end);
    const here = coords[i];
    const pc: PlannedClass = {
      id: ev.id,
      title: ev.title,
      location: ev.location,
      start: ev.start,
      end: ev.end,
      coords: here,
      from: null,
      route: null,
      leaveBy: null,
      travelMin: null,
      lateByMin: 0,
      weather: here ? forecast(here, start) : null,
      bring: [],
    };

    if (!here) {
      pc.note = !ev.location ? "No location in the calendar." : isVirtual(ev.location) ? "Online class." : "Couldn't find this location on the map.";
    } else {
      const chained = prev && startsFromPrevious(prev.end, start) ? prev : null;
      const origin = chained ? chained.coords : home;
      pc.from = chained ? "previous class" : "home";
      pc.route = await getRoute(origin, here, b.mode);
      const departWeather = forecast(origin, new Date(start.getTime() - pc.route.seconds * 1000));
      const plan = planLeave(start, pc.route.seconds, departWeather ?? pc.weather, chained?.end);
      pc.leaveBy = plan.leaveBy.toISOString();
      pc.travelMin = plan.travelMin;
      pc.lateByMin = plan.lateByMin;
      prev = { end, coords: here };
    }
    pc.bring = ruleBring([pc.weather], ev.notes);
    classes.push(pc);
  }

  // 6. AI brief + bring list
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const ai = await aiPlan(
    classes.map((c, i) => ({
      id: c.id,
      title: c.title,
      notes: events[i].notes,
      start: fmt(c.start),
      leaveBy: c.leaveBy ? fmt(c.leaveBy) : "n/a",
      travelMin: c.travelMin ?? 0,
      lateByMin: c.lateByMin,
      weather: c.weather
        ? `${cToF(c.weather.tempC)}°F, feels ${cToF(c.weather.feelsC)}°F, rain ${c.weather.precipProb}%, wind ${kmhToMph(c.weather.windKmh)} mph`
        : "unknown",
      ruleBring: c.bring,
    })),
  );
  if (ai.ok) for (const c of classes) if (ai.bring[c.id]?.length) c.bring = ai.bring[c.id];

  return NextResponse.json({ home, classes, brief: ai.ok ? ai.brief : null, aiUsed: ai.ok, aiProvider: ai.ok ? ai.provider : undefined, aiError: ai.ok ? undefined : ai.reason } satisfies PlanResponse, {
    headers: { "cache-control": "no-store" },
  });
}
