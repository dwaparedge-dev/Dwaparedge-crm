import { describe, expect, it } from "vitest";
import { daysFromNow, FOLLOW_UP_PRESETS, localToIso, parseDays, SNOOZE_PRESETS, whenProblem } from "@/features/tasks/follow-up-times";

const NOW = new Date("2026-11-19T10:00:00.000Z");

describe("presets", () => {
  it("builds follow-up times from the injected clock", () => {
    expect(FOLLOW_UP_PRESETS.map((p) => [p.label, daysFromNow(p.days, NOW)])).toEqual([
      ["+1 day", "2026-11-20T10:00:00.000Z"],
      ["+3 days", "2026-11-22T10:00:00.000Z"],
      ["+1 week", "2026-11-26T10:00:00.000Z"],
    ]);
  });

  it("builds snooze times", () => {
    expect(SNOOZE_PRESETS.map((p) => [p.label, daysFromNow(p.days, NOW)])).toEqual([
      ["Tomorrow", "2026-11-20T10:00:00.000Z"],
      ["In 3 days", "2026-11-22T10:00:00.000Z"],
      ["Next week", "2026-11-26T10:00:00.000Z"],
    ]);
  });
});

describe("localToIso", () => {
  it("converts a datetime-local value to an ISO instant", () => {
    const v = "2026-11-20T10:30";
    expect(localToIso(v)).toBe(new Date(v).toISOString());
  });
  it("is null for blank or unreadable values", () => {
    expect(localToIso("")).toBeNull();
    expect(localToIso("  ")).toBeNull();
    expect(localToIso("soon")).toBeNull();
  });
});

describe("whenProblem", () => {
  it("accepts a time ahead, up to 365 days", () => {
    expect(whenProblem("2026-11-19T10:00:01.000Z", NOW)).toBeNull();
    expect(whenProblem(daysFromNow(365, NOW), NOW)).toBeNull();
  });
  it("refuses blank, now, the past and beyond 365 days", () => {
    expect(whenProblem(null, NOW)).toBe("Choose a date and time");
    expect(whenProblem(NOW.toISOString(), NOW)).toBe("Choose a time in the future");
    expect(whenProblem("2026-11-18T10:00:00.000Z", NOW)).toBe("Choose a time in the future");
    expect(whenProblem("2027-11-19T10:00:01.000Z", NOW)).toBe("Choose a time within 365 days");
  });
});

describe("parseDays", () => {
  it.each([
    ["", null], ["  ", null], ["1", 1], ["30", 30], ["365", 365],
    ["0", "invalid"], ["366", "invalid"], ["-2", "invalid"], ["1.5", "invalid"], ["abc", "invalid"],
  ])("%j gives %j", (v, out) => {
    expect(parseDays(v)).toBe(out);
  });
});
