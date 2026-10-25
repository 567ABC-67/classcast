import { describe, expect, it } from "vitest";
import { dedupe, loadCalendars, type SourcedEvent } from "@/lib/calendars";

const cal = (uid: string, title: string, start: string) => `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:${uid}
DTSTAMP:20261001T000000Z
DTSTART:${start}
DTEND:${start.replace(/T(\d\d)/, (_, h) => `T${String(Number(h) + 1).padStart(2, "0")}`)}
SUMMARY:${title}
LOCATION:Thomas Building
END:VEVENT
END:VCALENDAR`;

const from = new Date("2026-10-26T00:00:00Z");
const to = new Date("2026-10-27T00:00:00Z");

describe("loadCalendars", () => {
  it("merges calendars in time order and labels each event", async () => {
    const r = await loadCalendars(
      [
        { label: "Fall classes", ics: cal("x1", "CMPSC 132", "20261026T150000Z") },
        { label: "Labs", ics: cal("y1", "PHYS 211 Lab", "20261026T130000Z") },
      ],
      from,
      to,
    );
    expect(r.events.map((e) => [e.title, e.source])).toEqual([
      ["PHYS 211 Lab", "Labs"],
      ["CMPSC 132", "Fall classes"],
    ]);
    expect(r.warnings).toEqual([]);
  });

  it("drops the same class listed in two calendars", async () => {
    const r = await loadCalendars(
      [
        { label: "A", ics: cal("x1", "MATH 230", "20261026T130000Z") },
        { label: "B", ics: cal("other-uid", "  math 230 ", "20261026T130000Z") },
      ],
      from,
      to,
    );
    expect(r.events).toHaveLength(1);
    expect(r.events[0].source).toBe("A");
  });

  it("keeps going when one link is bad, and never echoes the link", async () => {
    const secret = "http://169.254.169.254/private-token-abc";
    const r = await loadCalendars(
      [
        { label: "Good", ics: cal("x1", "MATH 230", "20261026T130000Z") },
        { label: "Calendar 2", url: secret },
        { label: "Junk", ics: "<html>" },
      ],
      from,
      to,
    );
    expect(r.loadedCount).toBe(1);
    expect(r.events).toHaveLength(1);
    expect(r.warnings).toEqual([expect.stringMatching(/^Calendar 2: /), expect.stringMatching(/^Junk: /)]);
    expect(r.warnings.join(" ")).not.toContain("private-token-abc");
  });
});

describe("dedupe", () => {
  it("treats the same UID+start as one event", () => {
    const ev = { id: "u|2026-10-26T13:00:00.000Z", title: "A", start: "2026-10-26T13:00:00.000Z" } as SourcedEvent;
    expect(dedupe([ev, { ...ev, title: "A (copy)" }])).toHaveLength(1);
  });
});
