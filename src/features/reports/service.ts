import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/auth/errors";
import { toCsv } from "@/lib/csv";
import { isoDate, uuid } from "@/lib/validation";
import { getReport, type ReportDef, type ReportParams } from "./definitions";

const MAX_EXPORT_ROWS = 50_000;

export const reportQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  clientId: uuid.optional(),
  status: z.string().trim().max(30).optional(),
  search: z.string().trim().max(100).optional(),
  method: z.enum(["bank_transfer", "upi", "cash", "cheque", "other"]).optional(),
  entityType: z.string().trim().regex(/^[a-z_]{1,30}$/).optional(),
  sort: z.string().trim().max(30).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  format: z.enum(["json", "csv"]).default("json"),
});

export function resolveReport(key: string): ReportDef {
  const def = getReport(key);
  if (!def) throw new AppError("Report not found", 404, "NOT_FOUND");
  return def;
}

function params(def: ReportDef, q: z.infer<typeof reportQuerySchema>): ReportParams {
  if (q.from && q.to && q.from > q.to) throw new AppError("The start date is after the end date", 422, "VALIDATION_ERROR");
  if (def.statusOptions && q.status && !def.statusOptions.some((o) => o.value === q.status)) {
    throw new AppError("Unknown status filter", 422, "VALIDATION_ERROR");
  }
  return {
    from: q.from, to: q.to, clientId: q.clientId, status: q.status, search: q.search, method: q.method, entityType: q.entityType,
    sort: q.sort, dir: q.dir ?? def.defaultDir, page: q.page, pageSize: q.pageSize,
  };
}

export async function runReport(key: string, q: z.infer<typeof reportQuerySchema>) {
  const def = resolveReport(key);
  if (def.requiresClient && !q.clientId) throw new AppError("Choose a client for this report", 422, "VALIDATION_ERROR");
  const result = await def.run(params(def, q));
  return { key: def.key, title: def.title, definition: def.definition, columns: def.columns, ...result, page: q.page, pageSize: q.pageSize };
}

/** Full export honouring every filter and the sort order, capped to keep a request bounded. */
export async function exportReportCsv(key: string, q: z.infer<typeof reportQuerySchema>) {
  const def = resolveReport(key);
  if (def.requiresClient && !q.clientId) throw new AppError("Choose a client for this report", 422, "VALIDATION_ERROR");
  const p = { ...params(def, q), page: 1, pageSize: MAX_EXPORT_ROWS };
  const result = await def.run(p);
  if (result.total > MAX_EXPORT_ROWS) throw new AppError(`Too many rows to export (${result.total}). Narrow the date range or filters.`, 422, "TOO_MANY_ROWS");
  const csv = toCsv(
    def.columns.map((c) => c.label),
    result.rows.map((r) => def.columns.map((c) => r[c.key] ?? "")),
    def.columns.map((c) => c.type === "text" || c.type === "date" || c.type === "datetime"),
  );
  // The CSV stays machine-clean (one header row); the report's definition is shown on screen next to the data.
  return { filename: `${def.key}-${new Date().toISOString().slice(0, 10)}.csv`, body: csv };
}
