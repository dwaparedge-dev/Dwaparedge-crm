import { describe, expect, it } from "vitest";
import { deleteBlockedReason, moveRow } from "@/features/tasks/config-view";

const rows = (...orders: number[]) => orders.map((sort_order, i) => ({ id: `r${i}`, sort_order }));

describe("moveRow", () => {
  it("swaps the two sort orders when moving a row up", () => {
    expect(moveRow(rows(10, 20, 30), 1, -1)).toEqual([
      { id: "r1", sortOrder: 10 },
      { id: "r0", sortOrder: 20 },
    ]);
  });

  it("swaps the two sort orders when moving a row down", () => {
    expect(moveRow(rows(10, 20, 30), 1, 1)).toEqual([
      { id: "r2", sortOrder: 20 },
      { id: "r1", sortOrder: 30 },
    ]);
  });

  it("changes only the two rows, whatever the numbers are", () => {
    expect(moveRow(rows(0, 1, 2, 3), 2, -1)).toEqual([
      { id: "r2", sortOrder: 1 },
      { id: "r1", sortOrder: 2 },
    ]);
  });

  it("changes nothing past either end", () => {
    expect(moveRow(rows(10, 20, 30), 0, -1)).toEqual([]);
    expect(moveRow(rows(10, 20, 30), 2, 1)).toEqual([]);
    expect(moveRow(rows(10), 0, 1)).toEqual([]);
    expect(moveRow([], 0, 1)).toEqual([]);
  });

  it("changes nothing for an index that is not a row", () => {
    expect(moveRow(rows(10, 20), -1, 1)).toEqual([]);
    expect(moveRow(rows(10, 20), 5, -1)).toEqual([]);
  });

  it("numbers the whole list when two rows share a sort order, because a swap would move nothing", () => {
    // All three are 10. Moving r1 up must put it first: r1 stays 10, r0 goes to 20 and r2 to 30.
    expect(moveRow(rows(10, 10, 10), 1, -1)).toEqual([
      { id: "r0", sortOrder: 20 },
      { id: "r2", sortOrder: 30 },
    ]);
  });

  it("saves only the rows whose number changes when renumbering", () => {
    // 10, 10, 20 with r0 moved down is r1 10, r0 20, r2 30: r1 keeps 10, r0 goes 10 to 20, r2 goes 20 to 30.
    expect(moveRow(rows(10, 10, 20), 0, 1)).toEqual([
      { id: "r0", sortOrder: 20 },
      { id: "r2", sortOrder: 30 },
    ]);
  });
});

describe("deleteBlockedReason", () => {
  it("can be deleted when no task uses it (starter rows too)", () => {
    expect(deleteBlockedReason({ in_use: false }, "category")).toBeNull();
    expect(deleteBlockedReason({ in_use: false }, "priority")).toBeNull();
  });

  it("says a row that tasks use is hidden instead", () => {
    expect(deleteBlockedReason({ in_use: true }, "category")).toBe("Tasks use this category. Hide it instead.");
    expect(deleteBlockedReason({ in_use: true }, "priority")).toBe("Tasks use this priority. Hide it instead.");
  });
});
