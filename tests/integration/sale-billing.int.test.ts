import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bill, configureCompany, confirmedSale, createTestDb, expectAppError, issuedInvoice, LINE, makeClient, makeUser, patchDraft, type TestDb } from "./helpers";

let tdb: TestDb;
let actor: string;
let client: string;

beforeAll(async () => {
  tdb = await createTestDb();
  actor = (await makeUser()).id;
  await configureCompany(actor, "24");
  client = await makeClient(actor, { stateCode: "24" });
});
afterAll(async () => tdb?.drop());

const sale = async (id: string) => (await import("@/features/sales/service")).getSale(id);
const issue = async (invoiceId: string) => (await import("@/features/invoices/service")).issueInvoice(invoiceId, actor);
const inv = async (id: string) => (await import("@/features/invoices/service")).getInvoice(id);
async function pay(amount: string, saleId: string | null, allocations: { invoiceId: string; amount: string }[] = [], clientId = client) {
  const { recordPayment } = await import("@/features/payments/service");
  const { paymentInputSchema } = await import("@/features/payments/schema");
  return recordPayment(paymentInputSchema.parse({ clientId, saleId, paymentDate: "2026-10-06", amount, method: "upi", allocations }), actor);
}

describe("invoices belong to a sale", () => {
  it("only bills a confirmed sale", async () => {
    const { createSale } = await import("@/features/sales/service");
    const { saleInputSchema } = await import("@/features/sales/schema");
    const draftSale = await createSale(saleInputSchema.parse({ clientId: client, type: "service", title: "t", saleDate: "2026-10-05", items: [LINE()] }), actor);
    await expectAppError(bill(actor, draftSale), 409, "SALE_NOT_CONFIRMED");
  });
  it("refuses lines that belong to another sale", async () => {
    const { createDraft } = await import("@/features/invoices/service");
    const { invoiceInputSchema } = await import("@/features/invoices/schema");
    const a = await confirmedSale(actor, client);
    const b = await confirmedSale(actor, client);
    const foreignItem = (await sale(b)).items[0]!.id;
    await expectAppError(
      createDraft(invoiceInputSchema.parse({ saleId: a, issueDate: "2026-10-05", dueDate: "2026-10-20", items: [{ saleItemId: foreignItem, description: "x", quantity: "1", unitPrice: "1" }] }), actor),
      422, "VALIDATION_ERROR",
    );
  });
  it("cannot be issued once the sale is no longer confirmed", async () => {
    const { setSaleStatus } = await import("@/features/sales/service");
    const { deleteDraft } = await import("@/features/invoices/service");
    const saleId = await confirmedSale(actor, client);
    const id = await bill(actor, saleId);
    await deleteDraft(id, actor);
    await setSaleStatus(saleId, "cancelled", actor);
    await expectAppError(bill(actor, saleId), 409, "SALE_NOT_CONFIRMED");
  });
});

