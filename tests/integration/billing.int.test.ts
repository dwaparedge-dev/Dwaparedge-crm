import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureCompany, createTestDb, expectAppError, issuedInvoice, LINE, makeClient, makeUser, type TestDb } from "./helpers";

let tdb: TestDb;
let actor: string;
let intra: string; // client in the company's state (Gujarat 24)
let inter: string; // client in Maharashtra (27)

beforeAll(async () => {
  tdb = await createTestDb();
  actor = (await makeUser()).id;
  await configureCompany(actor, "24");
  intra = await makeClient(actor, { stateCode: "24" });
  inter = await makeClient(actor, { stateCode: "27" });
});
afterAll(async () => tdb?.drop());

async function draft(clientId: string, over: Record<string, unknown> = {}) {
  const { createDraft } = await import("@/features/invoices/service");
  const { invoiceInputSchema } = await import("@/features/invoices/schema");
  return createDraft(invoiceInputSchema.parse({ clientId, invoiceType: "service", issueDate: "2026-10-05", dueDate: "2026-10-20", items: [LINE("1000", "18", "3")], ...over }), actor);
}

describe("GST on invoices", () => {
  it("splits tax into CGST + SGST for the same state", async () => {
    const { getInvoice } = await import("@/features/invoices/service");
    const inv = await getInvoice(await draft(intra));
    expect(inv).toMatchObject({ supply_type: "intra", cgst_total: "270.00", sgst_total: "270.00", igst_total: "0.00", tax_total: "540.00", total: "3540.00" });
  });
  it("charges IGST for another state", async () => {
    const { getInvoice } = await import("@/features/invoices/service");
    const inv = await getInvoice(await draft(inter));
    expect(inv).toMatchObject({ supply_type: "inter", cgst_total: "0.00", igst_total: "540.00", total: "3540.00" });
  });
  it("lets the place of supply override the client's state", async () => {
    const { getInvoice } = await import("@/features/invoices/service");
    const inv = await getInvoice(await draft(intra, { placeOfSupplyStateCode: "27" }));
    expect(inv.supply_type).toBe("inter");
  });
  it("refuses a draft when no state is known", async () => {
    const noState = await makeClient(actor, { stateCode: "", gstin: "" });
    await expectAppError(draft(noState), 422, "TAX_CONTEXT_MISSING");
  });
  it("applies the round-off to the grand total", async () => {
    const { getInvoice } = await import("@/features/invoices/service");
    const inv = await getInvoice(await draft(intra, { items: [LINE("33.33", "18")] })); // 33.33 + 6.00 = 39.33
    expect(inv).toMatchObject({ round_off: "-0.33", total: "39.00" });
  });
});

describe("issuing and numbering", () => {
  it("numbers invoices by financial year and prefix", async () => {
    const a = await issuedInvoice(actor, intra, "100", "18", "2026-10-05", "2026-10-20");
    const b = await issuedInvoice(actor, intra, "100", "18", "2027-04-02", "2027-04-20");
    expect(a.number).toMatch(/^DE\/2026-27\/\d{4}$/);
    expect(b.number).toMatch(/^DE\/2027-28\/0001$/); // a new financial year restarts at 1
  });
  it("gives concurrent issuers distinct, gap-free numbers", async () => {
    const { issueInvoice } = await import("@/features/invoices/service");
    const ids = await Promise.all(Array.from({ length: 8 }, () => draft(intra, { issueDate: "2026-11-05", dueDate: "2026-11-20" })));
    const numbers = await Promise.all(ids.map((id) => issueInvoice(id, actor)));
    const seq = numbers.map((n) => Number(n.split("/")[2])).sort((x, y) => x - y);
    expect(new Set(numbers).size).toBe(8);
    expect(seq[7]! - seq[0]!).toBe(7); // consecutive
  });
  it("does not consume a number when issuing fails", async () => {
    const { issueInvoice } = await import("@/features/invoices/service");
    const before = await issuedInvoice(actor, intra, "10", "18", "2026-12-05", "2026-12-20");
    const noAddr = await makeClient(actor, { billingAddress: "" });
    const bad = await draft(noAddr, { issueDate: "2026-12-06", dueDate: "2026-12-20" });
    await expectAppError(issueInvoice(bad, actor), 422, "CLIENT_INCOMPLETE");
    const after = await issuedInvoice(actor, intra, "10", "18", "2026-12-07", "2026-12-20");
    expect(Number(after.number.split("/")[2])).toBe(Number(before.number.split("/")[2]) + 1);
  });
  it("freezes the client and company details at issue", async () => {
    const { getInvoice } = await import("@/features/invoices/service");
    const { updateClient } = await import("@/features/clients/service");
    const { clientInputSchema } = await import("@/features/clients/schema");
    const c = await makeClient(actor, { legalName: "Original Name Ltd" });
    const { id } = await issuedInvoice(actor, c);
    await updateClient(c, clientInputSchema.parse({ legalName: "Renamed Ltd", billingAddress: "New address", stateCode: "24" }), actor);
    const inv = await getInvoice(id);
    expect(inv.client_snapshot?.legalName).toBe("Original Name Ltd");
    expect(inv.company_snapshot?.legal_name).toBe("Test Company Pvt Ltd");
  });
  it("rejects a zero-value invoice", async () => {
    const { issueInvoice } = await import("@/features/invoices/service");
    await expectAppError(issueInvoice(await draft(intra, { items: [LINE("0", "0")] }), actor), 422);
  });
});

