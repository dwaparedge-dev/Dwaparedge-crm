import { describe, expect, it } from "vitest";
import {
  compareTasks,
  countSections,
  isFollowUpDue,
  isStuck,
  sectionOf,
  SECTION_ORDER,
  type SectionInput,
} from "@/features/tasks/sections";
import { THRESHOLDS } from "@/features/tasks/thresholds";
import type { TaskStatus } from "@/features/tasks/schema";

// 00:15 IST on 20 Nov 2026. The UTC date is still 19 Nov, which is the edge the Desk must get right.
const NOW = new Date("2026-11-19T18:45:00Z");
// Times relative to NOW, with an explicit offset like the real data.
const TOMORROW_10AM = "2026-11-21T10:00:00+05:30";
const YESTERDAY_10AM = "2026-11-19T10:00:00+05:30";

const task = (over: Partial<SectionInput> = {}): SectionInput => ({
  status: "open",
  dueDate: null,
  followUpAt: null,
  ...over,
});

describe("THRESHOLDS", () => {
  it("holds the agreed numbers", () => {
    expect(THRESHOLDS).toEqual({ renewalDays: 30, milestoneDays: 7, stuckAfter: 3 });
  });
});

describe("SECTION_ORDER", () => {
  it("lists the sections as the Desk shows them, parked last", () => {
    expect(SECTION_ORDER).toEqual(["overdue", "followups_due", "today", "next7", "later", "parked"]);
  });
});

describe("sectionOf, the IST day boundary", () => {
  it("treats a task due on the UTC date as overdue once it is 00:15 in India", () => {
    expect(sectionOf(task({ dueDate: "2026-11-19" }), NOW)).toBe("overdue");
  });

  it("treats a task due on the India date as due today at 00:15 IST", () => {
    expect(sectionOf(task({ dueDate: "2026-11-20" }), NOW)).toBe("today");
  });

  it("still calls the previous India date due today just before midnight IST", () => {
    expect(sectionOf(task({ dueDate: "2026-11-19" }), new Date("2026-11-19T18:29:00Z"))).toBe("today");
  });
});

describe("sectionOf, date sections", () => {
  it("puts a task due before today in overdue", () => {
    expect(sectionOf(task({ dueDate: "2026-11-10" }), NOW)).toBe("overdue");
  });

  it("puts tomorrow in next7", () => {
    expect(sectionOf(task({ dueDate: "2026-11-21" }), NOW)).toBe("next7");
  });

  it("includes today + 7 in next7", () => {
    expect(sectionOf(task({ dueDate: "2026-11-27" }), NOW)).toBe("next7");
  });

  it("puts today + 8 in later", () => {
    expect(sectionOf(task({ dueDate: "2026-11-28" }), NOW)).toBe("later");
  });

  it("puts a task with no due date in later", () => {
    expect(sectionOf(task({ dueDate: null }), NOW)).toBe("later");
  });

  it("sections in_progress tasks the same way as open ones", () => {
    expect(sectionOf(task({ status: "in_progress", dueDate: "2026-11-20" }), NOW)).toBe("today");
  });
});

describe("sectionOf, follow-ups", () => {
  it("parks an active task whose follow-up is in the future", () => {
    expect(sectionOf(task({ followUpAt: TOMORROW_10AM }), NOW)).toBe("parked");
  });

  it("parks a waiting task with a future follow-up", () => {
    expect(sectionOf(task({ status: "waiting", followUpAt: TOMORROW_10AM }), NOW)).toBe("parked");
  });

  it("parks an overdue task with a future follow-up: parked wins over overdue", () => {
    expect(sectionOf(task({ dueDate: "2026-11-10", followUpAt: TOMORROW_10AM }), NOW)).toBe("parked");
  });

  it("parks a task due today with a future follow-up", () => {
    expect(sectionOf(task({ dueDate: "2026-11-20", followUpAt: TOMORROW_10AM }), NOW)).toBe("parked");
  });

  it("compares the follow-up as an instant, whatever offset it is written in", () => {
    // 18:50 UTC is five minutes after NOW, so still parked; 18:40 UTC is five minutes before.
    expect(sectionOf(task({ followUpAt: "2026-11-19T18:50:00Z" }), NOW)).toBe("parked");
    expect(sectionOf(task({ followUpAt: "2026-11-19T18:40:00Z" }), NOW)).toBe("followups_due");
    // The same instants written in IST.
    expect(sectionOf(task({ followUpAt: "2026-11-20T00:20:00+05:30" }), NOW)).toBe("parked");
    expect(sectionOf(task({ followUpAt: "2026-11-20T00:10:00+05:30" }), NOW)).toBe("followups_due");
  });

  it("treats a follow-up exactly at now as returned, not parked", () => {
    expect(sectionOf(task({ followUpAt: "2026-11-19T18:45:00Z" }), NOW)).toBe("followups_due");
  });

  it("puts a returned follow-up with no due date in followups_due", () => {
    expect(sectionOf(task({ followUpAt: YESTERDAY_10AM }), NOW)).toBe("followups_due");
  });

  it("puts a returned follow-up on a task due today in followups_due, ahead of today", () => {
    expect(sectionOf(task({ dueDate: "2026-11-20", followUpAt: YESTERDAY_10AM }), NOW)).toBe("followups_due");
  });

  it("puts a returned follow-up on a task due next week in followups_due", () => {
    expect(sectionOf(task({ dueDate: "2026-11-25", followUpAt: YESTERDAY_10AM }), NOW)).toBe("followups_due");
  });

  it("keeps an overdue task with a returned follow-up in overdue", () => {
    expect(sectionOf(task({ dueDate: "2026-11-10", followUpAt: YESTERDAY_10AM }), NOW)).toBe("overdue");
  });
});