describe("billing in parts", () => {
  it("never bills more than the sale: service and database both refuse", async () => {
    const { db } = await import("@/lib/db");
    const saleId = await confirmedSale(actor, client, [LINE("10000", "18")]);
    const first = await bill(actor, saleId, { mode: "percent", percent: "60" });
    await issue(first);
    await expectAppError(bill(actor, saleId, { mode: "amount", amount: "4000.01" }), 422, "NOTHING_TO_BILL", /Only 4000.00/);
    const second = await bill(actor, saleId, { mode: "rest" });
    expect((await inv(second)).subtotal).toBe("4000.00");
    await expectAppError(bill(actor, saleId, { mode: "rest" }), 422, "NOTHING_TO_BILL"); // the second draft already holds the rest
    // Editing the draft to bill more than is left is refused too.
    await expectAppError(patchDraft(actor, second, { items: [{ saleItemId: (await sale(saleId)).items[0]!.id, description: "x", quantity: "1", unitPrice: "4000.01" }] }), 422, "OVER_BILLED");
    // ...and so is going around the app straight into the database.
    const item = (await sale(saleId)).items[0]!.id;
    await expect(
      db.query(
        `INSERT INTO invoice_items (invoice_id, position, sale_item_id, description, quantity, unit_price, taxable_amount, tax_amount, line_total) VALUES ($1, 9, $2, 'x', 1, 1, 0.01, 0, 0.01)`,
        [second, item],
      ),
    ).rejects.toThrow(/Billing more than the sale item allows/);
  });
  it("lets only one of two simultaneous invoices take the same remainder", async () => {
    const saleId = await confirmedSale(actor, client, [LINE("10000", "18")]);
    const results = await Promise.allSettled([bill(actor, saleId, { mode: "amount", amount: "7000" }), bill(actor, saleId, { mode: "amount", amount: "7000" })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await sale(saleId)).to_bill_taxable).toBe("3000.00");
  });
  it("adds three instalments up to the sale exactly, whatever the rounding", async () => {
    const saleId = await confirmedSale(actor, client, [LINE("33333.33", "18"), LINE("1234.57", "12"), LINE("0.07", "5")]);
    const ids = [await bill(actor, saleId, { mode: "percent", percent: "30" })];
    await issue(ids[0]!);
    ids.push(await bill(actor, saleId, { mode: "percent", percent: "40" }));
    await issue(ids[1]!);
    ids.push(await bill(actor, saleId, { mode: "rest" }));
    await issue(ids[2]!);
    const subtotals = await Promise.all(ids.map(async (i) => Number((await inv(i)).subtotal) * 100));
    expect(Math.round(subtotals.reduce((a, b) => a + b, 0))).toBe(Math.round(Number((await sale(saleId)).subtotal) * 100));
    const s = await sale(saleId);
    expect(s).toMatchObject({ billing_status: "fully_billed", to_bill_taxable: "0.00" });
    expect(s.items.every((i) => i.remaining_taxable === "0.00")).toBe(true);
  });
  it("bills an amount in proportion across lines with different GST rates", async () => {
    const saleId = await confirmedSale(actor, client, [LINE("6000", "18"), LINE("4000", "5")]);
    const id = await bill(actor, saleId, { mode: "amount", amount: "5000" });
    const i = await inv(id);
    expect(i.subtotal).toBe("5000.00");
    expect(i.items.map((x) => [x.taxable_amount, x.tax_rate])).toEqual([["3000.00", "18.00"], ["2000.00", "5.00"]]);
    expect(i.tax_total).toBe("640.00"); // 3000*18% + 2000*5%
  });
  it("frees the amount again when a draft is deleted or an invoice cancelled", async () => {
    const { deleteDraft, cancelInvoice } = await import("@/features/invoices/service");
    const saleId = await confirmedSale(actor, client, [LINE("1000", "18")]);
    const a = await bill(actor, saleId, { mode: "percent", percent: "50" });
    expect((await sale(saleId)).to_bill_taxable).toBe("500.00");
    await deleteDraft(a, actor);
    expect((await sale(saleId)).to_bill_taxable).toBe("1000.00");
    const b = await bill(actor, saleId, { mode: "rest" });
    await issue(b);
    expect((await sale(saleId)).to_bill_taxable).toBe("0.00");
    await cancelInvoice(b, "wrong client", actor);
    expect(await sale(saleId)).toMatchObject({ to_bill_taxable: "1000.00", billed_total: "0.00" });
  });
});

describe("billing plan (milestones)", () => {
  const plan = async (saleId: string, milestones: Record<string, unknown>[]) => {
    const { replaceMilestones } = await import("@/features/sales/service");
    const { milestonesSchema } = await import("@/features/sales/schema");
    return replaceMilestones(saleId, milestonesSchema.parse({ milestones }).milestones, actor);
  };
  it("bills instalments from the plan, the last one taking the exact remainder", async () => {
    const saleId = await confirmedSale(actor, client, [LINE("33333.33", "18"), LINE("1234.57", "12")]);
    await plan(saleId, [
      { title: "Advance", basis: "percent", percent: "33.33" },
      { title: "On delivery", basis: "percent", percent: "33.33" },
      { title: "Go-live", basis: "percent", percent: "33.34", dueDate: "2099-01-01" },
    ]);
    const ms = (await sale(saleId)).milestones;
    expect(ms.map((m) => m.invoice_id)).toEqual([null, null, null]);
    const ids: string[] = [];
    for (const m of ms) {
      ids.push(await bill(actor, saleId, { mode: "milestone", milestoneId: m.id }));
      await issue(ids.at(-1)!);
    }
    const s = await sale(saleId);
    expect(s).toMatchObject({ billing_status: "fully_billed", to_bill_taxable: "0.00" });
    expect(s.milestones.map((m) => m.invoice_status)).toEqual(["issued", "issued", "issued"]);
    expect((await inv(ids[2]!)).due_date).toBe("2099-01-01");
    await expectAppError(bill(actor, saleId, { mode: "milestone", milestoneId: ms[0]!.id }), 409, "MILESTONE_BILLED");
  });
  it("rejects a plan bigger than the sale and protects billed instalments", async () => {
    const saleId = await confirmedSale(actor, client, [LINE("1000", "18")]);
    await expectAppError(plan(saleId, [{ title: "a", basis: "percent", percent: "60" }, { title: "b", basis: "amount", amount: "500" }]), 422, "PLAN_TOO_LARGE");
    await plan(saleId, [{ title: "a", basis: "percent", percent: "50" }, { title: "b", basis: "amount", amount: "250" }]);
    const [a] = (await sale(saleId)).milestones;
    await bill(actor, saleId, { mode: "milestone", milestoneId: a!.id });
    await expectAppError(plan(saleId, [{ id: (await sale(saleId)).milestones[1]!.id, title: "b", basis: "amount", amount: "250" }]), 409, "MILESTONE_BILLED"); // a was dropped
  });
  it("returns an instalment to 'planned' when its invoice is cancelled, and lets it be billed again", async () => {
    const { cancelInvoice } = await import("@/features/invoices/service");
    const saleId = await confirmedSale(actor, client, [LINE("1000", "18")]);
    await plan(saleId, [{ title: "Only", basis: "percent", percent: "100" }]);
    const mid = (await sale(saleId)).milestones[0]!.id;
    const first = await bill(actor, saleId, { mode: "milestone", milestoneId: mid });
    await issue(first);
    await cancelInvoice(first, "wrong", actor);
    expect((await sale(saleId)).milestones[0]!.invoice_id).toBeNull();
    const again = await bill(actor, saleId, { mode: "milestone", milestoneId: mid });
    expect((await sale(saleId)).milestones[0]!.invoice_id).toBe(again);
  });
});

