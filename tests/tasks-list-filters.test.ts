import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, apiQuery, filtersToQuery, hasNarrowingFilters, parseFilters, type TaskListFilters } from "@/features/tasks/list-filters";

const CATEGORY = "11111111-1111-4111-8111-111111111111";
const PRIORITY = "22222222-2222-4222-8222-222222222222";
const OWNER = "33333333-3333-4333-8333-333333333333";
const CLIENT = "44444444-4444-4444-8444-444444444444";

const read = (query: string) => parseFilters(new URLSearchParams(query));
const withFilters = (changes: Partial<TaskListFilters>): TaskListFilters => ({ ...DEFAULT_FILTERS, ...changes });

describe("parseFilters", () => {
  it("is the default view for an empty address", () => {
    expect(read("")).toEqual({
      status: "active", categoryId: "", priorityId: "", ownerId: "", clientId: "", origin: "", dueFrom: "", dueTo: "", search: "", page: 1, pageSize: 20,
    });
  });

  it("reads every filter", () => {
    const query = `status=waiting&category=${CATEGORY}&priority=${PRIORITY}&owner=${OWNER}&client=${CLIENT}&source=auto&from=2026-11-01&to=2026-11-30&q=sharma&page=3&size=50`;
    expect(read(query)).toEqual({
      status: "waiting", categoryId: CATEGORY, priorityId: PRIORITY, ownerId: OWNER, clientId: CLIENT, origin: "auto",
      dueFrom: "2026-11-01", dueTo: "2026-11-30", search: "sharma", page: 3, pageSize: 50,
    });
  });

  it("takes the two status groups and every single status", () => {
    for (const s of ["active", "closed", "open", "in_progress", "waiting", "done", "cancelled"]) expect(read(`status=${s}`).status).toBe(s);
  });

  it("takes unassigned as an owner", () => {
    expect(read("owner=unassigned").ownerId).toBe("unassigned");
  });

  it("drops a status the API would refuse", () => {
    expect(read("status=finished").status).toBe("active");
    expect(read("status=").status).toBe("active");
  });

  it("drops ids that are not ids", () => {
    const f = read("category=abc&priority=123&owner=everyone&client=11111111-1111");
    expect([f.categoryId, f.priorityId, f.ownerId, f.clientId]).toEqual(["", "", "", ""]);
  });

  it("drops a source other than manual or auto", () => {
    expect(read("source=import").origin).toBe("");
    expect(read("source=manual").origin).toBe("manual");
  });

  it("drops dates that are not real days", () => {
    expect(read("from=2026-02-30&to=tomorrow")).toMatchObject({ dueFrom: "", dueTo: "" });
    expect(read("from=2026-02-28")).toMatchObject({ dueFrom: "2026-02-28" });
  });

  it("trims the search and keeps it to the 100 characters the API takes", () => {
    expect(read("q=%20%20sharma%20%20").search).toBe("sharma");
    expect(read(`q=${"a".repeat(150)}`).search).toBe("a".repeat(100));
  });

  it("keeps the page number a positive whole number", () => {
    expect([read("page=0").page, read("page=-2").page, read("page=2.5").page, read("page=abc").page, read("page=7").page]).toEqual([1, 1, 1, 1, 7]);
  });

  it("keeps the page size to the 100 the API allows, and 20 when it is unusable", () => {
    expect([read("size=500").pageSize, read("size=100").pageSize, read("size=0").pageSize, read("size=x").pageSize, read("size=10").pageSize]).toEqual([100, 100, 20, 20, 10]);
  });
});

