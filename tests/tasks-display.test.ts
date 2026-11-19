import { describe, expect, it } from "vitest";
import { dueText, filterSections, firstName, followUpsText, formatWhen, greeting, groupByCategory, longDate, shortDate, sourceLink } from "@/features/tasks/display";
import { SECTION_ORDER, type Section } from "@/features/tasks/sections";
import type { TaskRow } from "@/features/tasks/queries";

const TODAY = "2026-11-19";

describe("dueText", () => {
  it.each([
    [null, "No due date"],
    ["2026-11-19", "Due today"],
    ["2026-11-20", "Due tomorrow"],
    ["2026-11-22", "Due in 3 days"],
    ["2026-11-26", "Due in 7 days"],
    ["2026-11-18", "1 day late"],
    ["2026-11-07", "12 days late"],
    ["2026-10-19", "31 days late"],
    ["2027-01-01", "Due in 43 days"],
  ])("%s reads %s", (due, text) => {
    expect(dueText(due, TODAY)).toBe(text);
  });
});

describe("greeting", () => {
  // The hour is the India hour, whatever the clock of the machine running it.
  it.each([
    ["2026-11-19T00:29:00Z", "Good morning"], //  5:59 am IST
    ["2026-11-19T00:30:00Z", "Good morning"], //  6:00 am IST
    ["2026-11-19T06:29:00Z", "Good morning"], // 11:59 am IST
    ["2026-11-19T06:30:00Z", "Good afternoon"], // noon IST
    ["2026-11-19T11:29:00Z", "Good afternoon"], // 4:59 pm IST
    ["2026-11-19T11:30:00Z", "Good evening"], // 5:00 pm IST
    ["2026-11-19T18:45:00Z", "Good evening"], // 12:15 am IST, 20 Nov
    ["2026-11-18T23:30:00Z", "Good morning"], // 5:00 am IST
    ["2026-11-18T23:29:00Z", "Good evening"], // 4:59 am IST
  ])("%s is %s", (iso, text) => {
    expect(greeting(new Date(iso))).toBe(text);
  });
});

describe("dates", () => {
  it("writes the long date with its weekday", () => {
    expect(longDate("2026-11-19")).toBe("Thursday 19 November 2026");
    expect(longDate("2026-03-01")).toBe("Sunday 1 March 2026");
    expect(longDate("2028-02-29")).toBe("Tuesday 29 February 2028");
  });

  it("writes the short date", () => {
    expect(shortDate("2026-11-14")).toBe("14 Nov 2026");
    expect(shortDate("2027-01-05")).toBe("5 Jan 2027");
  });

  it("writes an instant on the India clock", () => {
    expect(formatWhen("2026-11-19T10:00:00.000Z")).toBe("19 Nov 2026, 3:30 pm");
    expect(formatWhen("2026-11-19T18:45:00Z")).toBe("20 Nov 2026, 12:15 am");
    expect(formatWhen("2026-11-19T06:30:00Z")).toBe("19 Nov 2026, 12:00 pm");
    expect(formatWhen("2026-11-20T04:30:00+00:00")).toBe("20 Nov 2026, 10:00 am");
    expect(formatWhen("2026-12-31T20:00:00Z")).toBe("1 Jan 2027, 1:30 am");
  });

  it("writes nothing for a time it cannot read", () => {
    expect(formatWhen("soon")).toBe("");
  });
});

describe("words", () => {
  it("takes the first name", () => {
    expect(firstName("Dharmik Patel")).toBe("Dharmik");
    expect(firstName("  Asha ")).toBe("Asha");
    expect(firstName("Madonna")).toBe("Madonna");
  });

  it("counts follow-ups", () => {
    expect(followUpsText(1)).toBe("1 follow-up");
    expect(followUpsText(3)).toBe("3 follow-ups");
  });
});

