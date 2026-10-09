import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureCompany, confirmedSale, createTestDb, issuedInvoice, LINE, makeClient, makeUser, type TestDb } from "./helpers";

let tdb: TestDb;
let actor: string;
beforeAll(async () => {
  tdb = await createTestDb();
  actor = (await makeUser()).id;
});
afterAll(async () => tdb?.drop());

describe("dashboard", () => {
  it("returns the chart and list data alongside the KPIs", async () => {
    const { getDashboard, dashboardQuerySchema } = await import("@/features/dashboard/service");
    const client = await makeClient(actor);
    await confirmedSale(actor, client, [LINE("1000", "18")]);
    const d = await getDashboard(dashboardQuerySchema.parse({ from: "2026-10-01", to: "2026-10-31" }));
    expect(d.trend).toHaveLength(6);
    expect(d.trend.at(-1)?.month).toBe("2026-10");
    expect(d.aging.map((b) => b.key)).toEqual(["current", "d30", "d60", "d90", "d90p"]);
    expect(d.topDebtors).toEqual([]);
    expect(d.gst).toMatchObject({ taxable: "0.00", tax: "0.00", total: "0.00" });
    expect(d.efficiency).toEqual({ avgDaysToPay: null, onTimeShare: null });
    expect(d.recentPayments).toEqual([]);
    expect(d.pipeline).toEqual([{ status: "confirmed", count: 1, value: "1180.00" }]);
    expect(d.sales.open).toBe(1);
    expect(d.previous).toEqual({ invoiced: 0, collected: 0 });
    expect(d.invoiceMix).toEqual({ draft: 0, unpaid: 0, partial: 0, overdue: 0, paid: 0 });
    expect(d.upcomingDues).toEqual([]);
  });

  it("measures receivables, tax and payment speed from real invoices", async () => {
    const { getDashboard, dashboardQuerySchema } = await import("@/features/dashboard/service");
    const { recordPayment } = await import("@/features/payments/service");
    const { paymentInputSchema } = await import("@/features/payments/schema");
    await configureCompany(actor, "24");
    const client = await makeClient(actor, { stateCode: "24" });
    const invoice = await issuedInvoice(actor, client, "1000", "18", "2026-10-05", "2026-10-20");
    await recordPayment(paymentInputSchema.parse({ clientId: client, paymentDate: "2026-10-08", amount: "400", method: "upi", allocations: [{ invoiceId: invoice.id, amount: "400" }] }), actor);
    const d = await getDashboard(dashboardQuerySchema.parse({ from: "2026-10-01", to: "2026-10-31" }));
    expect(d.gst).toMatchObject({ taxable: "1000.00", tax: "180.00", total: "1180.00" });
    expect(d.billing.collected.amount).toBe("400.00");
    expect(d.topDebtors[0]).toMatchObject({ name: expect.any(String), invoices: 1, balance: "780.00" });
    expect(d.aging.reduce((a, b) => a + b.amount, 0)).toBe(780);
    expect(d.efficiency.avgDaysToPay).toBe(3);
    expect(d.efficiency.onTimeShare).toBe(1);
    expect(d.recentPayments).toHaveLength(1);
    expect(d.invoiceMix.partial + d.invoiceMix.overdue).toBe(1);
  });
});
