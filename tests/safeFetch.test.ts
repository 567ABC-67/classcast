import { describe, expect, it } from "vitest";
import { assertLooksLikeIcs, isPublicIp, normalizeCalendarUrl, safeLookup } from "@/lib/safeFetch";

describe("isPublicIp", () => {
  it.each([
    "127.0.0.1", "10.0.0.5", "172.16.3.4", "192.168.1.1", "169.254.169.254", "100.64.0.1",
    "0.0.0.0", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "not-an-ip",
  ])("blocks %s", (ip) => expect(isPublicIp(ip)).toBe(false));

  it.each(["8.8.8.8", "142.250.80.46", "2606:4700:4700::1111"])("allows %s", (ip) =>
    expect(isPublicIp(ip)).toBe(true),
  );
});

describe("normalizeCalendarUrl", () => {
  it("rewrites webcal to https", () => {
    expect(normalizeCalendarUrl("webcal://example.com/cal.ics").href).toBe("https://example.com/cal.ics");
  });

  it.each([
    "file:///etc/passwd", "ftp://example.com/x", "gopher://example.com", "javascript:alert(1)",
    "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data",
    "http://0x7f000001/", "http://2130706433/", "http://localhost/", "http://foo.localhost/",
    "http://user:pw@example.com/", "https://example.com:8443/", "not a url",
  ])("rejects %s", (u) => expect(() => normalizeCalendarUrl(u)).toThrow());
});

describe("safeLookup", () => {
  it("refuses names that resolve to loopback", async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((r) => safeLookup("localhost", {}, (e) => r(e)));
    expect(err?.code).toBe("EBLOCKED");
  });
});

describe("assertLooksLikeIcs", () => {
  it("accepts calendars (with BOM) and rejects HTML", () => {
    expect(() => assertLooksLikeIcs("﻿BEGIN:VCALENDAR\nEND:VCALENDAR")).not.toThrow();
    expect(() => assertLooksLikeIcs("<html>")).toThrow();
  });
});
