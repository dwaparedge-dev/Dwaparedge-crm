import { describe, expect, it } from "vitest";
import {
  createCategorySchema,
  createPrioritySchema,
  listConfigSchema,
  updateCategorySchema,
  updatePrioritySchema,
} from "@/features/tasks/config-schema";

/** Each failed parse as its field path and message, to pin both. */
const issues = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  r.error?.issues.map((i) => ({ path: i.path.join("."), message: i.message })) ?? [];

const category = { name: "Chasing money", colour: "#0d9488" };
const priority = { name: "Urgent", colour: "#dc2626", rank: 1 };

describe("the name", () => {
  it("is cleaned like other free text: control characters become spaces, runs collapse, ends are trimmed", () => {
    expect(createCategorySchema.parse({ ...category, name: "  Sales \u0000 &\n leads  " }).name).toBe("Sales & leads");
    expect(createPrioritySchema.parse({ ...priority, name: "\tVery\u007furgent " }).name).toBe("Very urgent");
  });

  it("is required, at most 60 characters", () => {
    expect(issues(createCategorySchema.safeParse({ colour: category.colour }))).toEqual([{ path: "name", message: "Name is required" }]);
    expect(issues(createCategorySchema.safeParse({ ...category, name: "  \u0000 " }))).toEqual([{ path: "name", message: "Name is required" }]);
    expect(createCategorySchema.safeParse({ ...category, name: "x".repeat(60) }).success).toBe(true);
    expect(issues(createCategorySchema.safeParse({ ...category, name: "x".repeat(61) }))).toEqual([
      { path: "name", message: "Name can be at most 60 characters" },
    ]);
    // Length is counted after cleaning, so padding does not use up the allowance.
    expect(createCategorySchema.safeParse({ ...category, name: `  ${"x".repeat(60)}  ` }).success).toBe(true);
  });
});

describe("the colour", () => {
  it("is #rrggbb, kept in lower case", () => {
    expect(createCategorySchema.parse({ ...category, colour: "#ABCDEF" }).colour).toBe("#abcdef");
    expect(createPrioritySchema.parse({ ...priority, colour: " #1a2B3c " }).colour).toBe("#1a2b3c");
  });

  it("refuses anything else", () => {
    for (const colour of ["red", "#fff", "123456", "#12345", "#1234567", "#12345g", "rgb(1,2,3)", "", "#12 456"]) {
      expect(issues(createCategorySchema.safeParse({ ...category, colour })), colour).toEqual([
        { path: "colour", message: "Use a colour like #1a2b3c" },
      ]);
    }
    expect(createCategorySchema.safeParse({ name: "No colour" }).success).toBe(false);
    expect(createCategorySchema.safeParse({ ...category, colour: 123456 }).success).toBe(false);
  });
});

describe("a new category", () => {
  it("needs only a name and a colour; the cadence and the order are optional", () => {
    expect(createCategorySchema.parse(category)).toEqual(category);
    expect(createCategorySchema.parse({ ...category, defaultFollowUpDays: 3, sortOrder: 25 })).toEqual({ ...category, defaultFollowUpDays: 3, sortOrder: 25 });
  });

  it("takes a default follow-up of 1 to 365 whole days, and a blank means none", () => {
    expect(createCategorySchema.parse({ ...category, defaultFollowUpDays: "" }).defaultFollowUpDays).toBeNull();
    expect(createCategorySchema.parse({ ...category, defaultFollowUpDays: null }).defaultFollowUpDays).toBeNull();
    expect(createCategorySchema.parse({ ...category, defaultFollowUpDays: 365 }).defaultFollowUpDays).toBe(365);
    for (const defaultFollowUpDays of [0, -1, 366, 1.5, "3"]) {
      expect(issues(createCategorySchema.safeParse({ ...category, defaultFollowUpDays })).map((i) => i.path), String(defaultFollowUpDays)).toEqual(["defaultFollowUpDays"]);
    }
  });

  it("takes an order of 0 or more whole numbers", () => {
    expect(createCategorySchema.safeParse({ ...category, sortOrder: 0 }).success).toBe(true);
    for (const sortOrder of [-1, 1.5, 100001, "5"]) {
      expect(createCategorySchema.safeParse({ ...category, sortOrder }).success, String(sortOrder)).toBe(false);
    }
  });

  it("ignores fields the caller must not set", () => {
    const parsed = createCategorySchema.parse({ ...category, key: "hacked", isSystem: true, isActive: false, id: "x", rank: 1 });
    expect(parsed).toEqual(category);
  });
});

