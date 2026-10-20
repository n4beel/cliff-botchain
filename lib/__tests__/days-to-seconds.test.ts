import { describe, expect, it } from "vitest";
import { daysToWholeSeconds } from "../cliff";

/**
 * The create form validates a number of days and sends a number of seconds. Any input it accepts
 * whose conversion the contract rejects is gas the user pays for nothing — which is exactly what
 * `durationDays > 0` allowed, since 1e-5 days is positive and floors to zero seconds.
 */
describe("days as the contract counts them", () => {
  it("floors to whole seconds", () => {
    expect(daysToWholeSeconds(1)).toBe(86400);
    expect(daysToWholeSeconds(0.5)).toBe(43200);
    expect(daysToWholeSeconds(1 / 86400)).toBe(1);
  });

  it("returns zero for a positive duration too small to be a second", () => {
    // Not an error here — the caller must reject it, and this is what makes that possible.
    for (const d of [1e-5, 1e-6, 0.0000115]) {
      expect(d).toBeGreaterThan(0);
      expect(daysToWholeSeconds(d)).toBe(0);
    }
  });

  it("rejects what is not a usable number of days", () => {
    for (const d of [NaN, Infinity, -1, -0.5]) {
      expect(Number.isNaN(daysToWholeSeconds(d))).toBe(true);
    }
  });

  it("never lets a cliff within the duration exceed it once converted", () => {
    for (let i = 0; i < 5000; i++) {
      const duration = 1 / 86400 + i * 0.013;
      for (const frac of [0, 0.5, 0.999999, 1]) {
        const cliff = duration * frac;
        const cs = daysToWholeSeconds(cliff);
        const ds = daysToWholeSeconds(duration);
        expect(cs).toBeLessThanOrEqual(ds);
      }
    }
  });
});
