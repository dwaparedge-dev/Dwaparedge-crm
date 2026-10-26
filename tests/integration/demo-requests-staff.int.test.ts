import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, makeUser, uniq, type TestDb } from "./helpers";

// A minimal stand-in for the request's cookie jar (next/headers only works inside a real request).
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
}));

const ORIGIN = "http://localhost:3000";
const hdrs = (extra: Record<string, string> = {}) => ({ origin: ORIGIN, host: "localhost:3000", "content-type": "application/json", ...extra });
const req = (path: string, method = "GET", body?: unknown, headers = hdrs()) =>
  new NextRequest(`${ORIGIN}${path}`, { method, headers, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
const MISSING = "6b1a9d5e-8c43-4f5b-9d39-0f3f3b0f2f11";

let tdb: TestDb;
let staff: { id: string; email: string; password: string };
let colleague: { id: string; email: string; password: string };
beforeAll(async () => {
  tdb = await createTestDb();
  staff = await makeUser("Asha Staff");
  colleague = await makeUser("Ravi Colleague");
});
afterAll(async () => tdb?.drop());

let n = 0;
/** Stores one request the way the website does, with a unique person so nothing is merged as a repeat. */
async function lead(over: Record<string, unknown> = {}) {
  const { createDemoRequest } = await import("@/features/demo-requests/service");
  const { demoRequestInputSchema } = await import("@/features/demo-requests/schema");
  const k = ++n;
  const { id } = await createDemoRequest(demoRequestInputSchema.parse({
    name: `Lead ${k}`, company: uniq("Company"), mobile: String(6000000000 + k * 7919), email: `${uniq("lead")}@example.test`, ...over,
  }));
  return id;
}
const row = async (id: string) => {
  const { db } = await import("@/lib/db");
  return (await db.queryOne<{ status: string; contacted_at: string | null; owner_id: string | null; notes: string | null; updated_at: string }>("SELECT * FROM demo_requests WHERE id = $1", [id]))!;
};
const events = async (id: string) => {
  const { db } = await import("@/lib/db");
  return db.query<{ action: string; summary: string; actor_id: string | null; client_id: string | null; metadata: Record<string, unknown> | null }>(
    "SELECT action, summary, actor_id, client_id, metadata FROM activity_log WHERE entity_type = 'demo_request' AND entity_id = $1 ORDER BY id", [id],
  );
};
const list = async (query: Record<string, unknown> = {}) => {
  const { listDemoRequests } = await import("@/features/demo-requests/service");
  const { listDemoRequestsSchema } = await import("@/features/demo-requests/schema");
  return listDemoRequests(listDemoRequestsSchema.parse(query));
};
const setStatus = async (id: string, status: string, actor = staff.id) => {
  const { setDemoRequestStatus } = await import("@/features/demo-requests/service");
  const { demoRequestStatusSchema } = await import("@/features/demo-requests/schema");
  return setDemoRequestStatus(id, demoRequestStatusSchema.parse({ status }), actor);
};
const update = async (id: string, body: Record<string, unknown>, actor = staff.id) => {
  const { updateDemoRequest } = await import("@/features/demo-requests/service");
  const { updateDemoRequestSchema } = await import("@/features/demo-requests/schema");
  return updateDemoRequest(id, updateDemoRequestSchema.parse(body), actor);
};

describe("listing", () => {
  it("shows newest first, hides spam from the default view, and filters by status", async () => {
    const a = await lead({ name: "Alpha Early" });
    const b = await lead({ name: "Bravo Middle" });
    const c = await lead({ name: "Charlie Late" });
    await setStatus(b, "contacted");
    await setStatus(c, "spam");

    const all = await list();
    const ids = all.items.map((r) => r.id);
    expect(ids).toContain(a);
    expect(ids).toContain(b);
    expect(ids).not.toContain(c);
    expect(ids.indexOf(b)).toBeLessThan(ids.indexOf(a)); // b was created after a

    expect((await list({ status: "spam" })).items.map((r) => r.id)).toEqual([c]);
    const contacted = await list({ status: "contacted" });
    expect(contacted.items.map((r) => r.id)).toEqual([b]);
    expect(contacted.total).toBe(1);
  });

  it("counts every status, with `all` meaning everything except spam", async () => {
    const s = (await list()).summary;
    expect(s.all).toBe(s.new + s.contacted + s.scheduled + s.done);
    expect(s.spam).toBeGreaterThanOrEqual(1);
    expect(s.contacted).toBeGreaterThanOrEqual(1);
  });

  it("searches name, company, mobile and email, and treats % and _ literally", async () => {
    const id = await lead({ name: "Zebulon Quark", company: "Quark_Works 100%", email: "zeb.quark@example.test", mobile: "9000012345" });
    for (const term of ["zebulon", "quark_works", "100%", "zeb.quark@", "00012"]) {
      expect((await list({ search: term })).items.map((r) => r.id), term).toContain(id);
    }
    expect((await list({ search: "%" })).items.map((r) => r.id).includes(id)).toBe(true); // only rows that really contain a %
    expect((await list({ search: "%" })).total).toBe(1);
    expect((await list({ search: "no-such-person-anywhere" })).total).toBe(0);
  });

  it("pages and sorts, and never exposes the visitor's hashed address or browser", async () => {
    for (let i = 0; i < 3; i++) await lead({ submitterIp: "203.0.113.5", userAgent: "TestBrowser/1.0" });
    const first = await list({ pageSize: 2, page: 1, sort: "name", dir: "asc" });
    const second = await list({ pageSize: 2, page: 2, sort: "name", dir: "asc" });
    expect(first.items).toHaveLength(2);
    expect(first.items[0]!.id).not.toBe(second.items[0]!.id);
    expect(first.total).toBe(second.total);
    const names = (await list({ pageSize: 100, sort: "name", dir: "asc" })).items.map((r) => r.name.toLowerCase());
    expect(names).toEqual([...names].sort());
    expect(JSON.stringify(first.items)).not.toMatch(/ip_hash|user_agent|TestBrowser/);
  });
});

describe("one request", () => {
  it("returns the request with its history, newest first", async () => {
    const { getDemoRequest } = await import("@/features/demo-requests/service");
    const id = await lead({ name: "History Person" });
    await setStatus(id, "contacted");
    const r = await getDemoRequest(id);
    expect(r).toMatchObject({ id, name: "History Person", status: "contacted", owner_name: null });
    expect(r.events.map((e) => e.action)).toEqual(["status_changed", "created"]);
    expect(r.events[0]).toMatchObject({ actor_name: "Asha Staff" });
    expect(r.events[1]).toMatchObject({ actor_name: null }); // created by the website, no staff member
    expect(JSON.stringify(r)).not.toMatch(/ip_hash|user_agent/);
    await expect(getDemoRequest(MISSING)).rejects.toMatchObject({ status: 404 });
  });
});

describe("status", () => {
  it("records the first contact once and never erases it, whichever way the request moves", async () => {
    const id = await lead();
    expect((await row(id)).contacted_at).toBeNull();
    await setStatus(id, "contacted");
    const first = (await row(id)).contacted_at;
    expect(first).not.toBeNull();
    await setStatus(id, "scheduled");
    await setStatus(id, "done");
    await setStatus(id, "new"); // reopened
    const after = await row(id);
    expect(after.status).toBe("new");
    expect(after.contacted_at).toEqual(first);
  });

  it("does not count spam, or a request still new, as contact", async () => {
    const id = await lead();
    await setStatus(id, "spam");
    expect((await row(id)).contacted_at).toBeNull();
    await setStatus(id, "new"); // wrongly marked, reopened
    expect((await row(id)).status).toBe("new");
  });

  it("logs who moved it and from where to where, and refuses a move to the same status", async () => {
    const id = await lead();
    await setStatus(id, "scheduled", colleague.id);
    const log = (await events(id)).at(-1)!;
    expect(log).toMatchObject({ action: "status_changed", actor_id: colleague.id, client_id: null, metadata: { from: "new", to: "scheduled" } });
    expect(log.summary).toMatch(/moved from New to Scheduled/);
    await expect(setStatus(id, "scheduled")).rejects.toMatchObject({ status: 409, code: "INVALID_TRANSITION" });
    expect(await events(id)).toHaveLength(2); // created + the one move
    await expect(setStatus(MISSING, "done")).rejects.toMatchObject({ status: 404 });
  });
});

describe("owner and notes", () => {
  it("assigns and unassigns an owner, logging each change", async () => {
    const id = await lead();
    await update(id, { ownerId: colleague.id });
    expect((await row(id)).owner_id).toBe(colleague.id);
    expect((await events(id)).at(-1)!.summary).toMatch(/assigned to Ravi Colleague/);
    await update(id, { ownerId: "" });
    expect((await row(id)).owner_id).toBeNull();
    expect((await events(id)).at(-1)!.summary).toMatch(/unassigned/);
  });

  it("changes only what is sent, keeps line breaks, strips NUL bytes and clears with a blank", async () => {
    const id = await lead();
    await update(id, { ownerId: staff.id });
    await update(id, { notes: "Call back Friday\n\nUses Tally today\u0000" });
    let r = await row(id);
    expect(r.owner_id).toBe(staff.id); // untouched by the notes-only update
    expect(r.notes).toBe("Call back Friday\n\nUses Tally today");
    await update(id, { notes: "   " });
    r = await row(id);
    expect(r.notes).toBeNull();
    expect(r.owner_id).toBe(staff.id);
  });

  it("logs nothing when nothing changed", async () => {
    const id = await lead();
    await update(id, { notes: "same" });
    const before = (await events(id)).length;
    const stamp = (await row(id)).updated_at;
    await update(id, { notes: "same" });
    await update(id, { ownerId: null });
    expect(await events(id)).toHaveLength(before);
    expect((await row(id)).updated_at).toEqual(stamp);
  });

  it("only lets an active staff member own a request", async () => {
    const { db } = await import("@/lib/db");
    const id = await lead();
    const gone = await makeUser("Left Company");
    await db.query("UPDATE users SET is_active = false WHERE id = $1", [gone.id]);
    await expect(update(id, { ownerId: gone.id })).rejects.toMatchObject({ status: 422 });
    await expect(update(id, { ownerId: MISSING })).rejects.toMatchObject({ status: 422 });
    expect((await row(id)).owner_id).toBeNull();
    await expect(update(MISSING, { notes: "x" })).rejects.toMatchObject({ status: 404 });
  });
});

describe("the routes", () => {
  const login = async (u = staff) => {
    jar.clear();
    const { POST } = await import("@/app/api/auth/login/route");
    expect((await POST(req("/api/auth/login", "POST", { email: u.email, password: u.password }))).status).toBe(200);
  };

  it("turn an anonymous caller away on every method", async () => {
    jar.clear();
    const id = await lead();
    const list = await import("@/app/api/demo-requests/route");
    const summary = await import("@/app/api/demo-requests/summary/route");
    const one = await import("@/app/api/demo-requests/[id]/route");
    const status = await import("@/app/api/demo-requests/[id]/status/route");
    const params = { params: Promise.resolve({ id }) };
    expect((await list.GET(req("/api/demo-requests"))).status).toBe(401);
    expect((await summary.GET()).status).toBe(401);
    expect((await one.GET(req(`/api/demo-requests/${id}`), params)).status).toBe(401);
    expect((await one.PATCH(req(`/api/demo-requests/${id}`, "PATCH", { notes: "x" }), params)).status).toBe(401);
    expect((await status.POST(req(`/api/demo-requests/${id}/status`, "POST", { status: "done" }), params)).status).toBe(401);
    expect((await row(id)).status).toBe("new");
  });

  it("serve a signed-in user, and refuse bad ids, bad input and cross-origin writes", async () => {
    await login();
    const id = await lead({ name: "Route Person" });
    const list = await import("@/app/api/demo-requests/route");
    const summary = await import("@/app/api/demo-requests/summary/route");
    const one = await import("@/app/api/demo-requests/[id]/route");
    const status = await import("@/app/api/demo-requests/[id]/status/route");
    const params = (v: string) => ({ params: Promise.resolve({ id: v }) });

    const l = await list.GET(req("/api/demo-requests?search=Route%20Person"));
    expect(l.status).toBe(200);
    expect((await l.json()).items.map((r: { id: string }) => r.id)).toEqual([id]);
    expect(await (await summary.GET()).json()).toMatchObject({ new: expect.any(Number), all: expect.any(Number) });
    expect((await one.GET(req(`/api/demo-requests/${id}`), params(id))).status).toBe(200);

    expect((await one.GET(req("/api/demo-requests/nope"), params("nope"))).status).toBe(422);
    expect((await one.GET(req(`/api/demo-requests/${MISSING}`), params(MISSING))).status).toBe(404);
    expect((await list.GET(req("/api/demo-requests?status=bogus"))).status).toBe(422);
    expect((await list.GET(req("/api/demo-requests?pageSize=1000"))).status).toBe(422);
    expect((await one.PATCH(req(`/api/demo-requests/${id}`, "PATCH", {}), params(id))).status).toBe(422); // nothing to update
    expect((await one.PATCH(req(`/api/demo-requests/${id}`, "PATCH", { notes: "x".repeat(5001) }), params(id))).status).toBe(422);
    expect((await status.POST(req(`/api/demo-requests/${id}/status`, "POST", { status: "bogus" }), params(id))).status).toBe(422);

    const evil = hdrs({ origin: "http://evil.example" });
    const crossStatus = await status.POST(req(`/api/demo-requests/${id}/status`, "POST", { status: "done" }, evil), params(id));
    expect(crossStatus.status).toBe(403);
    expect((await one.PATCH(req(`/api/demo-requests/${id}`, "PATCH", { notes: "evil" }, evil), params(id))).status).toBe(403);
    expect((await one.PATCH(req(`/api/demo-requests/${id}`, "PATCH", { notes: "x" }, hdrs({ "content-type": "text/plain" })), params(id))).status).toBe(415);
    expect((await row(id)).status).toBe("new");

    expect((await status.POST(req(`/api/demo-requests/${id}/status`, "POST", { status: "contacted" }), params(id))).status).toBe(200);
    expect((await status.POST(req(`/api/demo-requests/${id}/status`, "POST", { status: "contacted" }), params(id))).status).toBe(409);
    expect((await one.PATCH(req(`/api/demo-requests/${id}`, "PATCH", { ownerId: colleague.id, notes: "Spoke to the owner" }), params(id))).status).toBe(200);
    const after = await (await one.GET(req(`/api/demo-requests/${id}`), params(id))).json();
    expect(after).toMatchObject({ status: "contacted", owner_name: "Ravi Colleague", notes: "Spoke to the owner" });
    expect(after.events.map((e: { action: string }) => e.action)).toEqual(["notes_updated", "assigned", "status_changed", "created"]);
  });
});

describe("dashboard", () => {
  it("counts the requests still waiting for a first call", async () => {
    const { getDashboard, dashboardQuerySchema } = await import("@/features/dashboard/service");
    const { demoRequestSummary } = await import("@/features/demo-requests/service");
    const waiting = (await demoRequestSummary()).new;
    const d = await getDashboard(dashboardQuerySchema.parse({ from: "2026-10-01", to: "2026-10-31" }));
    expect(d.demoRequests).toEqual({ new: waiting });
    await lead();
    expect((await getDashboard(dashboardQuerySchema.parse({ from: "2026-10-01", to: "2026-10-31" }))).demoRequests.new).toBe(waiting + 1);
  });
});