describe("filtersToQuery", () => {
  it("is empty for the default view, so a plain view has a plain address", () => {
    expect(filtersToQuery(DEFAULT_FILTERS)).toBe("");
  });

  it("writes only what differs from the default", () => {
    expect(filtersToQuery(withFilters({ status: "closed" }))).toBe("status=closed");
    expect(filtersToQuery(withFilters({ page: 2, pageSize: 50 }))).toBe("page=2&size=50");
  });

  it("writes every filter, in a fixed order", () => {
    const f = withFilters({
      status: "waiting", categoryId: CATEGORY, priorityId: PRIORITY, ownerId: OWNER, clientId: CLIENT, origin: "manual",
      dueFrom: "2026-11-01", dueTo: "2026-11-30", search: "sharma traders", page: 3, pageSize: 50,
    });
    expect(filtersToQuery(f)).toBe(
      `status=waiting&category=${CATEGORY}&priority=${PRIORITY}&owner=${OWNER}&client=${CLIENT}&source=manual&from=2026-11-01&to=2026-11-30&q=sharma+traders&page=3&size=50`,
    );
  });

  it("leaves the default status out, even with other filters", () => {
    expect(filtersToQuery(withFilters({ ownerId: "unassigned" }))).toBe("owner=unassigned");
  });

  it("round-trips: what is written reads back as the same filters", () => {
    const f = withFilters({ status: "done", categoryId: CATEGORY, ownerId: "unassigned", search: "a&b=c d", dueFrom: "2026-01-01", page: 4, pageSize: 25 });
    expect(read(filtersToQuery(f))).toEqual(f);
  });
});

describe("apiQuery", () => {
  it("asks for the active tasks, soonest deadline first, 20 to a page", () => {
    expect(apiQuery(DEFAULT_FILTERS, "mine")).toBe("scope=mine&status=active&sort=due&dir=asc&page=1&pageSize=20");
  });

  it("asks for the closed tasks, most recently changed first", () => {
    for (const status of ["closed", "done", "cancelled"] as const) {
      expect(apiQuery(withFilters({ status }), "all")).toBe(`scope=all&status=${status}&sort=updated&dir=desc&page=1&pageSize=20`);
    }
    expect(apiQuery(withFilters({ status: "waiting" }), "all")).toContain("sort=due&dir=asc");
  });

  it("names every filter the way the API does", () => {
    const f = withFilters({
      status: "open", categoryId: CATEGORY, priorityId: PRIORITY, ownerId: OWNER, clientId: CLIENT, origin: "auto",
      dueFrom: "2026-11-01", dueTo: "2026-11-30", search: "100%", page: 2, pageSize: 100,
    });
    expect(apiQuery(f, "all")).toBe(
      `scope=all&status=open&categoryId=${CATEGORY}&priorityId=${PRIORITY}&ownerId=${OWNER}&clientId=${CLIENT}&origin=auto&dueFrom=2026-11-01&dueTo=2026-11-30&search=100%25&sort=due&dir=asc&page=2&pageSize=100`,
    );
  });

  it("does not send an owner when the user can only see their own tasks", () => {
    expect(apiQuery(withFilters({ ownerId: OWNER }), "mine")).toBe("scope=mine&status=active&sort=due&dir=asc&page=1&pageSize=20");
  });

  it("sends unassigned as an owner for someone who may see everyone's", () => {
    expect(apiQuery(withFilters({ ownerId: "unassigned" }), "all")).toBe("scope=all&status=active&ownerId=unassigned&sort=due&dir=asc&page=1&pageSize=20");
  });
});

describe("hasNarrowingFilters", () => {
  it("is false for the status tab and the paging alone", () => {
    expect(hasNarrowingFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasNarrowingFilters(withFilters({ status: "closed", page: 3, pageSize: 50 }))).toBe(false);
  });

  it("is true when any other filter is set", () => {
    for (const changes of [{ categoryId: CATEGORY }, { priorityId: PRIORITY }, { ownerId: "unassigned" }, { clientId: CLIENT }, { origin: "auto" as const }, { dueFrom: "2026-11-01" }, { dueTo: "2026-11-30" }, { search: "x" }]) {
      expect(hasNarrowingFilters(withFilters(changes))).toBe(true);
    }
  });
});
