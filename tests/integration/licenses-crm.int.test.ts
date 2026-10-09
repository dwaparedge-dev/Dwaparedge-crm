import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, expectAppError, makeClient, makeProduct, makeUser, uniq, type TestDb } from "./helpers";

let tdb: TestDb;
let actor: string;
let client: string;
let product: string;

beforeAll(async () => {
  tdb = await createTestDb();
  actor = (await makeUser()).id;
  client = await makeClient(actor);
  product = await makeProduct();
  const { addOption } = await import("@/features/options/service");
  await addOption("licenses", "plan", "Standard", actor);
});
afterAll(async () => tdb?.drop());

async function license(over: Record<string, unknown> = {}) {
  const { createLicense } = await import("@/features/licenses/service");
  const { licenseInputSchema } = await import("@/features/licenses/schema");
  return createLicense(licenseInputSchema.parse({ clientId: client, productId: product, plan: "Standard", startDate: "2026-01-01", expiryDate: "2027-01-01", renewalPrice: "1000", ...over }), actor);
}
async function act(id: string, a: Record<string, unknown>) {
  const { performAction } = await import("@/features/licenses/service");
  const { licenseActionSchema } = await import("@/features/licenses/schema");
  return performAction(id, licenseActionSchema.parse(a), actor);
}

