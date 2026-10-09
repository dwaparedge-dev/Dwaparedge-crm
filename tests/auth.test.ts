import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://localhost/test_db";
  process.env.JWT_SECRET = "x".repeat(48);
  process.env.BCRYPT_SALT_ROUNDS = "10";
});

describe("password", () => {
  it("verifies the right password and rejects wrong ones", async () => {
    const { hashPassword, verifyPassword } = await import("@/lib/auth/password");
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("rejects when the user does not exist (null hash)", async () => {
    const { verifyPassword } = await import("@/lib/auth/password");
    expect(await verifyPassword("anything", null)).toBe(false);
  });
});

describe("session token", () => {
  it("round-trips a payload", async () => {
    const { signSession, verifySession } = await import("@/lib/auth/session");
    const token = await signSession({ userId: "u1", tokenVersion: 3 });
    expect(await verifySession(token)).toEqual({ userId: "u1", tokenVersion: 3 });
  });

  it("rejects tampered or missing tokens", async () => {
    const { signSession, verifySession } = await import("@/lib/auth/session");
    const token = await signSession({ userId: "u1", tokenVersion: 0 });
    expect(await verifySession(token + "x")).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
  });

  it("rejects a token signed with another secret", async () => {
    const { SignJWT } = await import("jose");
    const { verifySession } = await import("@/lib/auth/session");
    const forged = await new SignJWT({ tv: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("y".repeat(48)));
    expect(await verifySession(forged)).toBeNull();
  });
});
