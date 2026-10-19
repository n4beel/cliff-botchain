import { describe, expect, it } from "vitest";
import {
  computeReleasable,
  computeVested,
  vestingProgressPercent,
  cliffDate,
  endDate,
  scheduleStatus,
  type CliffSchedule,
} from "../cliff";

describe("cliff math and dates", () => {
  const start = 1_700_000_000;
  const cliff = 30 * 86400; // 30 days
  const duration = 90 * 86400; // 90 days
  const total = 9000n;

  const schedule: CliffSchedule = {
    beneficiary: "0x1234567890123456789012345678901234567890",
    start,
    cliff,
    duration,
    total,
    released: 0n,
  };

  it("vested is 0 before cliff", () => {
    expect(computeVested(schedule, start)).toBe(0n);
    expect(computeVested(schedule, start + cliff - 1)).toBe(0n);
    expect(scheduleStatus(schedule, start + cliff - 1)).toBe("Before cliff");
  });

  it("vested is proportional after cliff", () => {
    // Exactly at cliff (30/90 = 1/3)
    expect(computeVested(schedule, start + cliff)).toBe(3000n);
    expect(vestingProgressPercent(schedule, start + cliff)).toBe(33);
    expect(scheduleStatus(schedule, start + cliff)).toBe("Vesting");

    // Halfway through duration (45/90 = 1/2)
    const halfway = start + 45 * 86400;
    expect(computeVested(schedule, halfway)).toBe(4500n);
    expect(vestingProgressPercent(schedule, halfway)).toBe(50);
  });

  it("vested is total at and after end", () => {
    expect(computeVested(schedule, start + duration)).toBe(9000n);
    expect(computeVested(schedule, start + duration + 1000)).toBe(9000n);
    expect(vestingProgressPercent(schedule, start + duration)).toBe(100);
    expect(scheduleStatus(schedule, start + duration)).toBe("Completed");
  });

  it("releasable subtracts already released", () => {
    const partiallyReleased: CliffSchedule = {
      ...schedule,
      released: 2000n,
    };
    const halfway = start + 45 * 86400; // 4500 vested
    expect(computeReleasable(partiallyReleased, halfway)).toBe(2500n);
  });

  it("dates calculate correctly", () => {
    expect(cliffDate(schedule).getTime()).toBe((start + cliff) * 1000);
    expect(endDate(schedule).getTime()).toBe((start + duration) * 1000);
  });
});
