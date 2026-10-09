import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bill, configureCompany, confirmedSale, createTestDb, expectAppError, issuedInvoice, LINE, makeClient, makeUser, type TestDb } from "./helpers";

let tdb: TestDb;
let actor: string;
let client: string;

beforeAll(async () => {
  tdb = await createTestDb();
  actor = (await makeUser()).id;
  await configureCompany(actor, "24");
  client = await makeClient(actor);
});
afterAll(async () => tdb?.drop());

// Invoice total with 18% GST on 1000 is 1180.
const invoice = (price = "1000") => issuedInvoice(actor, client, price);

async function pay(amount: string, allocations: { invoiceId: string; amount: string }[] = [], clientId = client, date = "2026-10-06") {
  const { recordPayment } = await import("@/features/payments/service");
  const { paymentInputSchema } = await import("@/features/payments/schema");
  return recordPayment(paymentInputSchema.parse({ clientId, paymentDate: date, amount, method: "upi", allocations }), actor);
}
const status = async (id: string) => {
  const { getInvoice } = await import("@/features/invoices/service");
  const i = await getInvoice(id);
  return { paid: i.amount_paid, balance: i.balance_due, status: i.payment_status };
};

describe("payment status is derived from allocations", () => {
  it("moves unpaid -> partial -> paid as allocations are added", async () => {
    const { allocatePayment } = await import("@/features/payments/service");
    const inv = await invoice();
    expect(await status(inv.id)).toEqual({ paid: "0", balance: "1180.00", status: "unpaid" });
    await pay("500", [{ invoiceId: inv.id, amount: "500" }]);
    expect(await status(inv.id)).toEqual({ paid: "500.00", balance: "680.00", status: "partial" });
    const p2 = await pay("700");
    await allocatePayment(p2.id, [{ invoiceId: inv.id, amount: "680" }], actor);
    expect(await status(inv.id)).toEqual({ paid: "1180.00", balance: "0.00", status: "paid" });
  });
  it("records multiple payments for one invoice and one payment across invoices", async () => {
    const a = await invoice();
    const b = await invoice();
    await pay("2360", [{ invoiceId: a.id, amount: "1180" }, { invoiceId: b.id, amount: "1180" }]);
    expect((await status(a.id)).status).toBe("paid");
    expect((await status(b.id)).status).toBe("paid");
  });
  it("keeps an unallocated remainder as an advance", async () => {
    const { getPayment } = await import("@/features/payments/service");
    const inv = await invoice();
    const p = await pay("2000", [{ invoiceId: inv.id, amount: "1180" }]);
    expect(await getPayment(p.id)).toMatchObject({ amount: "2000.00", allocated: "1180.00", unallocated: "820.00" });
  });
});

