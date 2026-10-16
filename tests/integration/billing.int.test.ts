import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bill, configureCompany, confirmedSale, createTestDb, expectAppError, issuedInvoice, LINE, makeClient, makeUser, patchDraft, type TestDb } from "./helpers";

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

/** A draft billing a fresh sale of the given lines (default: 3 x 1000 at 18%). */
async function draft(clientId: string, over: { items?: Record<string, unknown>[]; placeOfSupplyStateCode?: string; issueDate?: string; dueDate?: string } = {}) {
  const saleId = await confirmedSale(actor, clientId, over.items ?? [LINE("1000", "18", "3")]);
  const id = await bill(actor, saleId);
  const { items, ...patch } = over;
  void items;
  if (Object.keys(patch).length) await patchDraft(actor, id, patch);
  return id;
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
  it("numbers invoices as INV-MMYY-clientcode-NN, restarting each month", async () => {
    const a = await issuedInvoice(actor, intra, "100", "18", "2026-10-05", "2026-10-20");
    const b = await issuedInvoice(actor, intra, "100", "18", "2027-04-02", "2027-04-20");
    expect(a.number).toMatch(/^INV-1026-[A-Z]{2}\d{2}-\d{2}$/);
    expect(b.number).toMatch(/^INV-0427-[A-Z]{2}\d{2}-01$/); // a new month restarts at 01
    expect(b.number.split("-")[2]).toBe(a.number.split("-")[2]); // same client, same code
    expect(a.number.length).toBeLessThanOrEqual(16);
  });
  it("gives concurrent issuers distinct, gap-free numbers", async () => {
    const { issueInvoice } = await import("@/features/invoices/service");
    const ids = await Promise.all(Array.from({ length: 8 }, () => draft(intra, { issueDate: "2026-11-05", dueDate: "2026-11-20" })));
    const numbers = await Promise.all(ids.map((id) => issueInvoice(id, actor)));
    const seq = numbers.map((n) => Number(n.split("-")[3])).sort((x, y) => x - y);
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
    expect(Number(after.number.split("-")[3])).toBe(Number(before.number.split("-")[3]) + 1);
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
    await expectAppError(draft(intra, { items: [LINE("0", "0")] }), 422);
  });
});

describe("issued invoice immutability", () => {
  it("rejects edits and deletes through the service", async () => {
    const { updateDraft, deleteDraft } = await import("@/features/invoices/service");
    const { invoiceInputSchema } = await import("@/features/invoices/schema");
    const { getInvoice } = await import("@/features/invoices/service");
    const { id, saleId } = await issuedInvoice(actor, intra);
    const item = (await getInvoice(id)).items[0]!;
    const input = invoiceInputSchema.parse({ saleId, issueDate: "2026-10-05", dueDate: "2026-10-20", items: [{ saleItemId: item.sale_item_id, description: "x", quantity: "1", unitPrice: "1" }] });
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
    const { issueInvoice, getInvoice } = await import("@/features/invoices/service");
    const pid = await makeProduct({ name: "Catalog item", defaultPrice: "500" });
    const saleId = await confirmedSale(actor, intra, [{ productId: pid, description: "Catalog item", quantity: "1", unitPrice: "500", taxRate: "18" }]);
    const id = await bill(actor, saleId);
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
    const { getInvoice } = await import("@/features/invoices/service");
    const saleId = await confirmedSale(actor, intra, [LINE("50000", "18")], { type: "project" });
    const inv = await getInvoice(await bill(actor, saleId));
    expect(inv).toMatchObject({ status: "draft", sale_id: saleId, total: "59000.00" });
    expect(inv.items[0]!.sale_item_id).toBeTruthy();
  });
});