describe("issued invoice immutability", () => {
  it("rejects edits and deletes through the service", async () => {
    const { updateDraft, deleteDraft } = await import("@/features/invoices/service");
    const { invoiceInputSchema } = await import("@/features/invoices/schema");
    const { id } = await issuedInvoice(actor, intra);
    const input = invoiceInputSchema.parse({ clientId: intra, invoiceType: "service", issueDate: "2026-10-05", dueDate: "2026-10-20", items: [LINE("1", "0")] });
    await expectAppError(updateDraft(id, input, actor), 409, "INVOICE_LOCKED");
    await expectAppError(deleteDraft(id, actor), 409, "INVOICE_LOCKED");
  });
  it("rejects tampering directly in the database (triggers)", async () => {
    const { db } = await import("@/lib/db");
    const { id } = await issuedInvoice(actor, intra);
    await expect(db.query("UPDATE invoices SET total = 1 WHERE id = $1", [id])).rejects.toThrow(/immutable/);
    await expect(db.query("UPDATE invoices SET invoice_number = 'X' WHERE id = $1", [id])).rejects.toThrow(/immutable/);
    await expect(db.query("UPDATE invoices SET status = 'draft' WHERE id = $1", [id])).rejects.toThrow(/cannot go back/);
    await expect(db.query("DELETE FROM invoices WHERE id = $1", [id])).rejects.toThrow(/cannot be deleted/);
    await expect(db.query("UPDATE invoice_items SET unit_price = 1 WHERE invoice_id = $1", [id])).rejects.toThrow(/cannot be changed/);
    await expect(db.query("DELETE FROM invoice_items WHERE invoice_id = $1", [id])).rejects.toThrow(/cannot be changed/);
  });
  it("keeps the invoice when the product catalog changes", async () => {
    const { makeProduct } = await import("./helpers");
    const { updateProduct } = await import("@/features/products/service");
    const { productInputSchema } = await import("@/features/products/schema");
    const { createDraft, issueInvoice, getInvoice } = await import("@/features/invoices/service");
    const { invoiceInputSchema } = await import("@/features/invoices/schema");
    const pid = await makeProduct({ name: "Catalog item", defaultPrice: "500" });
    const id = await createDraft(invoiceInputSchema.parse({ clientId: intra, invoiceType: "service", issueDate: "2026-10-05", dueDate: "2026-10-20", items: [{ productId: pid, description: "Catalog item", quantity: "1", unitPrice: "500", taxRate: "18" }] }), actor);
    await issueInvoice(id, actor);
    await updateProduct(pid, productInputSchema.parse({ name: "Renamed", type: "software_license", defaultPrice: "9999", gstRate: "5" }), actor);
    const inv = await getInvoice(id);
    expect(inv.items[0]).toMatchObject({ description: "Catalog item", unit_price: "500.00", tax_rate: "18.00" });
  });
  it("allows only a cancellation, which keeps the number", async () => {
    const { cancelInvoice, getInvoice } = await import("@/features/invoices/service");
    const { id, number } = await issuedInvoice(actor, intra);
    await expectAppError(cancelInvoice(id, "x", actor).then(() => cancelInvoice(id, "again", actor)), 409, "INVALID_TRANSITION");
    const inv = await getInvoice(id);
    expect(inv).toMatchObject({ status: "cancelled", invoice_number: number, cancel_reason: "x" });
  });
});

describe("sale to invoice", () => {
  it("copies the sale's items into a draft linked to the sale", async () => {
    const { createSale } = await import("@/features/sales/service");
    const { saleInputSchema } = await import("@/features/sales/schema");
    const { createDraftFromSale, getInvoice } = await import("@/features/invoices/service");
    const saleId = await createSale(saleInputSchema.parse({ clientId: intra, type: "project", title: "Build", saleDate: "2026-10-05", items: [LINE("50000", "18")] }), actor);
    const invId = await createDraftFromSale(saleId, actor);
    const inv = await getInvoice(invId);
    expect(inv).toMatchObject({ status: "draft", sale_id: saleId, invoice_type: "project", total: "59000.00" });
  });
});