describe("sourceLink", () => {
  it("names the record and links to its page", () => {
    expect(sourceLink("demo_request", "d1")).toEqual({ label: "Demo request", href: "/demo-requests/d1" });
    expect(sourceLink("invoice", "i1")).toEqual({ label: "Invoice", href: "/invoices/i1" });
    expect(sourceLink("license", "l1")).toEqual({ label: "License", href: "/licenses/l1" });
  });

  it("names a record with no page of its own, without a link", () => {
    expect(sourceLink("sale_milestone", "m1")).toEqual({ label: "Sale milestone", href: null });
  });

  it("says nothing for a task that has no source", () => {
    expect(sourceLink(null, null)).toBeNull();
  });
});

// A task with only what grouping looks at.
const task = (id: string, categoryId: string, over: Partial<TaskRow> = {}): TaskRow =>
  ({
    id, title: id, category_id: categoryId, category_name: `Category ${categoryId}`, category_colour: "#000000", ...over,
  }) as TaskRow;

const emptySections = () => Object.fromEntries(SECTION_ORDER.map((s) => [s, [] as TaskRow[]])) as Record<Section, TaskRow[]>;

const CATEGORIES = [
  { id: "c1", name: "Collections", colour: "#0d9488" },
  { id: "c2", name: "Sales", colour: "#6366f1" },
  { id: "c3", name: "Admin", colour: "#8b5cf6" },
];

function sampleSections() {
  const s = emptySections();
  s.overdue = [task("o1", "c1"), task("o2", "c2")];
  s.today = [task("t1", "c1")];
  s.next7 = [task("n1", "c2"), task("n2", "c1")];
  s.parked = [task("p1", "c1")];
  return s;
}

describe("groupByCategory", () => {
  it("makes one block per category in the given order, each ordered by urgency", () => {
    const blocks = groupByCategory(sampleSections(), CATEGORIES);
    expect(blocks.map((b) => [b.id, b.tasks.map((t) => t.task.id)])).toEqual([
      ["c1", ["o1", "t1", "n2", "p1"]],
      ["c2", ["o2", "n1"]],
    ]);
  });

  it("keeps the section each task is in", () => {
    const blocks = groupByCategory(sampleSections(), CATEGORIES);
    expect(blocks[0]!.tasks.map((t) => t.section)).toEqual(["overdue", "today", "next7", "parked"]);
  });

  it("leaves out a category with no tasks", () => {
    expect(groupByCategory(sampleSections(), CATEGORIES).map((b) => b.id)).not.toContain("c3");
  });

  it("gives a task whose category is not listed a block of its own", () => {
    const s = emptySections();
    s.later = [task("x1", "c9")];
    const blocks = groupByCategory(s, CATEGORIES);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ id: "c9", name: "Category c9", colour: "#000000" });
  });

  it("gives nothing for an empty Desk", () => {
    expect(groupByCategory(emptySections(), CATEGORIES)).toEqual([]);
  });
});

describe("filterSections", () => {
  const ids = (s: Record<Section, TaskRow[]>) => Object.fromEntries(SECTION_ORDER.map((k) => [k, s[k].map((t) => t.id)]));

  it("changes nothing without a filter", () => {
    expect(ids(filterSections(sampleSections()))).toEqual(ids(sampleSections()));
  });

  it("keeps one category's tasks, every section still present", () => {
    expect(ids(filterSections(sampleSections(), { categoryId: "c2" }))).toEqual({
      overdue: ["o2"], followups_due: [], today: [], next7: ["n1"], later: [], parked: [],
    });
  });

  it("keeps one section", () => {
    expect(ids(filterSections(sampleSections(), { section: "next7" }))).toEqual({
      overdue: [], followups_due: [], today: [], next7: ["n1", "n2"], later: [], parked: [],
    });
  });

  it("combines a category and a section", () => {
    expect(ids(filterSections(sampleSections(), { categoryId: "c1", section: "next7" }))).toEqual({
      overdue: [], followups_due: [], today: [], next7: ["n2"], later: [], parked: [],
    });
  });

  it("does not change what it was given", () => {
    const s = sampleSections();
    filterSections(s, { categoryId: "c2", section: "overdue" });
    expect(s.overdue).toHaveLength(2);
    expect(s.today).toHaveLength(1);
  });
});
