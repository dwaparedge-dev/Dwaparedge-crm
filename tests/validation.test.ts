import { describe, expect, it } from "vitest";
import { clientInputSchema } from "@/features/clients/schema";
import { contactInputSchema } from "@/features/contacts/schema";
import { likePattern, panFromGstin } from "@/lib/validation";
import { settingsSchema } from "@/features/settings/schema";
import { regenerateSchema } from "@/features/invoices/schema";

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

  it("fills a blank PAN from the GSTIN and keeps it blank without one", () => {
    expect(clientInputSchema.parse({ ...base, gstin: GSTIN, pan: "" }).pan).toBe("ABCDE1234F");
    expect(clientInputSchema.parse({ ...base }).pan).toBeNull();
  });

  it("treats brand names and bank details as optional", () => {
    const r = clientInputSchema.parse({ ...base, brandNames: " ", bankName: "", bankAccountNo: "", bankIfsc: "", bankBranch: "" });
    expect([r.brandNames, r.bankName, r.bankAccountNo, r.bankIfsc, r.bankBranch]).toEqual([null, null, null, null, null]);
  });

  it("takes several brand names as a list or a comma-separated string, trimmed and without repeats", () => {
    expect(clientInputSchema.parse({ ...base, brandNames: [" Aris ", "Apres", "aris", ""] }).brandNames).toBe("Aris, Apres");
    expect(clientInputSchema.parse({ ...base, brandNames: "Aris, Apres ,," }).brandNames).toBe("Aris, Apres");
    expect(clientInputSchema.safeParse({ ...base, brandNames: Array.from({ length: 21 }, (_, i) => `B${i}`) }).success).toBe(false);
  });

  it("normalises the account number and IFSC, and rejects bad ones", () => {
    const r = clientInputSchema.parse({ ...base, bankAccountNo: "1234 5678-9012", bankIfsc: "hdfc0001234" });
    expect(r.bankAccountNo).toBe("123456789012");
    expect(r.bankIfsc).toBe("HDFC0001234");
    expect(clientInputSchema.safeParse({ ...base, bankIfsc: "HDFC1001234" }).success).toBe(false);
    expect(clientInputSchema.safeParse({ ...base, bankAccountNo: "12" }).success).toBe(false);
  });
});

describe("PAN from GSTIN", () => {
  it("takes the PAN out of a complete valid GSTIN only", () => {
    expect(panFromGstin(GSTIN)).toBe("ABCDE1234F");
    expect(panFromGstin(GSTIN.toLowerCase())).toBe("ABCDE1234F");
    expect(panFromGstin("24ABCDE1234F1Z")).toBe("");
    expect(panFromGstin("")).toBe("");
    expect(panFromGstin(null)).toBe("");
  });

  it("fills a blank company PAN from the GSTIN in settings", () => {
    const base = { legalName: "Co", address: "Addr", stateCode: "24", receiptPrefix: "RC", defaultDueDays: "15", roundOffTotal: true };
    expect(settingsSchema.parse({ ...base, gstin: GSTIN, pan: "" }).pan).toBe("ABCDE1234F");
    expect(settingsSchema.parse({ ...base, gstin: "", pan: "" }).pan).toBeNull();
    expect(settingsSchema.safeParse({ ...base, gstin: GSTIN, pan: "ZZZZZ9999Z" }).success).toBe(false);
  });
});

describe("regenerate invoice input", () => {
  it("keeps the due date when it is left out, clears it with null, or sets a date", () => {
    expect(regenerateSchema.parse({}).dueDate).toBeUndefined();
    expect(regenerateSchema.parse({ reason: " " }).reason).toBeNull();
    expect(regenerateSchema.parse({ dueDate: null }).dueDate).toBeNull();
    expect(regenerateSchema.parse({ dueDate: "2026-11-30" }).dueDate).toBe("2026-11-30");
    expect(regenerateSchema.safeParse({ dueDate: "30/11/2026" }).success).toBe(false);
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
