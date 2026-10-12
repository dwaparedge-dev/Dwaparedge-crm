import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bill, configureCompany, confirmedSale, createTestDb, expectAppError, LINE, makeClient, makeUser, patchDraft, type TestDb } from "./helpers";

let tdb: TestDb;
let actor: string;

beforeAll(async () => {
  tdb = await createTestDb();
  actor = (await makeUser()).id;
  await configureCompany(actor, "24");
});
afterAll(async () => tdb?.drop());

const codeOf = async (clientId: string) => (await (await import("@/lib/db")).db.queryOne<{ code: string }>("SELECT code FROM clients WHERE id = $1", [clientId]))!.code;
const saleRow = async (id: string) => (await (await import("@/lib/db")).db.queryOne<{ sale_number: string; quotation_number: string }>("SELECT sale_number, quotation_number FROM sales WHERE id = $1", [id]))!;
const issue = async (invoiceId: string) => (await import("@/features/invoices/service")).issueInvoice(invoiceId, actor);

describe("client codes", () => {
  it("are given to every new client, one after another, and never repeat", async () => {
    const a = await codeOf(await makeClient(actor));
    const b = await codeOf(await makeClient(actor));
    const c = await codeOf(await makeClient(actor));
    expect([a, b, c].every((x) => /^[A-Z]{2}\d{2}$/.test(x))).toBe(true);
    expect(a < b && b < c).toBe(true);
  });
  it("are assigned on first use to a client that has none (for example one that predates codes)", async () => {
    const { db } = await import("@/lib/db");
    const id = await makeClient(actor);
    await db.query("UPDATE clients SET code = NULL WHERE id = $1", [id]);
    const saleId = await confirmedSale(actor, id);
    expect(await codeOf(id)).toMatch(/^[A-Z]{2}\d{2}$/);
    expect((await saleRow(saleId)).sale_number).toBe(`SL-${await codeOf(id)}-01`);
  });
});

describe("sale and quotation numbers", () => {
  it("count sales per client and quotations per client per month", async () => {
    const client = await makeClient(actor);
    const code = await codeOf(client);
    const s1 = await saleRow(await confirmedSale(actor, client, [LINE()], { saleDate: "2026-10-05" }));
    const s2 = await saleRow(await confirmedSale(actor, client, [LINE()], { saleDate: "2026-10-20" }));
    const s3 = await saleRow(await confirmedSale(actor, client, [LINE()], { saleDate: "2026-11-02" }));
    expect([s1.sale_number, s2.sale_number, s3.sale_number]).toEqual([`SL-${code}-01`, `SL-${code}-02`, `SL-${code}-03`]);
    expect([s1.quotation_number, s2.quotation_number, s3.quotation_number]).toEqual([`QT-1026-${code}-01`, `QT-1026-${code}-02`, `QT-1126-${code}-01`]);
  });
  it("keep each client's counters apart", async () => {
    const a = await makeClient(actor);
    const b = await makeClient(actor);
    const sa = await saleRow(await confirmedSale(actor, a));
    const sb = await saleRow(await confirmedSale(actor, b));
    expect(sa.sale_number.endsWith("-01") && sb.sale_number.endsWith("-01")).toBe(true);
    expect(sa.sale_number).not.toBe(sb.sale_number);
  });
});

describe("invoice numbers", () => {
  it("are INV-MMYY-clientcode-NN, counting that client's invoices in the month", async () => {
    const client = await makeClient(actor);
    const code = await codeOf(client);
    const saleId = await confirmedSale(actor, client, [LINE("1000", "18")]);
    const first = await bill(actor, saleId, { mode: "percent", percent: "40" });
    await patchDraft(actor, first, { issueDate: "2026-10-05", dueDate: "2026-10-20" });
    const second = await bill(actor, saleId, { mode: "rest" });
    await patchDraft(actor, second, { issueDate: "2026-10-25", dueDate: "2026-11-10" });
    const third = await bill(actor, await confirmedSale(actor, client, [LINE("500", "18")]), { mode: "rest" });
    await patchDraft(actor, third, { issueDate: "2026-11-03", dueDate: "2026-11-18" });
    expect(await issue(first)).toBe(`INV-1026-${code}-01`);
    expect(await issue(second)).toBe(`INV-1026-${code}-02`);
    expect(await issue(third)).toBe(`INV-1126-${code}-01`);
  });
  it("refuse to go past 16 characters (more than 99 in a month)", async () => {
    const { db } = await import("@/lib/db");
    const client = await makeClient(actor);
    const code = await codeOf(client);
    await db.query("INSERT INTO document_sequences (doc_type, scope, last_value) VALUES ('invoice', $1, 99)", [`${code}-1026`]);
    const id = await bill(actor, await confirmedSale(actor, client), { mode: "rest" });
    await patchDraft(actor, id, { issueDate: "2026-10-05", dueDate: "2026-10-20" });
    await expectAppError(issue(id), 422, "INVOICE_NUMBER_INVALID", /16 characters/);
    // the failed issue released the number: the draft is still a draft and can be issued once the cause is fixed
    expect((await (await import("@/features/invoices/service")).getInvoice(id)).status).toBe("draft");
  });
});