describe("invalid allocations are refused", () => {
  it("rejects more than the invoice balance, more than the payment, wrong client, drafts and voided payments", async () => {
    const { allocatePayment, voidPayment } = await import("@/features/payments/service");
    const inv = await invoice();
    const p = await pay("5000");
    await expectAppError(allocatePayment(p.id, [{ invoiceId: inv.id, amount: "1180.01" }], actor), 422, "ALLOCATION_INVALID", /exceeds its balance/);
    const small = await pay("100");
    await expectAppError(allocatePayment(small.id, [{ invoiceId: inv.id, amount: "100.01" }], actor), 422, "ALLOCATION_INVALID", /unallocated/);
    const other = await makeClient(actor);
    const foreign = await pay("100", [], other);
    await expectAppError(allocatePayment(foreign.id, [{ invoiceId: inv.id, amount: "10" }], actor), 422, "ALLOCATION_INVALID", /different client/);
    const d = await bill(actor, await confirmedSale(actor, client, [LINE("10", "0")]));
    await expectAppError(allocatePayment(p.id, [{ invoiceId: d, amount: "5" }], actor), 422, "ALLOCATION_INVALID", /issued/);
    await voidPayment(p.id, "mistake", actor);
    await expectAppError(allocatePayment(p.id, [{ invoiceId: inv.id, amount: "5" }], actor), 422, "ALLOCATION_INVALID", /voided/);
  });
  it("lets only one of two simultaneous allocations to the same invoice win", async () => {
    const { allocatePayment } = await import("@/features/payments/service");
    const inv = await invoice(); // balance 1180
    const [p1, p2] = await Promise.all([pay("1000"), pay("1000")]);
    const results = await Promise.allSettled([
      allocatePayment(p1.id, [{ invoiceId: inv.id, amount: "1000" }], actor),
      allocatePayment(p2.id, [{ invoiceId: inv.id, amount: "1000" }], actor),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await status(inv.id)).paid).toBe("1000.00");
  });
  it("lets only one of two simultaneous allocations from the same payment win", async () => {
    const { allocatePayment } = await import("@/features/payments/service");
    const a = await invoice();
    const b = await invoice();
    const p = await pay("1500");
    const results = await Promise.allSettled([
      allocatePayment(p.id, [{ invoiceId: a.id, amount: "1000" }], actor),
      allocatePayment(p.id, [{ invoiceId: b.id, amount: "1000" }], actor),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("blocks an over-allocation written straight to the database (trigger backstop)", async () => {
    const { db } = await import("@/lib/db");
    const inv = await invoice();
    const p = await pay("500");
    await expect(db.query("INSERT INTO payment_allocations (payment_id, invoice_id, amount) VALUES ($1,$2,$3)", [p.id, inv.id, "501"])).rejects.toThrow(/exceeds the unallocated/);
    await expect(db.query("INSERT INTO payment_allocations (payment_id, invoice_id, amount) VALUES ($1,$2,$3)", [p.id, inv.id, "-5"])).rejects.toThrow();
  });
});

describe("corrections are controlled and audited", () => {
  it("reverses an allocation (kept for audit) and allows re-allocating", async () => {
    const { reverseAllocation, getPayment, allocatePayment } = await import("@/features/payments/service");
    const wrong = await invoice();
    const right = await invoice();
    const p = await pay("1180", [{ invoiceId: wrong.id, amount: "1180" }]);
    const alloc = (await getPayment(p.id)).allocations[0]!;
    await reverseAllocation(alloc.id, "wrong invoice", actor);
    await expectAppError(reverseAllocation(alloc.id, "again", actor), 409, "INVALID_TRANSITION");
    expect((await status(wrong.id)).status).toBe("unpaid");
    await allocatePayment(p.id, [{ invoiceId: right.id, amount: "1180" }], actor);
    expect((await status(right.id)).status).toBe("paid");
    const detail = await getPayment(p.id);
    expect(detail.allocations).toHaveLength(2); // the reversed one is still on record
    expect(detail.allocations.filter((a) => a.reversed_at)).toHaveLength(1);
  });
  it("cannot void an allocated payment, or cancel an invoice that has payments", async () => {
    const { voidPayment, reverseAllocation, getPayment } = await import("@/features/payments/service");
    const { cancelInvoice } = await import("@/features/invoices/service");
    const inv = await invoice();
    const p = await pay("1180", [{ invoiceId: inv.id, amount: "1180" }]);
    await expectAppError(voidPayment(p.id, "oops", actor), 409, "HAS_ALLOCATIONS");
    await expectAppError(cancelInvoice(inv.id, "client left", actor), 409, "HAS_PAYMENTS");
    await reverseAllocation((await getPayment(p.id)).allocations[0]!.id, "undo", actor);
    await voidPayment(p.id, "oops", actor);
    await cancelInvoice(inv.id, "client left", actor);
  });
  it("never edits or deletes payments and allocations in the database", async () => {
    const { db } = await import("@/lib/db");
    const inv = await invoice();
    const p = await pay("1180", [{ invoiceId: inv.id, amount: "1180" }]);
    await expect(db.query("UPDATE payments SET amount = 1 WHERE id = $1", [p.id])).rejects.toThrow(/cannot be edited/);
    await expect(db.query("DELETE FROM payments WHERE id = $1", [p.id])).rejects.toThrow(/never deleted/);
    await expect(db.query("UPDATE payment_allocations SET amount = 1 WHERE payment_id = $1", [p.id])).rejects.toThrow(/cannot be edited/);
    await expect(db.query("DELETE FROM payment_allocations WHERE payment_id = $1", [p.id])).rejects.toThrow(/never deleted/);
  });
  it("rejects a payment dated in the future", async () => {
    await expectAppError(pay("10", [], client, "2099-01-01"), 422);
  });
  it("numbers receipts without duplicates under concurrency", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => pay("10")));
    expect(new Set(results.map((r) => r.receiptNumber)).size).toBe(6);
  });
});

describe("outstanding balances", () => {
  it("excludes cancelled invoices and counts overdue ones", async () => {
    const { listInvoices, cancelInvoice } = await import("@/features/invoices/service");
    const { listInvoicesSchema } = await import("@/features/invoices/schema");
    const fresh = await makeClient(actor);
    const keep = await issuedInvoice(actor, fresh, "1000", "18", "2026-08-01", "2026-08-15"); // long overdue
    const drop = await issuedInvoice(actor, fresh, "2000", "18", "2026-08-01", "2026-08-15");
    await cancelInvoice(drop.id, "duplicate", actor);
    const r = await listInvoices(listInvoicesSchema.parse({ clientId: fresh }));
    expect(r.totals).toEqual({ invoiced: "1180.00", outstanding: "1180.00" });
    expect(r.items.find((i) => i.id === keep.id)?.is_overdue).toBe(true);
  });
});
