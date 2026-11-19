import { describe, expect, it } from "vitest";
import { PERMISSIONS, cleanPermissions, hasPermission, isPermission } from "@/lib/auth/permissions";

describe("hasPermission", () => {
  it("lets edit_all stand in for view_all", () => {
    expect(hasPermission(["tasks.edit_all"], "tasks.view_all")).toBe(true);
  });

  it("does not let view_all stand in for edit_all", () => {
    expect(hasPermission(["tasks.view_all"], "tasks.edit_all")).toBe(false);
  });

  it("grants nothing to a user holding no permissions", () => {
    for (const p of PERMISSIONS) expect(hasPermission([], p)).toBe(false);
  });

  it("grants nothing for an unknown key", () => {
    expect(hasPermission(["tasks.bogus"], "tasks.view_all")).toBe(false);
  });

  it("grants a key that is held directly", () => {
    expect(hasPermission(["tasks.assign"], "tasks.assign")).toBe(true);
  });
});

describe("cleanPermissions", () => {
  it("drops unknown keys, dedupes, and returns PERMISSIONS order", () => {
    expect(cleanPermissions(["tasks.assign", "nope", "tasks.assign", "tasks.view_all"])).toEqual([
      "tasks.view_all",
      "tasks.assign",
    ]);
  });
});

describe("isPermission", () => {
  it("accepts a known key and rejects anything else", () => {
    expect(isPermission("tasks.assign")).toBe(true);
    expect(isPermission(5)).toBe(false);
  });
});
