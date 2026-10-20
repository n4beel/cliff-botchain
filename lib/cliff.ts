import type { Address } from "viem";

export type CliffSchedule = {
  beneficiary: Address;
  start: number;
  cliff: number;    // seconds after start
  duration: number; // total seconds from start
  total: bigint;
  released: bigint;
};

export function computeVested(s: CliffSchedule, now?: number): bigint {
  const t = now ?? Math.floor(Date.now() / 1000);
  if (t < s.start + s.cliff) return 0n;
  if (t >= s.start + s.duration) return s.total;
  return (s.total * BigInt(t - s.start)) / BigInt(s.duration);
}

export function computeReleasable(s: CliffSchedule, now?: number): bigint {
  return computeVested(s, now) - s.released;
}

export function vestingProgressPercent(s: CliffSchedule, now?: number): number {
  const v = computeVested(s, now);
  if (s.total === 0n) return 0;
  const pct = Number((v * 100n) / s.total);
  return Math.min(100, Math.max(0, pct));
}

export function cliffDate(s: CliffSchedule): Date {
  return new Date((s.start + s.cliff) * 1000);
}

export function startDate(s: CliffSchedule): Date {
  return new Date(s.start * 1000);
}

export function endDate(s: CliffSchedule): Date {
  return new Date((s.start + s.duration) * 1000);
}

export type ScheduleStatus = "Before cliff" | "Vesting" | "Completed";

export function scheduleStatus(s: CliffSchedule, now?: number): ScheduleStatus {
  const t = now ?? Math.floor(Date.now() / 1000);
  if (t < s.start + s.cliff) return "Before cliff";
  if (t >= s.start + s.duration) return "Completed";
  return "Vesting";
}

export function formatDateTimeUTC(date: Date): string {
  return date.toISOString().replace("T", " ").substring(0, 19) + " UTC";
}

/**
 * Days as the contract counts them: whole seconds, rounded down.
 *
 * Exported, and used by the create form rather than duplicated inside it, because the form used
 * to validate the typed number and send a converted one. A duration of 1e-5 days is greater than
 * zero and floors to zero seconds, so it passed the check and then reverted ZeroDuration with the
 * sender's gas already spent. Whatever validates must be what is sent.
 */
export function daysToWholeSeconds(days: number): number {
  if (!Number.isFinite(days) || days < 0) return NaN;
  return Math.floor(days * 86400);
}