describe("editing a sale after billing", () => {
  const save = async (saleId: string, items: Record<string, unknown>[]) => {
    const { updateSale, getSale } = await import("@/features/sales/service");
    const { saleInputSchema } = await import("@/features/sales/schema");
    const s = await getSale(saleId);
    return updateSale(saleId, saleInputSchema.parse({ clientId: s.client_id, type: s.type, title: s.title, saleDate: s.sale_date, items }), actor);
  };
  it("keeps item identities, blocks reducing or removing billed items, and allows adding", async () => {
    const saleId = await confirmedSale(actor, client, [LINE("1000", "18"), { ...LINE("500", "18"), description: "Second" }]);
    const [a, b] = (await sale(saleId)).items;
    await issue(await bill(actor, saleId, { mode: "percent", percent: "50" }));
    // unchanged edit keeps ids
    await save(saleId, [{ itemId: a!.id, ...LINE("1000", "18") }, { itemId: b!.id, ...LINE("500", "18"), description: "Second" }]);
    expect((await sale(saleId)).items.map((i) => i.id)).toEqual([a!.id, b!.id]);
    await expectAppError(save(saleId, [{ itemId: a!.id, ...LINE("400", "18") }, { itemId: b!.id, ...LINE("500", "18") }]), 409, "ITEM_BILLED"); // 500 already billed
    await expectAppError(save(saleId, [{ itemId: a!.id, ...LINE("1000", "18") }]), 409, "ITEM_BILLED"); // removing b
    await save(saleId, [{ itemId: a!.id, ...LINE("1000", "18") }, { itemId: b!.id, ...LINE("500", "18") }, { ...LINE("200", "18"), description: "Extra" }]);
    const s = await sale(saleId);
    expect(s.items).toHaveLength(3);
    expect(s.to_bill_taxable).toBe("950.00"); // 1700 - 750 billed
  });
  it("lets an unbilled item be removed", async () => {
    const saleId = await confirmedSale(actor, client, [LINE("1000", "18"), { ...LINE("500", "18"), description: "Gone" }]);
    const [a] = (await sale(saleId)).items;
    await save(saleId, [{ itemId: a!.id, ...LINE("1000", "18") }]);
    expect((await sale(saleId)).items).toHaveLength(1);
  });
});

describe("sale status rules", () => {
  it("completes only when fully billed, and cancels only when nothing is live", async () => {
    const { setSaleStatus } = await import("@/features/sales/service");
    const { cancelInvoice, deleteDraft } = await import("@/features/invoices/service");
    const saleId = await confirmedSale(actor, client, [LINE("1000", "18")]);
    await expectAppError(setSaleStatus(saleId, "completed", actor), 409, "NOT_FULLY_BILLED");
    const id = await bill(actor, saleId);
    await expectAppError(setSaleStatus(saleId, "cancelled", actor), 409, "HAS_INVOICES");
    await expectAppError(setSaleStatus(saleId, "completed", actor), 409, "HAS_DRAFTS");
    await issue(id);
    await setSaleStatus(saleId, "completed", actor);
    const other = await confirmedSale(actor, client, [LINE("1000", "18")]);
    const d = await bill(actor, other);
    await deleteDraft(d, actor);
    const e = await bill(actor, other);
    await issue(e);
    await cancelInvoice(e, "x", actor);
    await setSaleStatus(other, "cancelled", actor);
  });
});

