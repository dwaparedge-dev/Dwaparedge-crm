import "server-only";
import { db } from "@/lib/db";
import { likePattern } from "@/lib/validation";

export type ColType = "text" | "money" | "date" | "number" | "datetime";
export interface Column { key: string; label: string; type: ColType }
export type FilterKey = "dateRange" | "client" | "status" | "search" | "method" | "entityType";

export interface ReportParams {
  from?: string;
  to?: string;
  clientId?: string;
  status?: string;
  search?: string;
  method?: string;
  entityType?: string;
  sort?: string;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}
export interface ReportResult {
  rows: Record<string, string | number | null>[];
  total: number;
  summary: { label: string; value: string; type: "money" | "number" }[];
}
export interface ReportDef {
  key: string;
  title: string;
  description: string;
  /** Plain-language meaning of the numbers, shown above the table and in exports. */
  definition: string;
  filters: FilterKey[];
  dateLabel?: string;
  /** Needs a client chosen before it can run (the ledger). */
  requiresClient?: boolean;
  statusOptions?: { value: string; label: string }[];
  columns: Column[];
  defaultSort: string;
  defaultDir: "asc" | "desc";
  sorts: Record<string, string>;
  run: (p: ReportParams) => Promise<ReportResult>;
}

const TODAY = "(now() AT TIME ZONE 'Asia/Kolkata')::date";
const METHOD_LABEL = (col: string) => `CASE ${col} WHEN 'bank_transfer' THEN 'Bank transfer' WHEN 'upi' THEN 'UPI' WHEN 'cash' THEN 'Cash' WHEN 'cheque' THEN 'Cheque' ELSE 'Other' END`;
const PAID = (alias: string) => `COALESCE((SELECT sum(a.amount) FROM payment_allocations a WHERE a.invoice_id = ${alias}.id AND a.reversed_at IS NULL), 0)`;

class Where {
  parts: string[] = [];
  values: unknown[] = [];
  add(sql: (ph: string) => string, v: unknown) {
    this.values.push(v);
    this.parts.push(sql(`$${this.values.length}`));
  }
  raw(sql: string) {
    this.parts.push(sql);
  }
  get sql() {
    return this.parts.length ? "WHERE " + this.parts.join(" AND ") : "";
  }
}

function order(def: { sorts: Record<string, string>; defaultSort: string }, p: ReportParams, tiebreak: string) {
  const col = def.sorts[p.sort ?? ""] ?? def.sorts[def.defaultSort]!;
  return `ORDER BY ${col} ${p.dir === "desc" ? "DESC" : "ASC"} NULLS LAST, ${tiebreak}`;
}

type Row = Record<string, string | number | null>;
async function paged(sqlBody: string, w: Where, p: ReportParams, orderBy: string) {
  const limit = p.pageSize;
  const offset = (p.page - 1) * p.pageSize;
  const rows = await db.query<Row & { total_rows: string }>(
    `SELECT *, count(*) OVER() AS total_rows FROM (${sqlBody}) r ${orderBy} LIMIT ${limit} OFFSET ${offset}`,
    w.values,
  );
  return {
    rows: rows.map((r) => {
      const { total_rows, ...rest } = r;
      void total_rows;
      return rest as Row;
    }),
    total: Number(rows[0]?.total_rows ?? 0),
  };
}

const INVOICE_STATUS_SQL = (a: string, paid: string) => `CASE ${a}.status WHEN 'draft' THEN 'Draft' WHEN 'cancelled' THEN 'Cancelled'
  ELSE CASE WHEN ${paid} >= ${a}.total THEN 'Paid' WHEN ${a}.due_date < ${TODAY} THEN 'Overdue' WHEN ${paid} > 0 THEN 'Partially paid' ELSE 'Unpaid' END END`;

const money = (key: string, label: string): Column => ({ key, label, type: "money" });
const text = (key: string, label: string): Column => ({ key, label, type: "text" });
const date = (key: string, label: string): Column => ({ key, label, type: "date" });