describe("regenerating an issued invoice", () => {
  async function renameClient(clientId: string, legalName: string) {
    const { updateClient } = await import("@/features/clients/service");
    const { clientInputSchema } = await import("@/features/clients/schema");
    await updateClient(clientId, clientInputSchema.parse({ legalName, billingAddress: "New address", stateCode: "24" }), actor);
  }

  it("adds a version with today's details, keeps the number and amounts, and keeps the original", async () => {
    const { getInvoice, getStoredInvoicePdf, regenerateInvoice } = await import("@/features/invoices/service");
    const c = await makeClient(actor, { legalName: "Before Ltd", stateCode: "24" });
    const { id, number } = await issuedInvoice(actor, c);
    const original = await getInvoice(id);
    expect(original).toMatchObject({ version: 1 });
    expect(original.versions).toHaveLength(1);

    await renameClient(c, "After Ltd");
    expect(await regenerateInvoice(id, "Client renamed", actor)).toBe(2);

    const now = await getInvoice(id);
    expect(now).toMatchObject({ invoice_number: number, total: original.total, issue_date: original.issue_date, version: 2 });
    expect(now.client_snapshot?.legalName).toBe("After Ltd");
    expect(now.client_name).toBe("After Ltd");
    expect(now.versions.map((v) => [v.version_no, v.is_current, v.reason])).toEqual([[2, true, "Client renamed"], [1, false, null]]);
    expect(now.versions[0]!.created_by_name).toBeTruthy();

    // Both documents are kept as they were generated.
    for (const v of [1, 2]) expect((await getStoredInvoicePdf(id, v))!.pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect((await getStoredInvoicePdf(id))!.version_no).toBe(2);
    await expect(getStoredInvoicePdf(id, 9)).rejects.toThrow(/does not exist/);
  });

  it("numbers further versions in turn and only regenerates issued invoices", async () => {
    const { regenerateInvoice, getInvoice, cancelInvoice } = await import("@/features/invoices/service");
    const { id } = await issuedInvoice(actor, intra);
    expect(await regenerateInvoice(id, null, actor)).toBe(2);
    expect(await regenerateInvoice(id, null, actor)).toBe(3);
    expect((await getInvoice(id)).versions.map((v) => v.version_no)).toEqual([3, 2, 1]);

    await expectAppError(regenerateInvoice(await draft(intra), null, actor), 409, "INVALID_TRANSITION");
    await cancelInvoice(id, "No longer needed", actor);
    await expectAppError(regenerateInvoice(id, null, actor), 409, "INVALID_TRANSITION");
  });

  it("makes versions permanent in the database", async () => {
    const { db } = await import("@/lib/db");
    const { regenerateInvoice } = await import("@/features/invoices/service");
    const { id } = await issuedInvoice(actor, intra);
    await regenerateInvoice(id, null, actor);
    await expect(db.query("UPDATE invoice_versions SET reason = 'x' WHERE invoice_id = $1", [id])).rejects.toThrow(/permanent/);
    await expect(db.query("DELETE FROM invoice_versions WHERE invoice_id = $1", [id])).rejects.toThrow(/permanent/);
  });

  it("changes the due date only through a regeneration, and can leave it unspecified", async () => {
    const { db } = await import("@/lib/db");
    const { getInvoice, getStoredInvoicePdf, listInvoices, regenerateInvoice } = await import("@/features/invoices/service");
    const { id } = await issuedInvoice(actor, intra, "100", "18", "2026-10-05", "2026-10-20");

    // Straight SQL still cannot touch it.
    await expect(db.query("UPDATE invoices SET due_date = '2026-12-31' WHERE id = $1", [id])).rejects.toThrow(/immutable/);

    await regenerateInvoice(id, null, actor, "2026-11-30");
    let inv = await getInvoice(id);
    expect(inv.due_date).toBe("2026-11-30");
    expect(inv.versions[0]!.reason).toBe("Due date changed from 20/10/2026 to 30/11/2026");

    await regenerateInvoice(id, "Agreed with the client", actor, null);
    inv = await getInvoice(id);
    expect(inv.due_date).toBeNull();
    expect(inv.is_overdue).toBe(false);
    expect(inv.versions[0]!.reason).toBe("Due date changed from 30/11/2026 to not specified. Agreed with the client");
    expect((await listInvoices({ page: 1, pageSize: 50, search: inv.invoice_number! } as never)).items[0]!.due_date).toBeNull();
    expect((await getStoredInvoicePdf(id, 1))!.pdf.subarray(0, 4).toString()).toBe("%PDF");

    // Leaving the due date out keeps it, and a date before the invoice date is refused.
    await regenerateInvoice(id, null, actor);
    expect((await getInvoice(id)).due_date).toBeNull();
    await expectAppError(regenerateInvoice(id, null, actor, "2026-09-01"), 422, "VALIDATION_ERROR");
  });

  it("can move the invoice date to today when regenerating, keeping the number and checking the due date", async () => {
    const { todayIST } = await import("@/lib/dates");
    const { getInvoice, regenerateInvoice } = await import("@/features/invoices/service");
    const { db } = await import("@/lib/db");
    const { id, number } = await issuedInvoice(actor, intra, "100", "18", "2026-10-05", "2026-10-06");
    await expect(db.query("UPDATE invoices SET issue_date = '2026-10-06' WHERE id = $1", [id])).rejects.toThrow(/immutable/);

    // The old due date (2026-10-06) is before today, so it has to be replaced in the same step.
    await expectAppError(regenerateInvoice(id, null, actor, undefined, true), 422, "VALIDATION_ERROR");
    await regenerateInvoice(id, null, actor, null, true);
    const inv = await getInvoice(id);
    expect(inv).toMatchObject({ invoice_number: number, issue_date: todayIST(), due_date: null });
    expect(inv.versions[0]!.reason).toMatch(/^Invoice date changed from 05\/10\/2026 to \d{2}\/\d{2}\/\d{4}\. Due date changed from 06\/10\/2026 to not specified$/);
  });

  it("takes the SAC/HSN code from the sale: on the draft, when issued and again on each regeneration", async () => {
    const { db } = await import("@/lib/db");
    const { getInvoice, getStoredInvoicePdf, issueInvoice, regenerateInvoice } = await import("@/features/invoices/service");
    const saleId = await confirmedSale(actor, intra, [{ ...LINE("1000", "18"), hsnSac: "998314" }]);
    const id = await bill(actor, saleId);
    expect((await getInvoice(id)).items[0]!.hsn_sac).toBe("998314");

    // The sale's code changes while the invoice is still a draft: the draft and the issued invoice follow it.
    await db.query("UPDATE sale_items SET hsn_sac = '997331' WHERE sale_id = $1", [saleId]);
    expect((await getInvoice(id)).items[0]!.hsn_sac).toBe("997331");
    await issueInvoice(id, actor);
    expect((await getInvoice(id)).items[0]!.hsn_sac).toBe("997331");

    // After issue the lines are permanent, so a regeneration keeps the new code with its version.
    await db.query("UPDATE sale_items SET hsn_sac = '995411' WHERE sale_id = $1", [saleId]);
    expect((await getInvoice(id)).items[0]!.hsn_sac).toBe("997331");
    await regenerateInvoice(id, null, actor);
    const inv = await getInvoice(id);
    expect(inv.items[0]!.hsn_sac).toBe("995411");
    expect(inv.versions[0]!.reason).toBe("SAC/HSN codes updated from the sale");
    expect((await db.query<{ hsn_sac: string }>("SELECT hsn_sac FROM invoice_items WHERE invoice_id = $1", [id]))[0]!.hsn_sac).toBe("997331");
    expect((await getStoredInvoicePdf(id, 1))!.pdf.length).toBeGreaterThan(0);

    // A blank code on the sale leaves the invoice's own code alone.
    await db.query("UPDATE sale_items SET hsn_sac = NULL WHERE sale_id = $1", [saleId]);
    await regenerateInvoice(id, null, actor);
    expect((await getInvoice(id)).items[0]!.hsn_sac).toBe("997331");
  });

  it("keeps the instalment's deliverables text and milestone when the sale no longer has them", async () => {
    const { db } = await import("@/lib/db");
    const { replaceMilestones, getSale } = await import("@/features/sales/service");
    const { milestonesSchema } = await import("@/features/sales/schema");
    const { issueInvoice, regenerateInvoice, getInvoice } = await import("@/features/invoices/service");
    const saleId = await confirmedSale(actor, intra, [LINE("10000", "18")]);
    await replaceMilestones(saleId, milestonesSchema.parse({ milestones: [
      { title: "Kickoff", basis: "percent", percent: "30", description: "Discovery workshops" },
      { title: "Go-live", basis: "percent", percent: "70" },
    ] }).milestones, actor);
    const milestoneId = (await getSale(saleId)).milestones[0]!.id;
    const id = await bill(actor, saleId, { mode: "milestone", milestoneId });
    await issueInvoice(id, actor);

    // Text edited on the sale: the new text is used.
    await db.query("UPDATE sale_milestones SET description = 'Workshops and sign-off' WHERE id = $1", [milestoneId]);
    await regenerateInvoice(id, null, actor);
    expect((await getInvoice(id)).document_snapshot!.milestone).toMatchObject({ title: "Kickoff", description: "Workshops and sign-off" });

    // Text cleared on the sale: the invoice keeps what it had, and the version says so.
    await db.query("UPDATE sale_milestones SET description = NULL WHERE id = $1", [milestoneId]);
    await regenerateInvoice(id, null, actor);
    let inv = await getInvoice(id);
    expect(inv.document_snapshot!.milestone).toMatchObject({ title: "Kickoff", description: "Workshops and sign-off" });
    expect(inv.versions[0]!.reason).toMatch(/deliverables text is empty on the sale/);

    // Instalment no longer linked to the invoice: the milestone stays on the invoice.
    await db.query("UPDATE sale_milestones SET invoice_id = NULL WHERE id = $1", [milestoneId]);
    await regenerateInvoice(id, null, actor);
    inv = await getInvoice(id);
    expect(inv.document_snapshot!.milestone).toMatchObject({ position: 1, title: "Kickoff", description: "Workshops and sign-off" });
    expect(inv.versions[0]!.reason).toMatch(/no longer linked/);
  });
});
