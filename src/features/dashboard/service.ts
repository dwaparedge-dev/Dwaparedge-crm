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

  const [clients, sales, toBill, invoiced, collected, receivables, advances, licenses, renewals, recentInvoices, expiring, activity, trend, aging, pipeline, previous, invoiceMix, upcoming, topDebtors, gst, efficiency, recentPayments] = await Promise.all([
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
    // Six months ending with the month of the period's end date: invoiced (issued invoices) vs collected (payments received).
    db.query<{ month: string; invoiced: string; collected: string }>(
      `SELECT to_char(m.ms, 'YYYY-MM') AS month,
              COALESCE((SELECT sum(i.total) FROM invoices i WHERE i.status = 'issued' AND date_trunc('month', i.issue_date) = m.ms), 0) AS invoiced,
              COALESCE((SELECT sum(p.amount) FROM payments p WHERE p.voided_at IS NULL AND date_trunc('month', p.payment_date) = m.ms), 0) AS collected
       FROM generate_series(date_trunc('month', $1::date) - interval '5 months', date_trunc('month', $1::date), interval '1 month') AS m(ms)
       ORDER BY m.ms`,
      [q.to],
    ),
    // Unpaid balance by how long it has been past due.
    db.queryOne<Record<"current" | "d30" | "d60" | "d90" | "d90p" | "n_current" | "n_d30" | "n_d60" | "n_d90" | "n_d90p", string>>(
      `SELECT COALESCE(sum(b.bal) FILTER (WHERE b.late <= 0), 0) AS current, count(*) FILTER (WHERE b.late <= 0) AS n_current,
              COALESCE(sum(b.bal) FILTER (WHERE b.late BETWEEN 1 AND 30), 0) AS d30, count(*) FILTER (WHERE b.late BETWEEN 1 AND 30) AS n_d30,
              COALESCE(sum(b.bal) FILTER (WHERE b.late BETWEEN 31 AND 60), 0) AS d60, count(*) FILTER (WHERE b.late BETWEEN 31 AND 60) AS n_d60,
              COALESCE(sum(b.bal) FILTER (WHERE b.late BETWEEN 61 AND 90), 0) AS d90, count(*) FILTER (WHERE b.late BETWEEN 61 AND 90) AS n_d90,
              COALESCE(sum(b.bal) FILTER (WHERE b.late > 90), 0) AS d90p, count(*) FILTER (WHERE b.late > 90) AS n_d90p
       FROM (SELECT i.total - ${PAID("i")} AS bal, (${TODAY} - i.due_date) AS late FROM invoices i WHERE i.status = 'issued') b WHERE b.bal > 0`,
    ),
    db.query<{ status: string; n: string; v: string | null }>(
      "SELECT status, count(*) AS n, sum(total) AS v FROM sales WHERE status <> 'cancelled' GROUP BY status",
    ),
    // The period just before this one, same length, for the "vs previous" change on the cards.
    db.queryOne<{ invoiced: string; collected: string }>(
      `SELECT COALESCE((SELECT sum(total) FROM invoices WHERE status = 'issued' AND issue_date BETWEEN $1::date - ($2::date - $1::date + 1) AND $1::date - 1), 0) AS invoiced,
              COALESCE((SELECT sum(amount) FROM payments WHERE voided_at IS NULL AND payment_date BETWEEN $1::date - ($2::date - $1::date + 1) AND $1::date - 1), 0) AS collected`,
      [q.from, q.to],
    ),
    // Where every non-cancelled invoice stands right now.
    db.queryOne<{ draft: string; unpaid: string; partial: string; overdue: string; paid: string }>(
      `SELECT count(*) FILTER (WHERE b.status = 'draft') AS draft,
              count(*) FILTER (WHERE b.status = 'issued' AND b.bal > 0 AND b.paid = 0 AND b.due_date >= ${TODAY}) AS unpaid,
              count(*) FILTER (WHERE b.status = 'issued' AND b.bal > 0 AND b.paid > 0 AND b.due_date >= ${TODAY}) AS partial,
              count(*) FILTER (WHERE b.status = 'issued' AND b.bal > 0 AND b.due_date < ${TODAY}) AS overdue,
              count(*) FILTER (WHERE b.status = 'issued' AND b.bal <= 0) AS paid
       FROM (SELECT i.status, i.due_date, ${PAID("i")} AS paid, i.total - ${PAID("i")} AS bal FROM invoices i WHERE i.status IN ('draft','issued')) b`,
    ),
    db.query<{ id: string; invoice_number: string; client_name: string; due_date: string; balance: string; days: number }>(
      `SELECT b.id, b.invoice_number, b.client_name, to_char(b.due_date,'YYYY-MM-DD') AS due_date, b.bal AS balance, (b.due_date - ${TODAY})::int AS days
       FROM (SELECT i.id, i.invoice_number, c.display_name AS client_name, i.due_date, i.total - ${PAID("i")} AS bal
             FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.status = 'issued') b
       WHERE b.bal > 0 AND b.due_date BETWEEN ${TODAY} AND ${TODAY} + 14 ORDER BY b.due_date, b.invoice_number LIMIT 6`,
    ),
    db.query<{ client_id: string; client_name: string; invoices: string; balance: string; overdue: string; oldest: number }>(
      `SELECT c.id AS client_id, c.display_name AS client_name, count(*) AS invoices, sum(b.bal) AS balance,
              COALESCE(sum(b.bal) FILTER (WHERE b.due_date < ${TODAY}), 0) AS overdue, GREATEST(max(${TODAY} - b.due_date), 0)::int AS oldest
       FROM (SELECT i.client_id, i.due_date, i.total - ${PAID("i")} AS bal FROM invoices i WHERE i.status = 'issued') b
       JOIN clients c ON c.id = b.client_id WHERE b.bal > 0 GROUP BY c.id, c.display_name ORDER BY sum(b.bal) DESC LIMIT 6`,
    ),
    // Tax charged on the invoices issued in the period.
    db.queryOne<{ taxable: string; cgst: string; sgst: string; igst: string; tax: string; total: string }>(
      `SELECT COALESCE(sum(subtotal), 0.00) AS taxable, COALESCE(sum(cgst_total), 0.00) AS cgst, COALESCE(sum(sgst_total), 0.00) AS sgst,
              COALESCE(sum(igst_total), 0.00) AS igst, COALESCE(sum(tax_total), 0.00) AS tax, COALESCE(sum(total), 0.00) AS total
       FROM invoices WHERE status = 'issued' AND issue_date BETWEEN $1 AND $2`,
      [q.from, q.to],
    ),
    // How fast money arrives: allocated amounts weighted by days from invoice date to payment date, and the share paid by the due date.
    db.queryOne<{ days: string | null; on_time: string | null }>(
      `SELECT sum(a.amount * (p.payment_date - i.issue_date)) / NULLIF(sum(a.amount), 0) AS days,
              sum(a.amount) FILTER (WHERE p.payment_date <= i.due_date) / NULLIF(sum(a.amount), 0) AS on_time
       FROM payment_allocations a JOIN payments p ON p.id = a.payment_id JOIN invoices i ON i.id = a.invoice_id
       WHERE a.reversed_at IS NULL AND p.voided_at IS NULL AND p.payment_date BETWEEN $1 AND $2`,
      [q.from, q.to],
    ),
    db.query<{ id: string; receipt_number: string; client_name: string; payment_date: string; amount: string; method_label: string | null; method: string }>(
      `SELECT p.id, p.receipt_number, c.display_name AS client_name, to_char(p.payment_date,'YYYY-MM-DD') AS payment_date, p.amount, p.method, fo.option_value AS method_label
       FROM payments p JOIN clients c ON c.id = p.client_id
       LEFT JOIN field_options fo ON fo.table_name = 'payments' AND fo.column_name = 'method' AND lower(fo.option_key) = lower(p.method)
       WHERE p.voided_at IS NULL ORDER BY p.payment_date DESC, p.created_at DESC LIMIT 6`,
    ),
  ]);

  const n = (v: string | undefined | null) => Number(v ?? 0);
  return {
    generatedAt: new Date().toISOString(),
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
    trend: trend.map((t) => ({ month: t.month, invoiced: Number(t.invoiced), collected: Number(t.collected) })),
    aging: [
      { key: "current", label: "Not yet due", amount: Number(aging?.current ?? 0), count: n(aging?.n_current) },
      { key: "d30", label: "1 – 30 days", amount: Number(aging?.d30 ?? 0), count: n(aging?.n_d30) },
      { key: "d60", label: "31 – 60 days", amount: Number(aging?.d60 ?? 0), count: n(aging?.n_d60) },
      { key: "d90", label: "61 – 90 days", amount: Number(aging?.d90 ?? 0), count: n(aging?.n_d90) },
      { key: "d90p", label: "Over 90 days", amount: Number(aging?.d90p ?? 0), count: n(aging?.n_d90p) },
    ],
    topDebtors: topDebtors.map((r) => ({ clientId: r.client_id, name: r.client_name, invoices: Number(r.invoices), balance: r.balance, overdue: r.overdue, oldestDays: r.oldest })),
    gst: { taxable: gst?.taxable ?? "0.00", cgst: gst?.cgst ?? "0.00", sgst: gst?.sgst ?? "0.00", igst: gst?.igst ?? "0.00", tax: gst?.tax ?? "0.00", total: gst?.total ?? "0.00" },
    efficiency: { avgDaysToPay: efficiency?.days === null || efficiency?.days === undefined ? null : Number(efficiency.days), onTimeShare: efficiency?.on_time === null || efficiency?.on_time === undefined ? null : Number(efficiency.on_time) },
    recentPayments: recentPayments.map((p) => ({ id: p.id, receiptNumber: p.receipt_number, clientName: p.client_name, date: p.payment_date, amount: p.amount, method: p.method_label ?? p.method })),
    previous: { invoiced: Number(previous?.invoiced ?? 0), collected: Number(previous?.collected ?? 0) },
    invoiceMix: {
      draft: n(invoiceMix?.draft), unpaid: n(invoiceMix?.unpaid), partial: n(invoiceMix?.partial), overdue: n(invoiceMix?.overdue), paid: n(invoiceMix?.paid),
    },
    upcomingDues: upcoming.map((u) => ({ id: u.id, invoiceNumber: u.invoice_number, clientName: u.client_name, dueDate: u.due_date, balance: u.balance, days: u.days })),
    pipeline: pipeline.map((r) => ({ status: r.status, count: Number(r.n), value: r.v ?? "0.00" })),
  };
}