export const REPORTS: ReportDef[] = [
  {
    key: "clients",
    title: "Client directory",
    description: "Every client with contact details, owner and status.",
    definition: "One row per client. Archived clients are included only when you choose the Archived status.",
    filters: ["status", "search"],
    statusOptions: [{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }],
    columns: [text("name", "Client"), text("legal_name", "Legal name"), text("gstin", "GSTIN"), text("email", "Email"), text("phone", "Phone"), text("city", "City"), text("state_code", "State code"), text("owner", "Owner"), text("status", "Status"), date("created", "Created")],
    defaultSort: "name", defaultDir: "asc",
    sorts: { name: "r.name", created: "r.created", status: "r.status", city: "r.city" },
    async run(p) {
      const w = new Where();
      w.raw(p.status === "archived" ? "c.archived_at IS NOT NULL" : "c.archived_at IS NULL");
      if (p.search) w.add((x) => `(c.legal_name ILIKE ${x} OR c.display_name ILIKE ${x} OR c.gstin ILIKE ${x} OR c.email ILIKE ${x} OR c.city ILIKE ${x})`, likePattern(p.search));
      const body = `SELECT c.display_name AS name, c.legal_name, c.gstin, c.email, c.phone, c.city, c.state_code, u.name AS owner,
        CASE WHEN c.archived_at IS NOT NULL THEN 'Archived' ELSE 'Active' END AS status,
        to_char(c.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS created
        FROM clients c LEFT JOIN users u ON u.id = c.owner_id ${w.sql}`;
      const r = await paged(body, w, p, order(this, p, "r.name"));
      return { ...r, summary: [{ label: "Clients", value: String(r.total), type: "number" }] };
    },
  },
  {
    key: "sales",
    title: "Sales pipeline",
    description: "Sales by status, with their estimated value.",
    definition: "Estimated value (including GST) of sales recorded in the period. It is what was agreed, not what has been invoiced or collected. Cancelled sales are excluded from the value total.",
    filters: ["dateRange", "client", "status", "search"], dateLabel: "Sale date",
    statusOptions: ["draft", "confirmed", "completed", "cancelled"].map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) })),
    columns: [text("number", "Sale"), text("client", "Client"), text("type", "Type"), text("title", "Title"), text("status", "Status"), date("sale_date", "Sale date"), text("owner", "Owner"), money("total", "Estimated value")],
    defaultSort: "sale_date", defaultDir: "desc",
    sorts: { sale_date: "r.sale_date", number: "r.number", client: "r.client", total: "r.total", status: "r.status" },
    async run(p) {
      const w = new Where();
      if (p.from) w.add((x) => `s.sale_date >= ${x}`, p.from);
      if (p.to) w.add((x) => `s.sale_date <= ${x}`, p.to);
      if (p.clientId) w.add((x) => `s.client_id = ${x}`, p.clientId);
      if (p.status) w.add((x) => `s.status = ${x}`, p.status);
      if (p.search) w.add((x) => `(s.sale_number ILIKE ${x} OR s.title ILIKE ${x} OR c.display_name ILIKE ${x})`, likePattern(p.search));
      const from = `FROM sales s JOIN clients c ON c.id = s.client_id LEFT JOIN users u ON u.id = s.owner_id ${w.sql}`;
      const body = `SELECT s.sale_number AS number, c.display_name AS client, initcap(s.type) AS type, s.title, initcap(s.status) AS status,
        to_char(s.sale_date,'YYYY-MM-DD') AS sale_date, u.name AS owner, s.total FROM sales s JOIN clients c ON c.id = s.client_id LEFT JOIN users u ON u.id = s.owner_id ${w.sql}`;
      const r = await paged(body, w, p, order(this, p, "r.number"));
      const sum = await db.queryOne<{ v: string | null }>(`SELECT sum(s.total) FILTER (WHERE s.status <> 'cancelled') AS v ${from}`, w.values);
      return { ...r, summary: [{ label: "Sales", value: String(r.total), type: "number" }, { label: "Estimated value (excl. cancelled)", value: sum?.v ?? "0.00", type: "money" }] };
    },
  },
  {
    key: "salebilling",
    title: "Sales: billing and collection",
    description: "For each sale: what is billed, what is paid, what is still due and what is left to bill.",
    definition: "Order value = the sale's total incl. GST. Billed = issued invoices against it. Paid = payments allocated to those invoices plus any advance received for the sale and not yet allocated. Due on invoices = billed minus allocated payments. Still to bill = the part of the order not yet on an issued invoice (an estimate incl. GST at the sale's rates). Balance remaining = billed + still to bill − paid. Cancelled sales are excluded.",
    filters: ["dateRange", "client", "status", "search"], dateLabel: "Sale date",
    statusOptions: ["draft", "confirmed", "completed"].map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) })),
    columns: [text("number", "Sale"), text("client", "Client"), text("title", "Title"), text("status", "Status"), money("order_value", "Order value"), money("billed", "Billed"), money("paid", "Paid"), money("due", "Due on invoices"), money("advance", "Advance (unallocated)"), money("to_bill", "Still to bill"), money("balance", "Balance remaining")],
    defaultSort: "balance", defaultDir: "desc",
    sorts: { balance: "r.balance", number: "r.number", client: "r.client", order_value: "r.order_value", billed: "r.billed", paid: "r.paid", due: "r.due", to_bill: "r.to_bill" },
    async run(p) {
      const w = new Where();
      w.raw("s.status <> 'cancelled'");
      if (p.from) w.add((x) => `s.sale_date >= ${x}`, p.from);
      if (p.to) w.add((x) => `s.sale_date <= ${x}`, p.to);
      if (p.clientId) w.add((x) => `s.client_id = ${x}`, p.clientId);
      if (p.status) w.add((x) => `s.status = ${x}`, p.status);
      if (p.search) w.add((x) => `(s.sale_number ILIKE ${x} OR s.title ILIKE ${x} OR c.display_name ILIKE ${x})`, likePattern(p.search));
      const from = `FROM sales s JOIN clients c ON c.id = s.client_id JOIN sale_billing sb ON sb.sale_id = s.id ${w.sql}`;
      const body = `SELECT s.sale_number AS number, c.display_name AS client, s.title, initcap(s.status) AS status, s.total AS order_value, sb.billed_total AS billed,
        (sb.paid_on_invoices + sb.advance) AS paid, (sb.billed_total - sb.paid_on_invoices) AS due, sb.advance, sb.unbilled_estimate AS to_bill,
        GREATEST(sb.billed_total + sb.unbilled_estimate - sb.paid_on_invoices - sb.advance, 0.00) AS balance ${from}`;
      const r = await paged(body, w, p, order(this, p, "r.number"));
      const agg = await db.queryOne<{ order_value: string | null; billed: string | null; paid: string | null; due: string | null; to_bill: string | null }>(
        `SELECT sum(s.total) AS order_value, sum(sb.billed_total) AS billed, sum(sb.paid_on_invoices + sb.advance) AS paid, sum(sb.billed_total - sb.paid_on_invoices) AS due, sum(sb.unbilled_estimate) AS to_bill ${from}`, w.values);
      return { ...r, summary: [
        { label: "Sales", value: String(r.total), type: "number" }, { label: "Order value", value: agg?.order_value ?? "0.00", type: "money" }, { label: "Billed", value: agg?.billed ?? "0.00", type: "money" },
        { label: "Paid", value: agg?.paid ?? "0.00", type: "money" }, { label: "Due on invoices", value: agg?.due ?? "0.00", type: "money" }, { label: "Still to bill", value: agg?.to_bill ?? "0.00", type: "money" },
      ] };
    },
  },
  {
    key: "invoices",
    title: "Invoices",
    description: "Invoices by date and status.",
    definition: "Invoiced = total of issued invoices dated in the period (drafts and cancelled invoices are listed but never counted). Paid = payments allocated to the invoice. Balance = total minus paid, for issued invoices.",
    filters: ["dateRange", "client", "status", "search"], dateLabel: "Invoice date",
    statusOptions: [["draft", "Draft"], ["unpaid", "Unpaid"], ["partial", "Partially paid"], ["overdue", "Overdue"], ["paid", "Paid"], ["cancelled", "Cancelled"]].map(([value, label]) => ({ value: value!, label: label! })),
    columns: [text("number", "Invoice"), text("sale", "Sale"), text("client", "Client"), date("issue_date", "Date"), date("due_date", "Due"), text("status", "Status"), money("total", "Total"), money("paid", "Paid"), money("balance", "Balance")],
    defaultSort: "issue_date", defaultDir: "desc",
    sorts: { issue_date: "r.issue_date", due_date: "r.due_date", number: "r.number", client: "r.client", total: "r.total", balance: "r.balance" },
    async run(p) {
      const w = new Where();
      if (p.from) w.add((x) => `i.issue_date >= ${x}`, p.from);
      if (p.to) w.add((x) => `i.issue_date <= ${x}`, p.to);
      if (p.clientId) w.add((x) => `i.client_id = ${x}`, p.clientId);
      if (p.search) w.add((x) => `(i.invoice_number ILIKE ${x} OR c.display_name ILIKE ${x})`, likePattern(p.search));
      const paid = PAID("i");
      if (p.status === "draft" || p.status === "cancelled") w.add((x) => `i.status = ${x}`, p.status);
      else if (p.status === "paid") w.raw(`i.status = 'issued' AND ${paid} >= i.total`);
      else if (p.status === "partial") w.raw(`i.status = 'issued' AND ${paid} > 0 AND ${paid} < i.total`);
      else if (p.status === "unpaid") w.raw(`i.status = 'issued' AND ${paid} = 0 AND i.total > 0`);
      else if (p.status === "overdue") w.raw(`i.status = 'issued' AND i.total - ${paid} > 0 AND i.due_date < ${TODAY}`);
      const body = `SELECT COALESCE(i.invoice_number, 'Draft') AS number, sl.sale_number AS sale, c.display_name AS client, to_char(i.issue_date,'YYYY-MM-DD') AS issue_date,
        to_char(i.due_date,'YYYY-MM-DD') AS due_date, ${INVOICE_STATUS_SQL("i", paid)} AS status, i.total,
        CASE WHEN i.status = 'issued' THEN ${paid} ELSE NULL END AS paid,
        CASE WHEN i.status = 'issued' THEN i.total - ${paid} ELSE NULL END AS balance
        FROM invoices i JOIN clients c ON c.id = i.client_id JOIN sales sl ON sl.id = i.sale_id ${w.sql}`;
      const r = await paged(body, w, p, order(this, p, "r.number"));
      const agg = await db.queryOne<{ invoiced: string | null; outstanding: string | null }>(
        `SELECT sum(i.total) FILTER (WHERE i.status = 'issued') AS invoiced, sum(i.total - ${paid}) FILTER (WHERE i.status = 'issued') AS outstanding
         FROM invoices i JOIN clients c ON c.id = i.client_id JOIN sales sl ON sl.id = i.sale_id ${w.sql}`, w.values);
      return { ...r, summary: [{ label: "Invoices listed", value: String(r.total), type: "number" }, { label: "Invoiced (issued)", value: agg?.invoiced ?? "0.00", type: "money" }, { label: "Outstanding on these", value: agg?.outstanding ?? "0.00", type: "money" }] };
    },
  },
  {
    key: "payments",
    title: "Payments collected",
    description: "Payments received, by date and method.",
    definition: "Collected = money actually received (payment date in the period), excluding voided payments. It is independent of invoice totals. Unallocated = received but not yet applied to an invoice (advance on account).",
    filters: ["dateRange", "client", "method", "search"], dateLabel: "Payment date",
    columns: [text("receipt", "Receipt"), text("client", "Client"), date("payment_date", "Date"), text("method", "Method"), text("reference", "Reference"), money("amount", "Amount"), money("unallocated", "Unallocated")],
    defaultSort: "payment_date", defaultDir: "desc",
    sorts: { payment_date: "r.payment_date", receipt: "r.receipt", client: "r.client", amount: "r.amount" },
    async run(p) {
      const w = new Where();
      w.raw("pm.voided_at IS NULL");
      if (p.from) w.add((x) => `pm.payment_date >= ${x}`, p.from);
      if (p.to) w.add((x) => `pm.payment_date <= ${x}`, p.to);
      if (p.clientId) w.add((x) => `pm.client_id = ${x}`, p.clientId);
      if (p.method) w.add((x) => `pm.method = ${x}`, p.method);
      if (p.search) w.add((x) => `(pm.receipt_number ILIKE ${x} OR pm.reference ILIKE ${x} OR c.display_name ILIKE ${x})`, likePattern(p.search));
      const alloc = `COALESCE((SELECT sum(a.amount) FROM payment_allocations a WHERE a.payment_id = pm.id AND a.reversed_at IS NULL), 0)`;
      const body = `SELECT pm.receipt_number AS receipt, c.display_name AS client, to_char(pm.payment_date,'YYYY-MM-DD') AS payment_date,
        ${METHOD_LABEL("pm.method")} AS method, pm.reference, pm.amount, pm.amount - ${alloc} AS unallocated
        FROM payments pm JOIN clients c ON c.id = pm.client_id ${w.sql}`;
      const r = await paged(body, w, p, order(this, p, "r.receipt"));
      const agg = await db.queryOne<{ collected: string | null; unalloc: string | null }>(
        `SELECT sum(pm.amount) AS collected, sum(pm.amount - ${alloc}) AS unalloc FROM payments pm JOIN clients c ON c.id = pm.client_id ${w.sql}`, w.values);
      return { ...r, summary: [{ label: "Payments", value: String(r.total), type: "number" }, { label: "Collected", value: agg?.collected ?? "0.00", type: "money" }, { label: "Unallocated (advances)", value: agg?.unalloc ?? "0.00", type: "money" }] };
    },
  },
  {
    key: "outstanding",
    title: "Outstanding receivables",
    description: "What each client owes, with ageing by days overdue.",
    definition: "Outstanding = total of issued, uncancelled invoices minus payments allocated to them, as of today. Ageing buckets count days past the due date. Advances that are not yet allocated are not netted off here (see the client ledger for the account position).",
    filters: ["client", "search"],
    columns: [text("client", "Client"), { key: "open_invoices", label: "Open invoices", type: "number" }, date("oldest_due", "Oldest due"), money("not_due", "Not yet due"), money("d1_30", "1-30 days"), money("d31_60", "31-60 days"), money("d61_90", "61-90 days"), money("d90_plus", "90+ days"), money("outstanding", "Outstanding")],
    defaultSort: "outstanding", defaultDir: "desc",
    sorts: { outstanding: "r.outstanding", client: "r.client", oldest_due: "r.oldest_due", open_invoices: "r.open_invoices" },
    async run(p) {
      const w = new Where();
      if (p.clientId) w.add((x) => `c.id = ${x}`, p.clientId);
      if (p.search) w.add((x) => `c.display_name ILIKE ${x}`, likePattern(p.search));
      const body = `SELECT c.display_name AS client, count(*)::int AS open_invoices, to_char(min(o.due_date),'YYYY-MM-DD') AS oldest_due,
        COALESCE(sum(o.balance) FILTER (WHERE o.over <= 0), 0) AS not_due,
        COALESCE(sum(o.balance) FILTER (WHERE o.over BETWEEN 1 AND 30), 0) AS d1_30,
        COALESCE(sum(o.balance) FILTER (WHERE o.over BETWEEN 31 AND 60), 0) AS d31_60,
        COALESCE(sum(o.balance) FILTER (WHERE o.over BETWEEN 61 AND 90), 0) AS d61_90,
        COALESCE(sum(o.balance) FILTER (WHERE o.over > 90), 0) AS d90_plus,
        sum(o.balance) AS outstanding
        FROM (SELECT i.client_id, i.due_date, i.total - ${PAID("i")} AS balance, (${TODAY} - i.due_date) AS over
              FROM invoices i WHERE i.status = 'issued' AND i.total - ${PAID("i")} > 0) o
        JOIN clients c ON c.id = o.client_id ${w.sql} GROUP BY c.id, c.display_name`;
      const r = await paged(body, w, p, order(this, p, "r.client"));
      const sum = r.rows.length ? await db.queryOne<{ v: string | null }>(`SELECT sum(outstanding) AS v FROM (${body}) t`, w.values) : null;
      return { ...r, summary: [{ label: "Clients with a balance", value: String(r.total), type: "number" }, { label: "Total outstanding", value: sum?.v ?? "0.00", type: "money" }] };
    },
  },
  {
    key: "overdue",
    title: "Overdue invoices",
    description: "Issued invoices past their due date that still have a balance.",
    definition: "Overdue = issued, uncancelled invoice with a balance greater than zero and a due date before today. Days overdue counts from the due date.",
    filters: ["client", "search"],
    columns: [text("number", "Invoice"), text("client", "Client"), date("due_date", "Due"), { key: "days_overdue", label: "Days overdue", type: "number" }, money("total", "Total"), money("paid", "Paid"), money("balance", "Balance")],
    defaultSort: "days_overdue", defaultDir: "desc",
    sorts: { days_overdue: "r.days_overdue", due_date: "r.due_date", client: "r.client", balance: "r.balance", number: "r.number" },
    async run(p) {
      const w = new Where();
      const paid = PAID("i");
      w.raw(`i.status = 'issued' AND i.total - ${paid} > 0 AND i.due_date < ${TODAY}`);
      if (p.clientId) w.add((x) => `i.client_id = ${x}`, p.clientId);
      if (p.search) w.add((x) => `(i.invoice_number ILIKE ${x} OR c.display_name ILIKE ${x})`, likePattern(p.search));
      const body = `SELECT i.invoice_number AS number, c.display_name AS client, to_char(i.due_date,'YYYY-MM-DD') AS due_date, (${TODAY} - i.due_date)::int AS days_overdue,
        i.total, ${paid} AS paid, i.total - ${paid} AS balance FROM invoices i JOIN clients c ON c.id = i.client_id ${w.sql}`;
      const r = await paged(body, w, p, order(this, p, "r.number"));
      const sum = await db.queryOne<{ v: string | null }>(`SELECT sum(i.total - ${paid}) AS v FROM invoices i JOIN clients c ON c.id = i.client_id ${w.sql}`, w.values);
      return { ...r, summary: [{ label: "Overdue invoices", value: String(r.total), type: "number" }, { label: "Overdue balance", value: sum?.v ?? "0.00", type: "money" }] };
    },
  },
  {
    key: "licenses",
    title: "License status",
    description: "The license register with status and days remaining.",
    definition: "Status 'Expired' means an active license whose expiry date has passed (worked out from the date, so it is never out of date). Days remaining is counted from today in India time.",
    filters: ["client", "status", "search"],
    statusOptions: ["pending", "active", "expired", "suspended", "revoked"].map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) })),
    columns: [text("identifier", "License"), text("client", "Client"), text("product", "Product"), text("plan", "Plan"), date("start_date", "Start"), date("expiry_date", "Expiry"), { key: "days_remaining", label: "Days remaining", type: "number" }, { key: "seats", label: "Seats", type: "number" }, text("status", "Status"), money("renewal_price", "Renewal price")],
    defaultSort: "expiry_date", defaultDir: "asc",
    sorts: { expiry_date: "r.expiry_date", client: "r.client", status: "r.status", identifier: "r.identifier" },
    async run(p) {
      const w = new Where();
      const eff = `CASE WHEN l.status = 'active' AND l.expiry_date < ${TODAY} THEN 'expired' ELSE l.status END`;
      if (p.clientId) w.add((x) => `l.client_id = ${x}`, p.clientId);
      if (p.status) w.add((x) => `${eff} = ${x}`, p.status);
      if (p.search) w.add((x) => `(l.license_identifier ILIKE ${x} OR c.display_name ILIKE ${x} OR pr.name ILIKE ${x} OR l.plan ILIKE ${x})`, likePattern(p.search));
      const body = `SELECT l.license_identifier AS identifier, c.display_name AS client, pr.name AS product, l.plan, to_char(l.start_date,'YYYY-MM-DD') AS start_date,
        to_char(l.expiry_date,'YYYY-MM-DD') AS expiry_date, CASE WHEN l.status IN ('active') THEN (l.expiry_date - ${TODAY})::int END AS days_remaining,
        l.seat_limit AS seats, initcap(${eff}) AS status, l.renewal_price
        FROM licenses l JOIN clients c ON c.id = l.client_id JOIN products pr ON pr.id = l.product_id ${w.sql}`;
      const r = await paged(body, w, p, order(this, p, "r.identifier"));
      return { ...r, summary: [{ label: "Licenses", value: String(r.total), type: "number" }] };
    },
  },
  {
    key: "renewals",
    title: "Upcoming renewals",
    description: "Active licenses expiring in a date range, with expected renewal value.",
    definition: "Lists active licenses whose expiry date falls in the range. To include licenses that have already expired without being renewed, start the range earlier or choose All time. Expected value = sum of renewal prices: it is a projection, not an invoice or a payment, and licenses with no renewal price count as zero.",
    filters: ["dateRange", "client", "search"], dateLabel: "Expiry date",
    columns: [text("identifier", "License"), text("client", "Client"), text("product", "Product"), text("plan", "Plan"), date("expiry_date", "Expiry"), { key: "days_remaining", label: "Days remaining", type: "number" }, money("renewal_price", "Renewal price"), text("renewal_terms", "Renewal terms")],
    defaultSort: "expiry_date", defaultDir: "asc",
    sorts: { expiry_date: "r.expiry_date", client: "r.client", renewal_price: "r.renewal_price" },
    async run(p) {
      const w = new Where();
      w.raw("l.status = 'active'");
      if (p.from) w.add((x) => `l.expiry_date >= ${x}`, p.from);
      if (p.to) w.add((x) => `l.expiry_date <= ${x}`, p.to);
      if (p.clientId) w.add((x) => `l.client_id = ${x}`, p.clientId);
      if (p.search) w.add((x) => `(l.license_identifier ILIKE ${x} OR c.display_name ILIKE ${x} OR pr.name ILIKE ${x})`, likePattern(p.search));
      const from = `FROM licenses l JOIN clients c ON c.id = l.client_id JOIN products pr ON pr.id = l.product_id ${w.sql}`;
      const body = `SELECT l.license_identifier AS identifier, c.display_name AS client, pr.name AS product, l.plan, to_char(l.expiry_date,'YYYY-MM-DD') AS expiry_date,
        (l.expiry_date - ${TODAY})::int AS days_remaining, l.renewal_price, l.renewal_terms ${from}`;
      const r = await paged(body, w, p, order(this, p, "r.identifier"));
      const sum = await db.queryOne<{ v: string | null }>(`SELECT sum(l.renewal_price) AS v ${from}`, w.values);
      return { ...r, summary: [{ label: "Licenses due", value: String(r.total), type: "number" }, { label: "Expected renewal value (projected)", value: sum?.v ?? "0.00", type: "money" }] };
    },
  },
  {
    key: "ledger",
    title: "Client transaction history",
    description: "A client's invoices and payments in date order with a running balance.",
    definition: "Debit = issued invoices (cancelled ones are left out). Credit = payments received (voided ones are left out), whether or not they are allocated. Balance = debits minus credits to date, so an advance shows as a negative balance (the client has paid ahead). The opening balance before your date range is already included in the running balance.",
    filters: ["dateRange", "client"], dateLabel: "Date", requiresClient: true,
    columns: [date("date", "Date"), text("kind", "Type"), text("document", "Document"), text("detail", "Detail"), money("debit", "Debit (invoiced)"), money("credit", "Credit (received)"), money("balance", "Balance")],
    defaultSort: "date", defaultDir: "asc",
    sorts: { date: "r.sort_key" },
    async run(p) {
      if (!p.clientId) return { rows: [], total: 0, summary: [] };
      const w = new Where();
      w.add((x) => `client_id = ${x}`, p.clientId);
      const base = `SELECT * FROM (
          SELECT to_char(date,'YYYY-MM-DD') AS date, kind, document, detail, debit, credit, sort_key,
                 sum(debit - credit) OVER (ORDER BY sort_key, document ROWS UNBOUNDED PRECEDING) AS balance, date AS d
          FROM (
            SELECT i.issue_date AS date, 'Invoice' AS kind, i.invoice_number AS document, (SELECT sl.sale_number FROM sales sl WHERE sl.id = i.sale_id) AS detail, i.total AS debit, 0::numeric AS credit,
                   (i.issue_date::text || '1' || lpad(extract(epoch from i.issued_at)::bigint::text, 12, '0')) AS sort_key, i.client_id
              FROM invoices i WHERE i.status = 'issued'
            UNION ALL
            SELECT pm.payment_date, 'Payment', pm.receipt_number, ${METHOD_LABEL("pm.method")} || COALESCE(' · ' || pm.reference, ''), 0::numeric, pm.amount,
                   (pm.payment_date::text || '2' || lpad(extract(epoch from pm.created_at)::bigint::text, 12, '0')), pm.client_id
              FROM payments pm WHERE pm.voided_at IS NULL
          ) u ${w.sql}
        ) x`;
      const filters: string[] = [];
      if (p.from) { w.values.push(p.from); filters.push(`d >= $${w.values.length}`); }
      if (p.to) { w.values.push(p.to); filters.push(`d <= $${w.values.length}`); }
      const body = `${base} ${filters.length ? "WHERE " + filters.join(" AND ") : ""}`;
      const r = await paged(body, w, p, order(this, p, "r.document"));
      const closing = await db.queryOne<{ debit: string | null; credit: string | null }>(
        `SELECT sum(debit) AS debit, sum(credit) AS credit FROM (${body}) t`, w.values);
      const bal = Number(closing?.debit ?? 0) - Number(closing?.credit ?? 0);
      return {
        ...r,
        rows: r.rows.map(({ sort_key, d, ...rest }) => { void sort_key; void d; return rest; }),
        summary: [{ label: "Invoiced in range", value: closing?.debit ?? "0.00", type: "money" }, { label: "Received in range", value: closing?.credit ?? "0.00", type: "money" }, { label: "Net of range (invoiced − received)", value: bal.toFixed(2), type: "money" }],
      };
    },
  },
  {
    key: "activity",
    title: "Activity log",
    description: "Who did what and when, across clients, licenses, invoices and payments.",
    definition: "A permanent audit trail of changes. Each entry records the user and the time; entries are never edited or deleted.",
    filters: ["dateRange", "entityType", "search"], dateLabel: "Date",
    columns: [{ key: "at", label: "When", type: "datetime" }, text("user", "User"), text("entity", "Type"), text("action", "Action"), text("summary", "Summary")],
    defaultSort: "at", defaultDir: "desc",
    sorts: { at: "r.at", user: "r.user", entity: "r.entity" },
    async run(p) {
      const w = new Where();
      if (p.from) w.add((x) => `(a.created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${x}`, p.from);
      if (p.to) w.add((x) => `(a.created_at AT TIME ZONE 'Asia/Kolkata')::date <= ${x}`, p.to);
      if (p.entityType) w.add((x) => `a.entity_type = ${x}`, p.entityType);
      if (p.search) w.add((x) => `(a.summary ILIKE ${x} OR u.name ILIKE ${x})`, likePattern(p.search));
      const body = `SELECT to_char(a.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS at, u.name AS "user", initcap(a.entity_type) AS entity, a.action, a.summary, a.id
        FROM activity_log a LEFT JOIN users u ON u.id = a.actor_id ${w.sql}`;
      const r = await paged(body, w, p, order(this, p, "r.id DESC"));
      return { ...r, rows: r.rows.map(({ id, ...rest }) => { void id; return rest; }), summary: [{ label: "Entries", value: String(r.total), type: "number" }] };
    },
  },
];

export const getReport = (key: string) => REPORTS.find((r) => r.key === key);