describe("payments in parts and the remaining balance", () => {
  it("tracks billed, paid and remaining on the sale as part payments arrive", async () => {
    const saleId = await confirmedSale(actor, client, [LINE("10000", "18")]); // 11,800 incl. GST
    expect(await sale(saleId)).toMatchObject({ billed_total: "0.00", paid_total: "0.00", balance_remaining: "11800.00", billing_status: "not_billed", payment_status: "unpaid" });

    const i1 = await bill(actor, saleId, { mode: "percent", percent: "30" });
    await issue(i1);
    expect(await sale(saleId)).toMatchObject({ billed_total: "3540.00", due_on_invoices: "3540.00", billing_status: "partly_billed", balance_remaining: "11800.00" });

    await pay("1000", saleId, [{ invoiceId: i1, amount: "1000" }]);
    expect(await sale(saleId)).toMatchObject({ paid_on_invoices: "1000.00", due_on_invoices: "2540.00", paid_total: "1000.00", balance_remaining: "10800.00", payment_status: "partial" });

    await pay("2540", saleId, [{ invoiceId: i1, amount: "2540" }]);
    expect((await inv(i1)).payment_status).toBe("paid");
    expect(await sale(saleId)).toMatchObject({ due_on_invoices: "0.00", paid_total: "3540.00", balance_remaining: "8260.00" });

    const i2 = await bill(actor, saleId, { mode: "rest" });
    await issue(i2);
    await pay("8260", saleId, [{ invoiceId: i2, amount: "8260" }]);
    expect(await sale(saleId)).toMatchObject({ billing_status: "fully_billed", payment_status: "paid", balance_remaining: "0.00", paid_total: "11800.00" });
  });

  it("holds an advance for the sale, then applies it when the invoice is issued", async () => {
    const { applyAdvance } = await import("@/features/payments/service");
    const saleId = await confirmedSale(actor, client, [LINE("10000", "18")]);
    await pay("5000", saleId); // advance before any invoice exists
    expect(await sale(saleId)).toMatchObject({ advance: "5000.00", paid_total: "5000.00", balance_remaining: "6800.00", paid_on_invoices: "0.00" });
    await expectAppError(applyAdvance(saleId, actor), 409, "NOTHING_TO_APPLY");

    const i1 = await bill(actor, saleId, { mode: "percent", percent: "30" }); // 3,540
    await issue(i1);
    expect(await applyAdvance(saleId, actor)).toBe("3540.00");
    expect(await sale(saleId)).toMatchObject({ advance: "1460.00", paid_on_invoices: "3540.00", due_on_invoices: "0.00", paid_total: "5000.00", balance_remaining: "6800.00" });
    expect((await inv(i1)).payment_status).toBe("paid");

    const i2 = await bill(actor, saleId, { mode: "rest" }); // 8,260
    await issue(i2);
    expect(await applyAdvance(saleId, actor, i2)).toBe("1460.00");
    expect(await sale(saleId)).toMatchObject({ advance: "0.00", due_on_invoices: "6800.00", balance_remaining: "6800.00" });
    await expectAppError(applyAdvance(saleId, actor), 409, "NO_ADVANCE");
  });

  it("drops a voided advance, and refuses payments tagged to the wrong client's or a cancelled sale", async () => {
    const { voidPayment } = await import("@/features/payments/service");
    const { setSaleStatus } = await import("@/features/sales/service");
    const saleId = await confirmedSale(actor, client, [LINE("1000", "18")]);
    const p = await pay("700", saleId);
    expect((await sale(saleId)).advance).toBe("700.00");
    await expectAppError(setSaleStatus(saleId, "cancelled", actor), 409, "HAS_ADVANCE");
    await voidPayment(p.id, "typo", actor);
    expect(await sale(saleId)).toMatchObject({ advance: "0.00", paid_total: "0.00" });
    const stranger = await makeClient(actor);
    await expectAppError(pay("10", saleId, [], stranger), 422);
    await setSaleStatus(saleId, "cancelled", actor);
    await expectAppError(pay("10", saleId), 409, "SALE_CANCELLED");
  });

  it("reports an overpayment instead of hiding it", async () => {
    const saleId = await confirmedSale(actor, client, [LINE("1000", "18")]);
    await pay("2000", saleId);
    expect(await sale(saleId)).toMatchObject({ balance_remaining: "0.00", overpaid: "820.00", payment_status: "paid" });
  });

  it("lists a sale's payments whether tagged to it or allocated to its invoices", async () => {
    const { listPayments } = await import("@/features/payments/service");
    const { listPaymentsSchema } = await import("@/features/payments/schema");
    const a = await issuedInvoice(actor, client);
    await pay("100", a.saleId); // tagged
    await pay("1180", null, [{ invoiceId: a.id, amount: "1180" }]); // allocated, not tagged
    const r = await listPayments(listPaymentsSchema.parse({ saleId: a.saleId }));
    expect(r.total).toBe(2);
    expect(r.items.map((p) => p.applied_to_sale).sort()).toEqual(["0.00", "1180.00"]);
  });
});
