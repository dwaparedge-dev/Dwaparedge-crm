import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A blank optional setting (copied from .env.example into a host's dashboard) must mean "use the default", never crash every request.
describe("optional settings left blank", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    process.env.DATABASE_URL = "postgres://x";
    process.env.JWT_SECRET = "x".repeat(40);
  });
  afterEach(() => { process.env = { ...saved }; });

  it("ANALYTICS_RETENTION_DAYS blank falls back to 395 days", async () => {
    process.env.ANALYTICS_RETENTION_DAYS = "";
    expect((await import("@/lib/env")).getEnv().ANALYTICS_RETENTION_DAYS).toBe(395);
  });
  it("ANALYTICS_RETENTION_DAYS unset falls back to 395 days", async () => {
    delete process.env.ANALYTICS_RETENTION_DAYS;
    expect((await import("@/lib/env")).getEnv().ANALYTICS_RETENTION_DAYS).toBe(395);
  });
  it("accepts a real value and still refuses a too-short one", async () => {
    process.env.ANALYTICS_RETENTION_DAYS = "180";
    expect((await import("@/lib/env")).getEnv().ANALYTICS_RETENTION_DAYS).toBe(180);
    vi.resetModules();
    process.env.ANALYTICS_RETENTION_DAYS = "5";
    expect(() => import("@/lib/env").then((m) => m.getEnv())).rejects.toThrow(/ANALYTICS_RETENTION_DAYS/);
  });
  it("DEMO_INTAKE_KEY and TASKS_AUTO_FROM blank are also fine", async () => {
    process.env.DEMO_INTAKE_KEY = ""; process.env.TASKS_AUTO_FROM = "";
    const e = (await import("@/lib/env")).getEnv();
    expect(e.DEMO_INTAKE_KEY).toBeUndefined();
    expect(e.TASKS_AUTO_FROM).toBeUndefined();
  });
});
