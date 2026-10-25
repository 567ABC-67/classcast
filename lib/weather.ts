import type { LatLon } from "./geocode";

export type Weather = {
  tempC: number;
  feelsC: number;
  precipProb: number; // %
  precipMm: number;
  windKmh: number;
  code: number; // WMO weather code
};

type Hourly = {
  time: string[];
  temperature_2m: number[];
  apparent_temperature: number[];
  precipitation_probability: number[];
  precipitation: number[];
  wind_speed_10m: number[];
  weather_code: number[];
};

const HOURLY = "temperature_2m,apparent_temperature,precipitation_probability,precipitation,wind_speed_10m,weather_code";

const roundKey = (p: LatLon) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;

/** One Open-Meteo call for all distinct (~1 km) points. Returns a lookup fn. */
export async function getForecasts(points: LatLon[]) {
  const keys = [...new Set(points.map(roundKey))];
  const series = new Map<string, Hourly>();
  if (keys.length) {
    const params = new URLSearchParams({
      latitude: keys.map((k) => k.split(",")[0]).join(","),
      longitude: keys.map((k) => k.split(",")[1]).join(","),
      hourly: HOURLY,
      timezone: "GMT",
      forecast_days: "16",
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const body = (await res.json()) as { hourly: Hourly } | { hourly: Hourly }[];
      const list = Array.isArray(body) ? body : [body];
      list.forEach((r, i) => series.set(keys[i], r.hourly));
    }
  }

  return (p: LatLon, at: Date): Weather | null => {
    const h = series.get(roundKey(p));
    if (!h) return null;
    const hour = new Date(Math.round(at.getTime() / 3_600_000) * 3_600_000).toISOString().slice(0, 13) + ":00";
    const i = h.time.indexOf(hour);
    if (i < 0) return null;
    return {
      tempC: h.temperature_2m[i],
      feelsC: h.apparent_temperature[i],
      precipProb: h.precipitation_probability[i] ?? 0,
      precipMm: h.precipitation[i] ?? 0,
      windKmh: h.wind_speed_10m[i],
      code: h.weather_code[i],
    };
  };
}

export const isSnow = (code: number) => (code >= 71 && code <= 77) || code === 85 || code === 86;
export const isWet = (w: Weather) => w.precipProb >= 50 || w.precipMm >= 0.3 || (w.code >= 51 && w.code <= 99);
