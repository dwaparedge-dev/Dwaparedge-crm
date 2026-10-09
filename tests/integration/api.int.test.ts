import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, makeUser, type TestDb } from "./helpers";

// A minimal stand-in for the request's cookie jar (next/headers only works inside a real request).
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
}));

let tdb: TestDb;
const ORIGIN = "http://localhost:3000";
const hdrs = (extra: Record<string, string> = {}) => ({ origin: ORIGIN, host: "localhost:3000", "content-type": "application/json", ...extra });
const req = (path: string, method = "GET", body?: unknown, headers = hdrs()) =>
  new NextRequest(`${ORIGIN}${path}`, { method, headers, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });

beforeAll(async () => {
  tdb = await createTestDb();
});
afterAll(async () => tdb?.drop());

async function loginAs(email: string, password: string) {
  const { POST } = await import("@/app/api/auth/login/route");
  return POST(req("/api/auth/login", "POST", { email, password }));
}
const clientsGet = async () => (await import("@/app/api/clients/route")).GET(req("/api/clients"));

describe("authentication", () => {
  it("rejects a wrong password and an unknown email with the same answer", async () => {
    const u = await makeUser();
    const wrong = await loginAs(u.email, "not-the-password");
    const unknown = await loginAs("nobody@test.example", "not-the-password");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });
  it("signs in, then lets the session read data", async () => {
    jar.clear();
    const u = await makeUser();
    expect((await clientsGet()).status).toBe(401);
    expect((await loginAs(u.email, u.password)).status).toBe(200);
    expect(jar.get("de_session")).toBeTruthy();
    expect((await clientsGet()).status).toBe(200);
  });
  it("locks an account after repeated failures, even for the right password", async () => {
    jar.clear();
    const u = await makeUser();
    for (let i = 0; i < 5; i++) expect((await loginAs(u.email, "wrong-password-x")).status).toBe(401);
    const r = await loginAs(u.email, u.password);
    expect(r.status).toBe(429);
    expect(jar.has("de_session")).toBe(false);
  });
  it("rejects forged, tampered and expired tokens", async () => {
    const { SignJWT } = await import("jose");
    const u = await makeUser();
    const forged = await new SignJWT({ tv: 0 }).setProtectedHeader({ alg: "HS256" }).setSubject(u.id).setExpirationTime("1h").sign(new TextEncoder().encode("x".repeat(48)));
    jar.set("de_session", forged);
    expect((await clientsGet()).status).toBe(401);
    const expired = await new SignJWT({ tv: 0 }).setProtectedHeader({ alg: "HS256" }).setSubject(u.id).setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(new TextEncoder().encode(process.env.JWT_SECRET!));
    jar.set("de_session", expired);
    expect((await clientsGet()).status).toBe(401);
    jar.set("de_session", "garbage");
    expect((await clientsGet()).status).toBe(401);
  });
  it("ends the session when the user is deactivated or signs out", async () => {
    const { db } = await import("@/lib/db");
    jar.clear();
    const u = await makeUser();
    await loginAs(u.email, u.password);
    const token = jar.get("de_session")!;
    expect((await clientsGet()).status).toBe(200);
    await db.query("UPDATE users SET is_active = false WHERE id = $1", [u.id]);
    expect((await clientsGet()).status).toBe(401);
    await db.query("UPDATE users SET is_active = true WHERE id = $1", [u.id]);
    expect((await clientsGet()).status).toBe(200);
    const { POST: logout } = await import("@/app/api/auth/logout/route");
    expect((await logout(req("/api/auth/logout", "POST"))).status).toBe(200);
    jar.set("de_session", token); // replay the old cookie
    expect((await clientsGet()).status).toBe(401);
  });
  it("changes the password, ends other sessions and requires the current password", async () => {
    jar.clear();
    const u = await makeUser();
    await loginAs(u.email, u.password);
    const old = jar.get("de_session")!;
    const { POST } = await import("@/app/api/auth/change-password/route");
    expect((await POST(req("/api/auth/change-password", "POST", { currentPassword: "wrong-one", newPassword: "a-brand-new-password" }))).status).toBe(403);
    expect((await POST(req("/api/auth/change-password", "POST", { currentPassword: u.password, newPassword: "short" }))).status).toBe(422);
    expect((await POST(req("/api/auth/change-password", "POST", { currentPassword: u.password, newPassword: "a-brand-new-password" }))).status).toBe(200);
    expect((await clientsGet()).status).toBe(200); // this session was re-issued
    jar.set("de_session", old);
    expect((await clientsGet()).status).toBe(401); // the previous one is dead
    jar.clear();
    expect((await loginAs(u.email, u.password)).status).toBe(401);
    expect((await loginAs(u.email, "a-brand-new-password")).status).toBe(200);
  });
});

describe("request protection", () => {
  it("blocks cross-origin and non-JSON mutations before doing anything", async () => {
    jar.clear();
    const u = await makeUser();
    await loginAs(u.email, u.password);
    const { POST } = await import("@/app/api/clients/route");
    const cross = await POST(req("/api/clients", "POST", { legalName: "Evil" }, hdrs({ origin: "http://evil.example" })));
    expect(cross.status).toBe(403);
    expect((await cross.json()).error.code).toBe("CSRF");
    const noOrigin = await POST(new NextRequest(`${ORIGIN}/api/clients`, { method: "POST", headers: { host: "localhost:3000", "content-type": "application/json" }, body: "{}" }));
    expect(noOrigin.status).toBe(403);
    const form = await POST(req("/api/clients", "POST", {}, hdrs({ "content-type": "text/plain" })));
    expect(form.status).toBe(415);
  });
  it("returns 400 for malformed JSON and 422 with field errors for invalid input", async () => {
    jar.clear();
    const u = await makeUser();
    await loginAs(u.email, u.password);
    const { POST } = await import("@/app/api/clients/route");
    const bad = await POST(new NextRequest(`${ORIGIN}/api/clients`, { method: "POST", headers: hdrs(), body: "{not json" }));
    expect(bad.status).toBe(400);
    const invalid = await POST(req("/api/clients", "POST", { legalName: "", gstin: "BAD" }));
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).error.issues.map((i: { path: string[] }) => i.path[0])).toEqual(expect.arrayContaining(["legalName", "gstin"]));
  });
});

describe("every protected endpoint requires a login", () => {
  const PUBLIC = new Set(["auth/login", "auth/logout"]);
  const root = join(process.cwd(), "src", "app", "api");
  const routes: string[] = [];
  (function walk(dir: string) {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f === "route.ts") routes.push(p);
    }
  })(root);

  it("finds the API routes", () => {
    expect(routes.length).toBeGreaterThan(20);
  });
  it("answers 401 to an anonymous caller on every method of every route", async () => {
    jar.clear();
    const uuid = "6b1a9d5e-8c43-4f5b-9d39-0f3f3b0f2f11";
    const params = Promise.resolve({ id: uuid, contactId: uuid, key: "clients" });
    const failures: string[] = [];
    for (const file of routes) {
      const rel = file.slice(root.length + 1).replace(/\/route\.ts$/, "");
      if (PUBLIC.has(rel)) continue;
      const mod = (await import(/* @vite-ignore */ file)) as Record<string, (r: NextRequest, c: { params: Promise<unknown> }) => Promise<Response>>;
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
        const handler = mod[method];
        if (!handler) continue;
        const res = await handler(req(`/api/${rel}`, method), { params });
        if (res.status !== 401) failures.push(`${method} /api/${rel} -> ${res.status}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