describe("sectionOf, closed tasks", () => {
  it.each<TaskStatus>(["done", "cancelled"])("gives null for %s, whatever the dates", (status) => {
    expect(sectionOf(task({ status }), NOW)).toBeNull();
    expect(sectionOf(task({ status, dueDate: "2026-11-10" }), NOW)).toBeNull();
    expect(sectionOf(task({ status, followUpAt: TOMORROW_10AM }), NOW)).toBeNull();
    expect(sectionOf(task({ status, followUpAt: YESTERDAY_10AM }), NOW)).toBeNull();
  });
});

describe("isFollowUpDue", () => {
  it("is true once the follow-up time has passed on an active task", () => {
    expect(isFollowUpDue(task({ followUpAt: YESTERDAY_10AM }), NOW)).toBe(true);
    expect(isFollowUpDue(task({ status: "waiting", followUpAt: YESTERDAY_10AM }), NOW)).toBe(true);
  });

  it("is true at the exact follow-up instant", () => {
    expect(isFollowUpDue(task({ followUpAt: "2026-11-19T18:45:00Z" }), NOW)).toBe(true);
  });

  it("stays true for an overdue task, so the tag shows in whichever section it lands in", () => {
    expect(isFollowUpDue(task({ dueDate: "2026-11-10", followUpAt: YESTERDAY_10AM }), NOW)).toBe(true);
  });

  it("is false while the follow-up is still in the future", () => {
    expect(isFollowUpDue(task({ followUpAt: TOMORROW_10AM }), NOW)).toBe(false);
  });

  it("is false when there is no follow-up time", () => {
    expect(isFollowUpDue(task(), NOW)).toBe(false);
  });

  it("is false for done and cancelled tasks", () => {
    expect(isFollowUpDue(task({ status: "done", followUpAt: YESTERDAY_10AM }), NOW)).toBe(false);
    expect(isFollowUpDue(task({ status: "cancelled", followUpAt: YESTERDAY_10AM }), NOW)).toBe(false);
  });
});

describe("isStuck", () => {
  it("is false below the threshold", () => {
    expect(isStuck(0)).toBe(false);
    expect(isStuck(2)).toBe(false);
  });

  it("is true from the threshold up", () => {
    expect(isStuck(3)).toBe(true);
    expect(isStuck(10)).toBe(true);
  });
});