describe("a new priority", () => {
  it("needs a name, a colour and a rank", () => {
    expect(createPrioritySchema.parse(priority)).toEqual(priority);
    expect(issues(createPrioritySchema.safeParse({ name: priority.name, colour: priority.colour })).map((i) => i.path)).toEqual(["rank"]);
  });

  it("takes a rank of 1 (most urgent) to 99, whole numbers only", () => {
    expect(createPrioritySchema.parse({ ...priority, rank: 99 }).rank).toBe(99);
    for (const rank of [0, -1, 100, 1.5, "2", null]) {
      expect(issues(createPrioritySchema.safeParse({ ...priority, rank })).map((i) => i.path), String(rank)).toEqual(["rank"]);
    }
  });

  it("ignores a default follow-up (only categories have one)", () => {
    expect(createPrioritySchema.parse({ ...priority, defaultFollowUpDays: 3, isSystem: true })).toEqual(priority);
  });
});

describe("an edit", () => {
  it("changes only what is sent", () => {
    expect(updateCategorySchema.parse({ name: " Pipeline " })).toEqual({ name: "Pipeline" });
    expect(updateCategorySchema.parse({ colour: "#ABCDEF" })).toEqual({ colour: "#abcdef" });
    expect(updateCategorySchema.parse({ sortOrder: 5 })).toEqual({ sortOrder: 5 });
    expect(updateCategorySchema.parse({ isActive: false })).toEqual({ isActive: false });
    expect(updatePrioritySchema.parse({ rank: 2 })).toEqual({ rank: 2 });
  });

  it("clears a category's default follow-up with null or a blank, and validates it like a new one", () => {
    expect(updateCategorySchema.parse({ defaultFollowUpDays: null })).toEqual({ defaultFollowUpDays: null });
    expect(updateCategorySchema.parse({ defaultFollowUpDays: "" })).toEqual({ defaultFollowUpDays: null });
    expect(updateCategorySchema.parse({ defaultFollowUpDays: 7 })).toEqual({ defaultFollowUpDays: 7 });
    expect(updateCategorySchema.safeParse({ defaultFollowUpDays: 0 }).success).toBe(false);
  });

  it("applies the same name, colour and order rules", () => {
    expect(issues(updateCategorySchema.safeParse({ name: "   " }))).toEqual([{ path: "name", message: "Name is required" }]);
    expect(updateCategorySchema.safeParse({ name: "x".repeat(61) }).success).toBe(false);
    expect(updatePrioritySchema.safeParse({ colour: "blue" }).success).toBe(false);
    expect(updatePrioritySchema.safeParse({ sortOrder: -1 }).success).toBe(false);
    expect(updatePrioritySchema.safeParse({ rank: 0 }).success).toBe(false);
  });

  it("takes a real boolean for hiding, not a string", () => {
    expect(updateCategorySchema.safeParse({ isActive: "false" }).success).toBe(false);
    expect(updateCategorySchema.safeParse({ isActive: 0 }).success).toBe(false);
  });

  it("refuses an edit that changes nothing, including one that only names fields the caller cannot set", () => {
    for (const schema of [updateCategorySchema, updatePrioritySchema]) {
      expect(issues(schema.safeParse({}))).toEqual([{ path: "", message: "Nothing to update" }]);
      expect(issues(schema.safeParse({ key: "renamed", isSystem: false, id: "x" }))).toEqual([{ path: "", message: "Nothing to update" }]);
    }
  });

  it("never lets the key or the system flag through", () => {
    expect(updateCategorySchema.parse({ name: "New", key: "renamed", isSystem: false })).toEqual({ name: "New" });
  });

  it("a priority edit ignores a default follow-up and a category edit ignores a rank", () => {
    expect(issues(updatePrioritySchema.safeParse({ defaultFollowUpDays: 3 }))).toEqual([{ path: "", message: "Nothing to update" }]);
    expect(issues(updateCategorySchema.safeParse({ rank: 2 }))).toEqual([{ path: "", message: "Nothing to update" }]);
  });
});

describe("the list", () => {
  it("hides hidden rows unless all=true is asked for", () => {
    expect(listConfigSchema.parse({})).toEqual({});
    expect(listConfigSchema.parse({ all: "true" })).toEqual({ all: "true" });
    expect(listConfigSchema.parse({ all: "false" })).toEqual({ all: "false" });
    expect(listConfigSchema.safeParse({ all: "yes" }).success).toBe(false);
  });
});
