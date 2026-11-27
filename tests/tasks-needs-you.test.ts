import { describe, expect, it } from "vitest";
import { deskHref, needsYou, parseSectionParam } from "@/features/tasks/needs-you";
import type { DeskCounts } from "@/features/tasks/sections";

const counts = (over: Partial<DeskCounts> = {}): DeskCounts => ({ overdue: 0, followUpsDue: 0, dueToday: 0, next7: 0, parked: 0, parkedLate: 0, badge: 0, ...over });

describe("needsYou", () => {
  it("lists overdue, then follow-ups due, then due today, with the right tone and Desk section", () => {
    expect(needsYou(counts({ overdue: 3, followUpsDue: 1, dueToday: 4 }))).toEqual([
      { key: "overdue", section: "overdue", value: 3, label: "overdue", tone: "red" },
      { key: "followups", section: "followups_due", value: 1, label: "follow-up due", tone: "amber" },
      { key: "today", section: "today", value: 4, label: "due today", tone: "amber" },
    ]);
  });
  it("leaves out what is zero and words follow-ups in the plural", () => {
    expect(needsYou(counts())).toEqual([]);
    expect(needsYou(counts({ dueToday: 1 })).map((f) => f.key)).toEqual(["today"]);
    expect(needsYou(counts({ followUpsDue: 2 }))[0]!.label).toBe("follow-ups due");
  });
  it("does not count tasks that are only coming up or parked", () => {
    expect(needsYou(counts({ next7: 9, parked: 4, parkedLate: 2 }))).toEqual([]);
  });
});

describe("parseSectionParam", () => {
  it.each(["overdue", "followups_due", "today", "next7", "later", "parked"])("accepts %s", (s) => expect(parseSectionParam(s)).toBe(s));
  it.each([undefined, "", "OVERDUE", "all", "overdue,today", ["overdue"], ["today", "overdue"]])("rejects %j", (v) => expect(parseSectionParam(v as string)).toBeNull());
});

describe("deskHref", () => {
  it("opens the whole Desk, or one section of it", () => {
    expect(deskHref()).toBe("/tasks");
    expect(deskHref("overdue")).toBe("/tasks?section=overdue");
    expect(deskHref("followups_due")).toBe("/tasks?section=followups_due");
  });
});
