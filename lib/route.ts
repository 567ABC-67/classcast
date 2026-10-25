import type { LatLon } from "./geocode";

export type Mode = "walk" | "bike" | "drive";
export type Route = {
  seconds: number;
  meters: number;
  line: [number, number][]; // [lat, lon] for Leaflet
  estimated: boolean; // true = straight-line guess, no routing API
};

const ORS_PROFILE: Record<Mode, string> = { walk: "foot-walking", bike: "cycling-regular", drive: "driving-car" };
const SPEED_MPS: Record<Mode, number> = { walk: 1.35, bike: 4.5, drive: 9 };

export function haversineMeters(a: LatLon, b: LatLon) {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Fallback when there's no ORS key or ORS fails: straight line x1.3 detour. */
export function estimateRoute(from: LatLon, to: LatLon, mode: Mode): Route {
  const meters = haversineMeters(from, to) * 1.3;
  return {
    seconds: Math.round(meters / SPEED_MPS[mode]),
    meters: Math.round(meters),
    line: [
      [from.lat, from.lon],
      [to.lat, to.lon],
    ],
    estimated: true,
  };
}

const cache = new Map<string, Route>();

export async function getRoute(from: LatLon, to: LatLon, mode: Mode): Promise<Route> {
  const key = [from.lat, from.lon, to.lat, to.lon].map((n) => n.toFixed(5)).join(",") + mode;
  const hit = cache.get(key);
  if (hit) return hit;

  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey || haversineMeters(from, to) < 30) return estimateRoute(from, to, mode);

  try {
    const res = await fetch(`https://api.openrouteservice.org/v2/directions/${ORS_PROFILE[mode]}/geojson`, {
      method: "POST",
      headers: { authorization: apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        coordinates: [
          [from.lon, from.lat],
          [to.lon, to.lat],
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return estimateRoute(from, to, mode);
    const data = (await res.json()) as {
      features: { geometry: { coordinates: [number, number][] }; properties: { summary: { duration: number; distance: number } } }[];
    };
    const f = data.features[0];
    const route: Route = {
      seconds: Math.round(f.properties.summary.duration ?? 0),
      meters: Math.round(f.properties.summary.distance ?? 0),
      line: f.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
      estimated: false,
    };
    cache.set(key, route);
    return route;
  } catch {
    return estimateRoute(from, to, mode);
  }
}