describe("license lifecycle", () => {
  it("issues as pending with a unique identifier and a history entry", async () => {
    const { getLicense } = await import("@/features/licenses/service");
    const a = await getLicense(await license());
    const b = await getLicense(await license());
    expect(a.stored_status).toBe("pending");
    expect(a.license_identifier).toMatch(/^DE-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(a.license_identifier).not.toBe(b.license_identifier);
    expect(a.events.map((e) => e.event_type)).toEqual(["issued"]);
  });
  it("follows activate -> suspend -> reinstate -> revoke and records each step", async () => {
    const { getLicense } = await import("@/features/licenses/service");
    const id = await license({ expiryDate: "2099-01-01" });
    await act(id, { action: "activate" });
    await act(id, { action: "suspend", note: "payment pending" });
    await act(id, { action: "reinstate" });
    await act(id, { action: "revoke", note: "contract ended" });
    const l = await getLicense(id);
    expect(l.status).toBe("revoked");
    expect(l.events.map((e) => e.event_type).reverse()).toEqual(["issued", "activated", "suspended", "reinstated", "revoked"]);
  });
  it("refuses illegal transitions", async () => {
    const id = await license({ expiryDate: "2099-01-01" });
    await expectAppError(act(id, { action: "renew", newExpiry: "2100-01-01" }), 409, "INVALID_TRANSITION"); // pending
    await act(id, { action: "activate" });
    await expectAppError(act(id, { action: "activate" }), 409, "INVALID_TRANSITION");
    await expectAppError(act(id, { action: "reinstate" }), 409, "INVALID_TRANSITION");
    await act(id, { action: "revoke", note: "done" });
    await expectAppError(act(id, { action: "reinstate" }), 409, "INVALID_TRANSITION");
    await expectAppError(act(id, { action: "renew", newExpiry: "2100-01-01" }), 409, "INVALID_TRANSITION");
  });
  it("cannot activate a license that is already past expiry", async () => {
    await expectAppError(act(await license({ startDate: "2024-01-01", expiryDate: "2025-01-01" }), { action: "activate" }), 409, "INVALID_TRANSITION", /past its expiry/);
  });
  it("treats an active license past its date as expired, and renewing makes it active again", async () => {
    const { getLicense } = await import("@/features/licenses/service");
    const { db } = await import("@/lib/db");
    const id = await license({ expiryDate: "2099-01-01" });
    await act(id, { action: "activate" });
    await db.query("UPDATE licenses SET start_date='2025-01-01', expiry_date='2025-06-01' WHERE id=$1", [id]); // simulate time passing
    const lapsed = await getLicense(id);
    expect(lapsed).toMatchObject({ stored_status: "active", status: "expired" });
    expect(lapsed.days_remaining).toBeLessThan(0);
    await act(id, { action: "renew", newExpiry: "2099-06-01", renewalPrice: "1500" });
    const renewed = await getLicense(id);
    expect(renewed).toMatchObject({ status: "active", expiry_date: "2099-06-01", renewal_price: "1500.00" });
    expect(renewed.events[0]).toMatchObject({ event_type: "renewed" });
    expect(renewed.events[0]!.details).toMatchObject({ oldExpiry: "2025-06-01", newExpiry: "2099-06-01" });
  });
  it("only renews forward", async () => {
    const id = await license({ expiryDate: "2099-01-01" });
    await act(id, { action: "activate" });
    await expectAppError(act(id, { action: "renew", newExpiry: "2098-01-01" }), 409, "INVALID_TRANSITION", /after the current expiry/);
  });
  it("finds renewals due with the expected value", async () => {
    const { listLicenses } = await import("@/features/licenses/service");
    const { listLicensesSchema } = await import("@/features/licenses/schema");
    const c = await makeClient(actor);
    const soon = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
    const id = await license({ clientId: c, startDate: "2025-01-01", expiryDate: soon, renewalPrice: "2500" });
    await act(id, { action: "activate" });
    await license({ clientId: c, expiryDate: "2099-01-01" });
    const r = await listLicenses(listLicensesSchema.parse({ clientId: c, expiringWithin: "30" }));
    expect(r.total).toBe(1);
    expect(r.renewalValue).toBe("2500.00");
  });
  it("cannot be deleted (revoke instead)", async () => {
    const { db } = await import("@/lib/db");
    const id = await license();
    await expect(db.query("DELETE FROM licenses WHERE id = $1", [id])).rejects.toThrow(/cannot be deleted/);
  });
});

describe("clients and sales", () => {
  it("refuses a duplicate GSTIN, even for an archived client", async () => {
    const { createClient, setArchived } = await import("@/features/clients/service");
    const { clientInputSchema } = await import("@/features/clients/schema");
    const gstin = "27AAPFU0939F1ZV";
    const first = await createClient(clientInputSchema.parse({ legalName: uniq("A"), gstin }), actor);
    await expectAppError(createClient(clientInputSchema.parse({ legalName: uniq("B"), gstin }), actor), 409, "DUPLICATE_GSTIN");
    await setArchived(first, true, actor);
    await expectAppError(createClient(clientInputSchema.parse({ legalName: uniq("C"), gstin }), actor), 409, "DUPLICATE_GSTIN");
  });
  it("warns about a same-name client unless confirmed", async () => {
    const { createClient } = await import("@/features/clients/service");
    const { clientInputSchema } = await import("@/features/clients/schema");
    const name = uniq("Same Name");
    await createClient(clientInputSchema.parse({ legalName: name }), actor);
    await expectAppError(createClient(clientInputSchema.parse({ legalName: name.toUpperCase() }), actor), 409, "POSSIBLE_DUPLICATE");
    await createClient(clientInputSchema.parse({ legalName: name }), actor, true);
  });
  it("archives instead of deleting, and blocks new business for archived clients", async () => {
    const { setArchived } = await import("@/features/clients/service");
    const { createSale } = await import("@/features/sales/service");
    const { saleInputSchema } = await import("@/features/sales/schema");
    const { db } = await import("@/lib/db");
    const c = await makeClient(actor);
    await setArchived(c, true, actor);
    await expectAppError(createSale(saleInputSchema.parse({ clientId: c, type: "service", title: "x", saleDate: "2026-10-05", items: [{ description: "d", quantity: "1", unitPrice: "1" }] }), actor), 422, "CLIENT_ARCHIVED");
    await expect(db.query("DELETE FROM clients WHERE id = $1", [c])).rejects.toThrow(); // referenced by activity history
  });
  it("keeps exactly one primary contact", async () => {
    const { createContact, deleteContact, listContacts } = await import("@/features/contacts/service");
    const { contactInputSchema } = await import("@/features/contacts/schema");
    const c = await makeClient(actor);
    const a = await createContact(c, contactInputSchema.parse({ name: "A", phone: "9876543210" }), actor);
    const b = await createContact(c, contactInputSchema.parse({ name: "B", phone: "9876543211", isPrimary: true }), actor);
    let rows = await listContacts(c);
    expect(rows.filter((r) => r.is_primary).map((r) => r.name)).toEqual(["B"]);
    await deleteContact(c, b, actor);
    rows = await listContacts(c);
    expect(rows.map((r) => [r.id, r.is_primary])).toEqual([[a, true]]); // promoted automatically
  });
  it("numbers sales without duplicates under concurrency and snapshots item prices", async () => {
    const { createSale, getSale } = await import("@/features/sales/service");
    const { saleInputSchema } = await import("@/features/sales/schema");
    const { updateProduct } = await import("@/features/products/service");
    const { productInputSchema } = await import("@/features/products/schema");
    const pid = await makeProduct({ defaultPrice: "100" });
    const ids = await Promise.all(Array.from({ length: 6 }, (_, i) => createSale(saleInputSchema.parse({ clientId: client, type: "license", title: `s${i}`, saleDate: "2026-10-05", items: [{ productId: pid, description: "d", quantity: "1", unitPrice: "100", taxRate: "18" }] }), actor)));
    const sales = await Promise.all(ids.map((id) => getSale(id)));
    expect(new Set(sales.map((s) => s.sale_number)).size).toBe(6);
    await updateProduct(pid, productInputSchema.parse({ name: "Renamed", type: "other", defaultPrice: "999" }), actor);
    expect((await getSale(ids[0]!)).items[0]!.unit_price).toBe("100.00");
  });
});
