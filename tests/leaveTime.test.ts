import { describe, expect, it } from "vitest";
import { planLeave, startsFromPrevious, weatherFactor } from "@/lib/leaveTime";
import { estimateRoute } from "@/lib/route";
import type { Weather } from "@/lib/weather";

const clear: Weather = { tempC: 15, feelsC: 15, precipProb: 0, precipMm: 0, windKmh: 5, code: 0 };
const rain: Weather = { ...clear, precipProb: 80, precipMm: 1.2, code: 63 };
const snow: Weather = { ...clear, tempC: -3, code: 73 };
const start = new Date("2026-10-26T14:00:00Z");

describe("planLeave", () => {
  it("subtracts travel and the 5 min buffer", () => {
    const p = planLeave(start, 10 * 60, clear);
    expect(p.travelMin).toBe(10);
    expect(p.leaveBy.toISOString()).toBe("2026-10-26T13:45:00.000Z");
    expect(p.lateByMin).toBe(0);
  });

  it("adds time for rain and snow", () => {
    expect(weatherFactor(rain)).toBe(1.15);
    expect(weatherFactor(snow)).toBe(1.25);
    expect(planLeave(start, 20 * 60, rain).travelMin).toBe(23);
    expect(planLeave(start, 20 * 60, snow).travelMin).toBe(25);
  });

  it("flags a back-to-back class you can't make", () => {
    const prevEnd = new Date("2026-10-26T13:50:00Z");
    expect(planLeave(start, 10 * 60, clear, prevEnd).lateByMin).toBe(5);
  });
});

describe("startsFromPrevious", () => {
  it("chains classes within 3 hours only", () => {
    expect(startsFromPrevious(new Date("2026-10-26T13:00:00Z"), start)).toBe(true);
    expect(startsFromPrevious(new Date("2026-10-26T09:00:00Z"), start)).toBe(false);
  });
});

describe("estimateRoute", () => {
  it("walks ~0.7 km in ~11 min", () => {
    const r = estimateRoute({ lat: 40.7982, lon: -77.8599 }, { lat: 40.8042, lon: -77.8599 }, "walk");
    expect(r.estimated).toBe(true);
    expect(Math.round(r.seconds / 60)).toBeGreaterThan(8);
    expect(Math.round(r.seconds / 60)).toBeLessThan(12);
  });
});
