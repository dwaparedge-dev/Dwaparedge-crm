import { describe, expect, it } from "vitest";
import { validateAllocationPlan, type InvoiceState } from "@/features/payments/allocation";

const inv = (o: Partial<InvoiceState> = {}): InvoiceState => ({ number: "DE/2026-27/0001", clientId: "c1", status: "issued", total: "1000.00", allocated: "0.00", ...o });
const plan = (over: Partial<Parameters<typeof validateAllocationPlan>[0]>) =>
  validateAllocationPlan({ paymentClientId: "c1", paymentVoided: false, paymentUnallocated: "1000.00", requests: [], invoices: new Map(), ...over });

describe("validateAllocationPlan", () => {
  it("allows a partial payment against one invoice", () => {
    const r = plan({ requests: [{ invoiceId: "a", amount: "400.00" }], invoices: new Map([["a", inv()]]) });
    expect(r).toEqual({ totalAllocated: "400.00", remaining: "600.00" });
  });
  it("allows one payment to settle several invoices", () => {
    const r = plan({
      paymentUnallocated: "1500.00",
      requests: [{ invoiceId: "a", amount: "1000.00" }, { invoiceId: "b", amount: "500.00" }],
      invoices: new Map([["a", inv()], ["b", inv({ total: "500.00" })]]),
    });
    expect(r.remaining).toBe("0.00");
  });
  it("accounts for what an invoice already received", () => {
    expect(() => plan({ requests: [{ invoiceId: "a", amount: "300.00" }], invoices: new Map([["a", inv({ allocated: "800.00" })]]) })).toThrow(/exceeds its balance of 200.00/);
  });
  it("rejects allocating more than the payment holds", () => {
    expect(() => plan({ paymentUnallocated: "100.00", requests: [{ invoiceId: "a", amount: "100.01" }], invoices: new Map([["a", inv()]]) })).toThrow(/only 100.00/);
  });
  it("rejects allocating more than the invoice balance (overpayment goes to advance, not the invoice)", () => {
    expect(() => plan({ requests: [{ invoiceId: "a", amount: "1000.01" }], invoices: new Map([["a", inv()]]) })).toThrow(/exceeds its balance/);
  });
  it("rejects the wrong client, draft/cancelled invoices and voided payments", () => {
    const a = (x: InvoiceState) => ({ requests: [{ invoiceId: "a", amount: "1.00" }], invoices: new Map([["a", x]]) });
    expect(() => plan(a(inv({ clientId: "c2" })))).toThrow(/different client/);
    expect(() => plan(a(inv({ status: "draft", number: null })))).toThrow(/only be allocated to issued/);
    expect(() => plan(a(inv({ status: "cancelled" })))).toThrow(/cancelled/);
    expect(() => plan({ ...a(inv()), paymentVoided: true })).toThrow(/voided/);
  });
  it("rejects duplicates, unknown invoices and non-positive amounts", () => {
    expect(() => plan({ requests: [{ invoiceId: "a", amount: "1" }, { invoiceId: "a", amount: "1" }], invoices: new Map([["a", inv()]]) })).toThrow(/only once/);
    expect(() => plan({ requests: [{ invoiceId: "zzz", amount: "1" }] })).toThrow(/does not exist/);
    expect(() => plan({ requests: [{ invoiceId: "a", amount: "0" }], invoices: new Map([["a", inv()]]) })).toThrow(/greater than 0/);
  });
  it("is exact to the paisa", () => {
    // 0.1 + 0.2 must equal 0.3 exactly
    const r = plan({ paymentUnallocated: "0.30", requests: [{ invoiceId: "a", amount: "0.10" }, { invoiceId: "b", amount: "0.20" }], invoices: new Map([["a", inv()], ["b", inv()]]) });
    expect(r).toEqual({ totalAllocated: "0.30", remaining: "0.00" });
  });
});
