import "server-only";
import { query, type Queryable } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { THRESHOLDS } from "./thresholds";

export type SignalSource = "demo_request" | "invoice" | "license" | "sale_milestone";

/** One record whose condition holds right now, and the task that should exist for it. */
export interface SignalCandidate {
  dedupeKey: string;
  sourceType: SignalSource;
  sourceId: string;
  clientId: string | null;
  title: string;
  categoryKey: string;
  priorityKey: string;
  dueDate: string | null;
  ownerId: string | null;
  /** The date the condition began (due date, expiry date, arrival date): auto-tasks are only raised for dates on or after TASKS_AUTO_FROM. */
  triggerDate: string;
  /** Written to the history when the task is closed because the condition ended. */
  closeReason: string;
}

export interface SignalRule {
  name: string;
  sourceType: SignalSource;
  /** Every record whose condition holds now, regardless of age. */
  holds(q: Queryable, today: string): Promise<SignalCandidate[]>;
}

const D = (col: string) => `to_char(${col}, 'YYYY-MM-DD')`;
const PAID = "COALESCE((SELECT sum(a.amount) FROM payment_allocations a WHERE a.invoice_id = i.id AND a.reversed_at IS NULL), 0)";

const demoRequests: SignalRule = {
  name: "demo_request", sourceType: "demo_request",
  async holds(q, today) {
    const rows = await query<{ id: string; name: string; company: string; owner_id: string | null; arrived: string }>(
      `SELECT id, name, company, owner_id, ${D("(created_at AT TIME ZONE 'Asia/Kolkata')::date")} AS arrived FROM demo_requests WHERE status = 'new'`, [], q);
    return rows.map((r) => ({
      dedupeKey: `demo_request:${r.id}`, sourceType: "demo_request", sourceId: r.id, clientId: null, title: `Call ${r.name}, ${r.company}`,
      categoryKey: "sales_leads", priorityKey: "high", dueDate: today, ownerId: r.owner_id, triggerDate: r.arrived, closeReason: "demo request is no longer new",
    }));
  },
};

const overdueInvoices: SignalRule = {
  name: "invoice_overdue", sourceType: "invoice",
  async holds(q, today) {
    const rows = await query<{ id: string; invoice_number: string; client_id: string; client: string; owner_id: string | null; due: string; balance: string }>(
      `SELECT i.id, i.invoice_number, i.client_id, c.display_name AS client, c.owner_id, ${D("i.due_date")} AS due, (i.total - ${PAID}) AS balance
       FROM invoices i JOIN clients c ON c.id = i.client_id
       WHERE i.status = 'issued' AND i.due_date IS NOT NULL AND i.due_date < $1::date AND i.total - ${PAID} > 0`, [today], q);
    return rows.map((r) => ({
      dedupeKey: `invoice_overdue:${r.id}`, sourceType: "invoice", sourceId: r.id, clientId: r.client_id,
      title: `Collect ${formatMoney(r.balance)} from ${r.client} (${r.invoice_number})`, categoryKey: "collections", priorityKey: "high",
      dueDate: r.due, ownerId: r.owner_id, triggerDate: r.due, closeReason: "invoice is paid, cancelled or no longer overdue",
    }));
  },
};

const licenseRenewals: SignalRule = {
  name: "license_renewal", sourceType: "license",
  async holds(q, today) {
    const rows = await query<{ id: string; client_id: string; client: string; owner_id: string | null; product: string; expiry: string }>(
      `SELECT l.id, l.client_id, c.display_name AS client, c.owner_id, p.name AS product, ${D("l.expiry_date")} AS expiry
       FROM licenses l JOIN clients c ON c.id = l.client_id JOIN products p ON p.id = l.product_id
       WHERE l.status = 'active' AND l.expiry_date <= $1::date + $2::int`, [today, THRESHOLDS.renewalDays], q);
    return rows.map((r) => {
      const lapsed = r.expiry < today;
      const lead = new Date(Date.parse(`${r.expiry}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
      return {
        dedupeKey: `license_renewal:${r.id}:${r.expiry}`, sourceType: "license" as const, sourceId: r.id, clientId: r.client_id,
        title: `${lapsed ? "Renewal overdue: " : "Renew "}${r.product} for ${r.client}`, categoryKey: "licences", priorityKey: "normal",
        dueDate: lead > today ? lead : today, ownerId: r.owner_id, triggerDate: r.expiry, closeReason: "licence renewed or no longer active",
      };
    });
  },
};

const milestones: SignalRule = {
  name: "milestone", sourceType: "sale_milestone",
  async holds(q, today) {
    const rows = await query<{ id: string; title: string; client_id: string; client: string; owner_id: string | null; due: string }>(
      `SELECT m.id, m.title, s.client_id, c.display_name AS client, c.owner_id, ${D("m.due_date")} AS due
       FROM sale_milestones m JOIN sales s ON s.id = m.sale_id JOIN clients c ON c.id = s.client_id
       JOIN sale_billing sb ON sb.sale_id = s.id
       LEFT JOIN invoices i ON i.id = m.invoice_id
       WHERE s.status = 'confirmed' AND m.due_date IS NOT NULL AND m.due_date <= $1::date + $2::int
         AND (m.invoice_id IS NULL OR i.status = 'cancelled') AND sb.unbilled_estimate > 0`, [today, THRESHOLDS.milestoneDays], q);
    return rows.map((r) => ({
      dedupeKey: `milestone:${r.id}`, sourceType: "sale_milestone", sourceId: r.id, clientId: r.client_id,
      title: `Raise invoice: ${r.title} for ${r.client}`, categoryKey: "billing", priorityKey: "normal", dueDate: r.due, ownerId: r.owner_id,
      triggerDate: r.due, closeReason: "milestone invoiced or no longer due",
    }));
  },
};

export const SIGNAL_RULES: SignalRule[] = [demoRequests, overdueInvoices, licenseRenewals, milestones];
