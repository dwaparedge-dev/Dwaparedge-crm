import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmedSale, createTestDb, LINE, makeClient, makeUser, type TestDb } from "./helpers";

let tdb: TestDb;
let actor: string;
beforeAll(async () => {
  tdb = await createTestDb();
  actor = (await makeUser()).id;
});
afterAll(async () => tdb?.drop());

describe("list summaries (stat cards)", () => {
  it("sales: totals and per-status counts, status counts ignoring the status filter", async () => {
    const { listSales } = await import("@/features/sales/service");
    const { listSalesSchema } = await import("@/features/sales/schema");
    const client = await makeClient(actor);
    await confirmedSale(actor, client, [LINE("1000", "18")]);
    await confirmedSale(actor, client, [LINE("500", "0")]);
    const all = await listSales(listSalesSchema.parse({ clientId: client }));
    expect(all.summary).toMatchObject({ orderValue: "1680.00", billed: "0.00", paid: "0.00", balance: "1680.00", statusCounts: { confirmed: 2 } });
    const filtered = await listSales(listSalesSchema.parse({ clientId: client, status: "draft", search: "Sale" }));
    expect(filtered.total).toBe(0);
    expect(filtered.summary.statusCounts).toEqual({ confirmed: 2 });
  });
  it("clients and licenses return their card figures", async () => {
    const { listClients } = await import("@/features/clients/service");
    const { listClientsSchema } = await import("@/features/clients/schema");
    const { listLicenses } = await import("@/features/licenses/service");
    const { listLicensesSchema } = await import("@/features/licenses/schema");
    const c = await listClients(listClientsSchema.parse({}));
    expect(c.summary).toMatchObject({ current: 1, archived: 0, newThisMonth: 1, withSales: 1 });
    const l = await listLicenses(listLicensesSchema.parse({}));
    expect(l.summary).toEqual({ active: 0, expiring: 0, expired: 0, pending: 0 });
  });
});
