import { describe, expect, it } from "vitest";
import { clientInputSchema } from "@/features/clients/schema";
import { contactInputSchema } from "@/features/contacts/schema";
import { likePattern } from "@/lib/validation";

const base = { legalName: "Acme Industries Pvt Ltd" };
// Structurally valid GSTIN for Gujarat (24) with PAN ABCDE1234F.
const GSTIN = "24ABCDE1234F1Z5";

describe("client schema", () => {
  it("defaults display name to legal name and trims blanks to null", () => {
    const r = clientInputSchema.parse({ ...base, email: "  ", gstin: "" });
    expect(r.displayName).toBe(base.legalName);
    expect(r.email).toBeNull();
    expect(r.gstin).toBeNull();
    expect(r.country).toBe("India");
  });

  it("uppercases GSTIN and derives the state code from it", () => {
    const r = clientInputSchema.parse({ ...base, gstin: GSTIN.toLowerCase() });
    expect(r.gstin).toBe(GSTIN);
    expect(r.stateCode).toBe("24");
  });

  it("rejects a malformed GSTIN or PAN", () => {
    expect(clientInputSchema.safeParse({ ...base, gstin: "BAD" }).success).toBe(false);
    expect(clientInputSchema.safeParse({ ...base, pan: "12345" }).success).toBe(false);
  });

  it("rejects a PAN that does not match the GSTIN", () => {
    const r = clientInputSchema.safeParse({ ...base, gstin: GSTIN, pan: "ZZZZZ9999Z" });
    expect(r.success).toBe(false);
  });

  it("rejects a state that disagrees with the GSTIN", () => {
    const r = clientInputSchema.safeParse({ ...base, gstin: GSTIN, stateCode: "27" });
    expect(r.success).toBe(false);
  });

  it("requires a legal name", () => {
    expect(clientInputSchema.safeParse({ legalName: "  " }).success).toBe(false);
  });
});

describe("contact schema", () => {
  it("needs an email or a phone", () => {
    expect(contactInputSchema.safeParse({ name: "Ravi" }).success).toBe(false);
    expect(contactInputSchema.safeParse({ name: "Ravi", phone: "+91 98765 43210" }).success).toBe(true);
  });
});

describe("likePattern", () => {
  it("escapes wildcard characters", () => {
    expect(likePattern("50%_off")).toBe("%50\\%\\_off%");
  });
});
