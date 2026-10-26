import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, uniq, type TestDb } from "./helpers";

const KEY = "integration-intake-key-integration-intake-key";
const URL = "http://localhost:3000/api/intake/demo-requests";

let tdb: TestDb;
beforeAll(async () => {
  tdb = await createTestDb();
  process.env.DEMO_INTAKE_KEY = KEY;
});
afterAll(async () => tdb?.drop());

const payload = (over: Record<string, unknown> = {}) => {
  const n = uniq("lead");
  return { name: "Rajesh Patel", company: `Patel ${n}`, mobile: String(6000000000 + Math.floor(Math.random() * 3999999999)), email: `${n}@patel.example`, ...over };
};
const post = async (body: unknown, headers: Record<string, string> = { "content-type": "application/json", "x-intake-key": KEY }) => {
  const { POST } = await import("@/app/api/intake/demo-requests/route");
  return POST(new NextRequest(URL, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
};
const rows = async (where: string, values: unknown[]) => {
  const { db } = await import("@/lib/db");
  return db.query<{ id: string; status: string; repeat_count: number; mobile: string; email: string; ip_hash: string | null; source: string }>(`SELECT * FROM demo_requests WHERE ${where}`, values);
};

describe("POST /api/intake/demo-requests", () => {
  it("stores a valid request as new, with an activity row and no raw address", async () => {
    const body = payload({ mobile: "+91 98765 43210", email: "Mixed@Case.Example", submitterIp: "203.0.113.9", entryPoint: "hero" });
    const res = await post(body);
    expect(res.status).toBe(201);
    const { id, duplicate } = await res.json();
    expect(duplicate).toBe(false);

    const [row] = await rows("id = $1", [id]);
    expect(row).toMatchObject({ status: "new", mobile: "9876543210", email: "mixed@case.example", source: "landing", repeat_count: 0 });
    expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain("203.0.113.9");

    const { db } = await import("@/lib/db");
    const log = await db.query<{ action: string; actor_id: string | null; client_id: string | null }>("SELECT * FROM activity_log WHERE entity_type = 'demo_request' AND entity_id = $1", [id]);
    expect(log).toEqual([expect.objectContaining({ action: "created", actor_id: null, client_id: null })]);
  });

  it("answers 401 without touching the database when the key is missing or wrong", async () => {
    const body = payload();
    for (const key of [undefined, "", "wrong-key", KEY.slice(0, -1)]) {
      const res = await post(body, { "content-type": "application/json", ...(key === undefined ? {} : { "x-intake-key": key }) });
      expect(res.status).toBe(401);
    }
    expect(await rows("email = $1", [body.email])).toHaveLength(0);
  });

  it("answers 503 when no key is configured, even for an empty key header", async () => {
    delete process.env.DEMO_INTAKE_KEY;
    vi.resetModules();
    try {
      const res = await post(payload(), { "content-type": "application/json", "x-intake-key": "" });
      expect(res.status).toBe(503);
    } finally {
      process.env.DEMO_INTAKE_KEY = KEY;
      vi.resetModules();
    }
  });

  it("answers 422 with the field names, and stores nothing", async () => {
    const res = await post({ name: "", company: "Acme", mobile: "123", email: "nope" });
    expect(res.status).toBe(422);
    const issues = (await res.json()).error.issues as { path: string[] }[];
    expect(issues.map((i) => i.path[0]).sort()).toEqual(["email", "mobile", "name"]);
  });

  it("rejects a body that is not JSON (415), malformed (400) or oversized (413)", async () => {
    expect((await post("name=x", { "content-type": "text/plain", "x-intake-key": KEY })).status).toBe(415);
    expect((await post("{not json")).status).toBe(400);
    expect((await post(payload({ company: "x".repeat(9000) }))).status).toBe(413);
  });

  it("treats a retry of the same attempt as the same request", async () => {
    const body = payload({ externalRef: uniq("attempt").padEnd(12, "x") });
    const first = await post(body);
    const retry = await post(body);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    const a = await first.json();
    const b = await retry.json();
    expect(b).toEqual({ id: a.id, duplicate: true });
    const [row] = await rows("id = $1", [a.id]);
    expect(row.repeat_count).toBe(0); // a retry is not the person asking again
  });

  it("copes with concurrent retries of one attempt: one row, every caller gets its id", async () => {
    const externalRef = uniq("race").padEnd(12, "x");
    const body = payload({ externalRef });
    const results = await Promise.all([post(body), post(body), post(body)]);
    const ids = new Set((await Promise.all(results.map((r) => r.json()))).map((j) => j.id));
    expect(ids.size).toBe(1);
    expect(await rows("external_ref = $1", [externalRef])).toHaveLength(1);
  });

  it("counts the same email or mobile asking again within a day instead of adding a row", async () => {
    const body = payload();
    const first = await (await post(body)).json();
    const sameEmail = await post({ ...body, mobile: "9123456780", name: "Someone Else" });
    const sameMobile = await post({ ...body, email: `${uniq("other")}@patel.example` });
    expect(sameEmail.status).toBe(200);
    expect(sameMobile.status).toBe(200);
    expect((await sameEmail.json()).id).toBe(first.id);
    expect((await sameMobile.json()).id).toBe(first.id);
    const [row] = await rows("id = $1", [first.id]);
    expect(row.repeat_count).toBe(2);
    expect(await rows("email = $1", [body.email])).toHaveLength(1);
  });

  it("stores a new request when the earlier one is older than a day or was marked spam", async () => {
    const { db } = await import("@/lib/db");
    const old = payload();
    const oldId = (await (await post(old)).json()).id;
    await db.query("UPDATE demo_requests SET created_at = now() - interval '25 hours' WHERE id = $1", [oldId]);
    const again = await post(old);
    expect(again.status).toBe(201);
    expect((await again.json()).id).not.toBe(oldId);

    const spam = payload();
    const spamId = (await (await post(spam)).json()).id;
    await db.query("UPDATE demo_requests SET status = 'spam' WHERE id = $1", [spamId]);
    const afterSpam = await post(spam);
    expect(afterSpam.status).toBe(201);
    expect((await afterSpam.json()).id).not.toBe(spamId);
  });

  it("stores awkward text safely (quotes, markup, unicode) without executing or altering it", async () => {
    const nasty = `Robert'); DROP TABLE demo_requests;-- <script>alert(1)</script> ગુજરાત`;
    const res = await post(payload({ company: nasty }));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const { db } = await import("@/lib/db");
    const [row] = await db.query<{ company: string }>("SELECT company FROM demo_requests WHERE id = $1", [id]);
    expect(row.company).toBe(nasty);
  });
});
