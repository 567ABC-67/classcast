// Simple per-IP sliding window. In-memory, so it's per serverless instance:
// good enough to slow down abuse of the AI / routing quotas for a hackathon.
const hits = new Map<string, number[]>();

export function rateLimited(ip: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > limit;
}
