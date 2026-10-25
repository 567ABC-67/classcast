// SSRF-safe fetch for user-supplied calendar URLs.
// - only http(s) (webcal:// is rewritten to https://), default ports only
// - every DNS answer is checked at connect time, so the IP we validate is the
//   IP we connect to (no DNS-rebinding window)
// - redirects are followed by hand and each hop is re-checked
// - hard timeout and body size cap
import dns from "node:dns";
import net from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch } from "undici";

export const MAX_BYTES = 2 * 1024 * 1024;
export const TIMEOUT_MS = 5000;
export const MAX_REDIRECTS = 3;

export class UnsafeUrlError extends Error {}

export function isPublicIp(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  let addr = ipaddr.parse(ip);
  if (addr.kind() === "ipv6") {
    const v6 = addr as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) addr = v6.toIPv4Address();
  }
  // ipaddr.js labels everything that isn't a special range "unicast"
  // (private, loopback, linkLocal incl. 169.254.169.254, carrierGradeNat, uniqueLocal, ...)
  return addr.range() === "unicast";
}

export function normalizeCalendarUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  } catch {
    throw new UnsafeUrlError("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeUrlError("Only http, https and webcal links are allowed.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with embedded credentials are not allowed.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new UnsafeUrlError("Only standard ports are allowed.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && !isPublicIp(host)) {
    throw new UnsafeUrlError("That address is not allowed.");
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new UnsafeUrlError("That address is not allowed.");
  }
  return url;
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

export function safeLookup(hostname: string, options: dns.LookupOptions, cb: LookupCb) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, "");
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => !isPublicIp(a.address))) {
      return cb(Object.assign(new Error("blocked address"), { code: "EBLOCKED" }), "");
    }
    if (options.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

const agent = new Agent({ connect: { lookup: safeLookup as never } });

async function readCapped(body: AsyncIterable<Uint8Array> | null): Promise<string> {
  if (!body) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > MAX_BYTES) throw new UnsafeUrlError("Calendar is too large (2 MB max).");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function fetchCalendar(raw: string): Promise<string> {
  let url = normalizeCalendarUrl(raw);
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res;
    try {
      res = await fetch(url, {
        dispatcher: agent,
        redirect: "manual",
        signal,
        headers: { accept: "text/calendar, text/plain;q=0.9, */*;q=0.1", "user-agent": "ClassCast/0.1" },
      });
    } catch (e) {
      const code = (e as { cause?: { code?: string } }).cause?.code;
      if (code === "EBLOCKED") throw new UnsafeUrlError("That address is not allowed.");
      if ((e as Error).name === "TimeoutError") throw new UnsafeUrlError("The calendar took too long to respond.");
      throw new UnsafeUrlError("Couldn't reach that calendar URL.");
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc) throw new UnsafeUrlError("Calendar redirect had no location.");
      url = normalizeCalendarUrl(new URL(loc, url).toString());
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new UnsafeUrlError(`Calendar server answered ${res.status}.`);
    }
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) {
      await res.body?.cancel();
      throw new UnsafeUrlError("Calendar is too large (2 MB max).");
    }
    const text = await readCapped(res.body);
    assertLooksLikeIcs(text);
    return text;
  }
  throw new UnsafeUrlError("Too many redirects.");
}

export function assertLooksLikeIcs(text: string) {
  if (!text.replace(/^﻿/, "").trimStart().startsWith("BEGIN:VCALENDAR")) {
    throw new UnsafeUrlError("That URL didn't return an iCal calendar.");
  }
}
