import { beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO_REQUEST_STATUSES, demoRequestInputSchema, demoRequestStatusSchema, listDemoRequestsSchema, normaliseMobile, updateDemoRequestSchema } from "@/features/demo-requests/schema";

const KEY = "k".repeat(40);

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://localhost/test_db";
  process.env.JWT_SECRET = "x".repeat(48);
  process.env.DEMO_INTAKE_KEY = KEY;
});

const valid = { name: "Rajesh Patel", company: "Patel Industries", mobile: "9876543210", email: "rajesh@patel.example" };

describe("demo request schema", () => {
  it("accepts the four form fields and defaults the source", () => {
    const r = demoRequestInputSchema.parse(valid);
    expect(r).toMatchObject({ ...valid, source: "landing" });
    expect(r.entryPoint).toBeUndefined();
  });

  it("trims, collapses spaces, strips control characters and lower-cases the email", () => {
    const r = demoRequestInputSchema.parse({ ...valid, name: "  Raj\u0000esh \n  Patel ", email: "  Rajesh@Patel.Example " });
    expect(r.name).toBe("Raj esh Patel");
    expect(r.email).toBe("rajesh@patel.example");
  });

  it("normalises Indian mobile formats to 10 digits", () => {
    expect(normaliseMobile("+91 98765-43210")).toBe("9876543210");
    expect(normaliseMobile("919876543210")).toBe("9876543210");
    expect(normaliseMobile("09876543210")).toBe("9876543210");
    expect(demoRequestInputSchema.parse({ ...valid, mobile: "+91 98765 43210" }).mobile).toBe("9876543210");
  });

  it("rejects what the form itself would reject, naming the field", () => {
    const bad = (over: Record<string, unknown>) => {
      const r = demoRequestInputSchema.safeParse({ ...valid, ...over });
      return r.success ? [] : r.error.issues.map((i) => i.path[0]);
    };
    expect(bad({ mobile: "1234567890" })).toEqual(["mobile"]); // must start 6-9
    expect(bad({ mobile: "98765" })).toEqual(["mobile"]);
    expect(bad({ email: "not-an-email" })).toEqual(["email"]);
    expect(bad({ name: "   " })).toEqual(["name"]);
    expect(bad({ company: "" })).toEqual(["company"]);
    expect(bad({ name: "x".repeat(121) })).toEqual(["name"]);
    expect(bad({ source: "Has Spaces!" })).toEqual(["source"]);
    expect(bad({ externalRef: "short" })).toEqual(["externalRef"]);
  });

  it("requires every field, and ignores unknown ones", () => {
    expect(demoRequestInputSchema.safeParse({}).error?.issues.map((i) => i.path[0]).sort()).toEqual(["company", "email", "mobile", "name"]);
    expect("status" in demoRequestInputSchema.parse({ ...valid, status: "done", ownerId: "x" })).toBe(false);
  });

  it("turns blank optional text into undefined", () => {
    const r = demoRequestInputSchema.parse({ ...valid, submitterIp: "  ", userAgent: "" });
    expect(r.submitterIp).toBeUndefined();
    expect(r.userAgent).toBeUndefined();
  });
});

describe("intake key", () => {
  const req = (key?: string) => new Request("http://localhost/api/intake/demo-requests", { method: "POST", headers: key === undefined ? {} : { "x-intake-key": key } });

  it("accepts the configured key and rejects a missing, wrong or truncated one with 401", async () => {
    const { requireIntakeKey } = await import("@/lib/auth/intake-key");
    expect(() => requireIntakeKey(req(KEY))).not.toThrow();
    for (const bad of [undefined, "", "wrong", KEY.slice(1), `${KEY}x`]) {
      expect(() => requireIntakeKey(req(bad)), String(bad)).toThrowError(expect.objectContaining({ status: 401 }));
    }
  });
});

describe("intake key not configured", () => {
  it("answers 503 and never matches an empty key", async () => {
    const saved = process.env.DEMO_INTAKE_KEY;
    delete process.env.DEMO_INTAKE_KEY;
    try {
      // getEnv() caches the first parse, so load a fresh copy of both modules.
      vi.resetModules();
      const { requireIntakeKey } = await import("@/lib/auth/intake-key");
      const r = new Request("http://localhost/x", { headers: { "x-intake-key": "" } });
      expect(() => requireIntakeKey(r)).toThrowError(expect.objectContaining({ status: 503 }));
    } finally {
      process.env.DEMO_INTAKE_KEY = saved;
    }
  });
});

