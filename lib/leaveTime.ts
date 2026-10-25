import { isSnow, isWet, type Weather } from "./weather";

export const BUFFER_MIN = 5;

/** Travel takes longer in bad weather. */
export function weatherFactor(w: Weather | null): number {
  if (!w) return 1;
  if (isSnow(w.code)) return 1.25;
  if (isWet(w)) return 1.15;
  return 1;
}

export type LeavePlan = {
  leaveBy: Date;
  travelMin: number; // incl. weather slowdown, excl. buffer
  lateByMin: number; // >0 when the previous class ends after you'd need to leave
};

/**
 * leaveBy = classStart - travel * weather factor - buffer.
 * `availableFrom` is when you're free to go (end of the previous class), if any.
 */
export function planLeave(
  classStart: Date,
  travelSeconds: number,
  w: Weather | null,
  availableFrom?: Date,
  bufferMin = BUFFER_MIN,
): LeavePlan {
  const travelMin = Math.ceil((travelSeconds / 60) * weatherFactor(w));
  const leaveBy = new Date(classStart.getTime() - (travelMin + bufferMin) * 60_000);
  const lateByMin = availableFrom ? Math.max(0, Math.ceil((availableFrom.getTime() - leaveBy.getTime()) / 60_000)) : 0;
  return { leaveBy, travelMin, lateByMin };
}

/** Previous class counts as the starting point if it ended within 3 hours of the next one. */
export function startsFromPrevious(prevEnd: Date, nextStart: Date): boolean {
  const gap = nextStart.getTime() - prevEnd.getTime();
  return gap >= -15 * 60_000 && gap <= 3 * 3_600_000;
}
