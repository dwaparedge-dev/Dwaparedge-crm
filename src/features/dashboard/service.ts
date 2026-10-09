import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { isoDate } from "@/lib/validation";
import { AppError } from "@/lib/auth/errors";

export const dashboardQuerySchema = z.object({ from: isoDate, to: isoDate });

const TODAY = "(now() AT TIME ZONE 'Asia/Kolkata')::date";
const PAID = (a: string) => `COALESCE((SELECT sum(x.amount) FROM payment_allocations x WHERE x.invoice_id = ${a}.id AND x.reversed_at IS NULL), 0)`;

/**
 * Every figure is an aggregate computed in SQL. Four different things are kept strictly apart:
 *  - invoiced: issued invoices dated in the period
 *  - collected: payments received in the period (never derived from invoices)
 *  - outstanding / overdue: right now, from allocations
 *  - projected renewals: renewal prices of licenses due, not yet invoiced
 */
export async function getDashboard(q: z.infer<typeof dashboardQuerySchema>) {
  if (q.from > q.to) throw new AppError("The start date is after the end date", 422, "VALIDATION_ERROR");
  const one = <T extends Record<string, unknown>>(sql: string, values: unknown[] = []) => db.queryOne<T>(sql, values);

  const [clients, sales, toBill, invoiced, collected, receivables, advances, licenses, renewals, recentInvoices, expiring, activity] = await Promise.all([
    one<{ n: string }>("SELECT count(*) AS n FROM clients WHERE archived_at IS NULL"),
    one<{ n: string; v: string | null }>("SELECT count(*) AS n, sum(total) AS v FROM sales WHERE status IN ('draft','confirmed')"),
    one<{ v: string | null; n: string }>("SELECT sum(sb.unbilled_estimate) AS v, count(*) FILTER (WHERE sb.unbilled_estimate > 0) AS n FROM sales s JOIN sale_billing sb ON sb.sale_id = s.id WHERE s.status = 'confirmed'"),
    one<{ n: string; v: string | null }>("SELECT count(*) AS n, sum(total) AS v FROM invoices WHERE status = 'issued' AND issue_date BETWEEN $1 AND $2", [q.from, q.to]),
    one<{ n: string; v: string | null }>("SELECT count(*) AS n, sum(amount) AS v FROM payments WHERE voided_at IS NULL AND payment_date BETWEEN $1 AND $2", [q.from, q.to]),
    one<{ open_n: string; outstanding: string | null; overdue_n: string; overdue: string | null }>(
      `SELECT count(*) FILTER (WHERE b.bal > 0) AS open_n, sum(b.bal) AS outstanding,
              count(*) FILTER (WHERE b.bal > 0 AND b.due_date < ${TODAY}) AS overdue_n,
              sum(b.bal) FILTER (WHERE b.due_date < ${TODAY}) AS overdue
       FROM (SELECT i.due_date, i.total - ${PAID("i")} AS bal FROM invoices i WHERE i.status = 'issued') b WHERE b.bal > 0`,
    ),
    one<{ v: string | null }>(`SELECT sum(p.amount - COALESCE((SELECT sum(a.amount) FROM payment_allocations a WHERE a.payment_id = p.id AND a.reversed_at IS NULL), 0)) AS v FROM payments p WHERE p.voided_at IS NULL`),
    one<{ active: string; pending: string; suspended: string; expired: string; d7: string; d15: string; d30: string }>(
      `SELECT count(*) FILTER (WHERE status = 'active' AND expiry_date >= ${TODAY}) AS active,
              count(*) FILTER (WHERE status = 'pending') AS pending,
              count(*) FILTER (WHERE status = 'suspended') AS suspended,
              count(*) FILTER (WHERE status = 'active' AND expiry_date < ${TODAY}) AS expired,
              count(*) FILTER (WHERE status = 'active' AND expiry_date BETWEEN ${TODAY} AND ${TODAY} + 7) AS d7,
              count(*) FILTER (WHERE status = 'active' AND expiry_date BETWEEN ${TODAY} AND ${TODAY} + 15) AS d15,
              count(*) FILTER (WHERE status = 'active' AND expiry_date BETWEEN ${TODAY} AND ${TODAY} + 30) AS d30
       FROM licenses`,
    ),
    one<{ n: string; v: string | null }>(`SELECT count(*) AS n, sum(renewal_price) AS v FROM licenses WHERE status = 'active' AND expiry_date <= ${TODAY} + 30`),
    db.query(
      `SELECT i.id, i.invoice_number, c.display_name AS client_name, to_char(i.issue_date,'YYYY-MM-DD') AS issue_date, i.total, i.status,
              (i.status = 'issued' AND i.total - ${PAID("i")} <= 0) AS paid
       FROM invoices i JOIN clients c ON c.id = i.client_id ORDER BY i.created_at DESC LIMIT 6`,
    ),
    db.query(
      `SELECT l.id, l.license_identifier, c.display_name AS client_name, pr.name AS product_name, to_char(l.expiry_date,'YYYY-MM-DD') AS expiry_date,
              (l.expiry_date - ${TODAY})::int AS days_remaining, l.renewal_price
       FROM licenses l JOIN clients c ON c.id = l.client_id JOIN products pr ON pr.id = l.product_id
       WHERE l.status = 'active' AND l.expiry_date <= ${TODAY} + 30 ORDER BY l.expiry_date LIMIT 8`,
    ),
    db.query(
      `SELECT a.id, a.summary, a.entity_type, u.name AS actor_name, a.created_at FROM activity_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC, a.id DESC LIMIT 10`,
    ),
  ]);

  const n = (v: string | undefined | null) => Number(v ?? 0);
  return {
    period: q,
    clients: { active: n(clients?.n) },
    sales: { open: n(sales?.n), value: sales?.v ?? "0.00", toBill: toBill?.v ?? "0.00", salesToBill: n(toBill?.n) },
    billing: {
      invoiced: { count: n(invoiced?.n), amount: invoiced?.v ?? "0.00" },
      collected: { count: n(collected?.n), amount: collected?.v ?? "0.00" },
      outstanding: { invoices: n(receivables?.open_n), amount: receivables?.outstanding ?? "0.00" },
      overdue: { invoices: n(receivables?.overdue_n), amount: receivables?.overdue ?? "0.00" },
      advances: advances?.v ?? "0.00",
    },
    licenses: {
      active: n(licenses?.active), pending: n(licenses?.pending), suspended: n(licenses?.suspended), expired: n(licenses?.expired),
      expiring7: n(licenses?.d7), expiring15: n(licenses?.d15), expiring30: n(licenses?.d30),
      renewals30: { count: n(renewals?.n), expectedValue: renewals?.v ?? "0.00" },
    },
    recentInvoices,
    expiringLicenses: expiring,
    recentActivity: activity,
  };
}