describe("proxy and the intake carve-out", () => {
  const call = async (path: string, method = "POST", ip = "198.51.100.1") => {
    const { proxy } = await import("@/proxy");
    const { NextRequest } = await import("next/server");
    return proxy(new NextRequest(`http://localhost:3000${path}`, { method, headers: { "x-real-ip": ip } }));
  };
  // NextResponse.next() marks "continue to the route"; anything else is the proxy answering itself.
  const passesThrough = (r: Response) => r.headers.get("x-middleware-next") === "1";

  it("lets an anonymous call reach only /api/intake/*, and still blocks the rest of the API", async () => {
    expect(passesThrough(await call("/api/intake/demo-requests"))).toBe(true);
    expect((await call("/api/clients", "GET")).status).toBe(401);
    expect((await call("/api/clients/intake/demo-requests")).status).toBe(401);
    expect((await call("/api/intakes/demo-requests")).status).toBe(401);
    expect((await call("/api/intake")).status).toBe(401);
  });

  it("still applies a flood limit to intake, separate from the other API limits", async () => {
    const ip = "198.51.100.77";
    for (let i = 0; i < 60; i++) expect(passesThrough(await call("/api/intake/demo-requests", "POST", ip)), `request ${i + 1}`).toBe(true);
    const blocked = await call("/api/intake/demo-requests", "POST", ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("60");
    // The same address is not locked out of the normal API bucket by intake traffic (it is just unauthenticated).
    expect((await call("/api/clients", "GET", ip)).status).toBe(401);
  });
});

describe("staff schemas", () => {
  const OWNER = "6b1a9d5e-8c43-4f5b-9d39-0f3f3b0f2f11";

  it("list: newest first by default, page size capped, only real statuses", () => {
    expect(listDemoRequestsSchema.parse({})).toMatchObject({ page: 1, pageSize: 20, sort: "created", dir: "desc" });
    expect(listDemoRequestsSchema.parse({ status: "spam", search: "  tally " })).toMatchObject({ status: "spam", search: "tally" });
    expect(listDemoRequestsSchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(listDemoRequestsSchema.safeParse({ status: "all" }).success).toBe(false);
    expect(listDemoRequestsSchema.safeParse({ ownerId: "not-a-uuid" }).success).toBe(false);
    expect(listDemoRequestsSchema.safeParse({ sort: "mobile" }).success).toBe(false);
  });

  it("update: only what is sent, blank clears, NUL bytes go, line breaks stay", () => {
    expect(updateDemoRequestSchema.parse({ notes: "a" })).toEqual({ notes: "a" });
    expect(updateDemoRequestSchema.parse({ ownerId: OWNER })).toEqual({ ownerId: OWNER });
    expect(updateDemoRequestSchema.parse({ ownerId: "", notes: "  " })).toEqual({ ownerId: null, notes: null });
    expect(updateDemoRequestSchema.parse({ ownerId: null })).toEqual({ ownerId: null });
    expect(updateDemoRequestSchema.parse({ notes: "line one\n\nline two\u0000" }).notes).toBe("line one\n\nline two");
  });

  it("update: refuses an empty change, a bad owner, over-long notes and fields it does not own", () => {
    expect(updateDemoRequestSchema.safeParse({}).success).toBe(false);
    expect(updateDemoRequestSchema.safeParse({ ownerId: "someone" }).success).toBe(false);
    expect(updateDemoRequestSchema.safeParse({ notes: "x".repeat(5001) }).success).toBe(false);
    expect(updateDemoRequestSchema.safeParse({ notes: "x".repeat(5000) }).success).toBe(true);
    const parsed = updateDemoRequestSchema.parse({ notes: "a", status: "done", name: "Hijack" });
    expect(parsed).toEqual({ notes: "a" }); // status moves only through its own endpoint
  });

  it("status: exactly the five statuses", () => {
    expect([...DEMO_REQUEST_STATUSES]).toEqual(["new", "contacted", "scheduled", "done", "spam"]);
    for (const status of DEMO_REQUEST_STATUSES) expect(demoRequestStatusSchema.parse({ status })).toEqual({ status });
    expect(demoRequestStatusSchema.safeParse({ status: "converted" }).success).toBe(false);
    expect(demoRequestStatusSchema.safeParse({}).success).toBe(false);
  });
});