describe("compareTasks", () => {
  const row = (priorityRank: number, dueDate: string | null, createdAt: string) => ({ priorityRank, dueDate, createdAt });

  it("orders by priority rank first, lower rank (more urgent) first", () => {
    const urgent = row(1, "2026-12-01", "2026-11-19T09:00:00Z");
    const normal = row(3, "2026-11-01", "2026-11-01T09:00:00Z");
    expect(compareTasks(urgent, normal)).toBeLessThan(0);
    expect(compareTasks(normal, urgent)).toBeGreaterThan(0);
  });

  it("orders by due date within a rank, earliest first", () => {
    const sooner = row(2, "2026-11-20", "2026-11-19T09:00:00Z");
    const later = row(2, "2026-11-25", "2026-11-01T09:00:00Z");
    expect(compareTasks(sooner, later)).toBeLessThan(0);
    expect(compareTasks(later, sooner)).toBeGreaterThan(0);
  });

  it("puts a task with no due date after one with a date", () => {
    const dated = row(2, "2027-01-01", "2026-11-19T09:00:00Z");
    const undated = row(2, null, "2026-11-01T09:00:00Z");
    expect(compareTasks(dated, undated)).toBeLessThan(0);
    expect(compareTasks(undated, dated)).toBeGreaterThan(0);
  });

  it("orders by older createdAt first when rank and due date match", () => {
    const older = row(2, "2026-11-20", "2026-11-01T09:00:00Z");
    const newer = row(2, "2026-11-20", "2026-11-19T09:00:00Z");
    expect(compareTasks(older, newer)).toBeLessThan(0);
    expect(compareTasks(newer, older)).toBeGreaterThan(0);
  });

  it("orders two undated tasks of one rank by older createdAt first", () => {
    const older = row(2, null, "2026-11-01T09:00:00Z");
    const newer = row(2, null, "2026-11-19T09:00:00Z");
    expect(compareTasks(older, newer)).toBeLessThan(0);
    expect(compareTasks(newer, older)).toBeGreaterThan(0);
  });

  it("compares createdAt as instants, not as text", () => {
    // 10:00+05:30 is 04:30Z, earlier than 06:00Z even though "10" sorts after "06".
    const earlier = row(2, null, "2026-11-19T10:00:00+05:30");
    const later = row(2, null, "2026-11-19T06:00:00Z");
    expect(compareTasks(earlier, later)).toBeLessThan(0);
  });

  it("returns 0 for identical sort keys", () => {
    expect(compareTasks(row(2, "2026-11-20", "2026-11-01T09:00:00Z"), row(2, "2026-11-20", "2026-11-01T09:00:00Z"))).toBe(0);
  });

  it("sorts a list into the Desk order", () => {
    const a = { id: "a", ...row(2, null, "2026-11-01T09:00:00Z") };
    const b = { id: "b", ...row(1, "2026-12-01", "2026-11-05T09:00:00Z") };
    const c = { id: "c", ...row(2, "2026-11-22", "2026-11-10T09:00:00Z") };
    const d = { id: "d", ...row(2, "2026-11-22", "2026-11-02T09:00:00Z") };
    expect([a, b, c, d].sort(compareTasks).map((t) => t.id)).toEqual(["b", "d", "c", "a"]);
  });
});

describe("countSections", () => {
  it("counts an empty list as all zeros", () => {
    expect(countSections([], NOW)).toEqual({
      overdue: 0,
      followUpsDue: 0,
      dueToday: 0,
      next7: 0,
      parked: 0,
      parkedLate: 0,
      badge: 0,
    });
  });

  it("counts each section and keeps parked tasks out of the badge", () => {
    const tasks: SectionInput[] = [
      task({ dueDate: "2026-11-19" }), // overdue
      task({ dueDate: "2026-11-01" }), // overdue
      task({ dueDate: "2026-11-10", followUpAt: YESTERDAY_10AM }), // overdue (returned follow-up does not count twice)
      task({ followUpAt: YESTERDAY_10AM }), // followups_due
      task({ dueDate: "2026-11-20", followUpAt: YESTERDAY_10AM }), // followups_due, not today
      task({ dueDate: "2026-11-20" }), // today
      task({ status: "in_progress", dueDate: "2026-11-20" }), // today
      task({ dueDate: "2026-11-21" }), // next7
      task({ dueDate: "2026-11-27" }), // next7
      task({ dueDate: "2026-11-28" }), // later
      task({ dueDate: null }), // later
      task({ dueDate: "2026-11-10", followUpAt: TOMORROW_10AM }), // parked, late
      task({ dueDate: "2026-11-19", followUpAt: TOMORROW_10AM }), // parked, late (due before today in India)
      task({ dueDate: "2026-11-20", followUpAt: TOMORROW_10AM }), // parked, due today so not late
      task({ status: "waiting", dueDate: "2026-12-30", followUpAt: TOMORROW_10AM }), // parked, not late
      task({ status: "waiting", followUpAt: TOMORROW_10AM }), // parked, no deadline
      task({ status: "done", dueDate: "2026-11-01" }), // closed
      task({ status: "cancelled", followUpAt: TOMORROW_10AM }), // closed
    ];
    expect(countSections(tasks, NOW)).toEqual({
      overdue: 3,
      followUpsDue: 2,
      dueToday: 2,
      next7: 2,
      parked: 5,
      parkedLate: 2,
      badge: 5,
    });
  });

  it("sets the badge to overdue plus follow-ups due, whatever is parked", () => {
    const tasks: SectionInput[] = [
      task({ dueDate: "2026-11-01" }),
      task({ followUpAt: YESTERDAY_10AM }),
      task({ followUpAt: TOMORROW_10AM }),
      task({ followUpAt: TOMORROW_10AM, dueDate: "2026-11-01" }),
    ];
    const counts = countSections(tasks, NOW);
    expect(counts.badge).toBe(counts.overdue + counts.followUpsDue);
    expect(counts.badge).toBe(2);
    expect(counts.parked).toBe(2);
  });
});
