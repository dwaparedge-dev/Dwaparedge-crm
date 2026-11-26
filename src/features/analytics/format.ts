// Pure display helpers for the analytics screens (unit-tested).

export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits).replace(/\.0+$/, "")}%`;

/** 75 -> "1m 15s". */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** "+12%", "-5%", or "new" when the previous period had none, or "" when both are zero. */
export function change(now: number, before: number): string {
  if (!before) return now ? "new" : "";
  const d = Math.round(((now - before) / before) * 100);
  return `${d > 0 ? "+" : ""}${d}%`;
}

/** Spreadsheet-safe CSV: quotes everything, doubles quotes, and defuses cells that start like a formula. */
export function toCsv(rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

const REGION = typeof Intl !== "undefined" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
/** "IN" -> "India"; anything unknown comes back as given. */
export function countryName(code: string | null | undefined): string {
  if (!code) return "Unknown";
  try { return REGION?.of(code.toUpperCase()) ?? code; } catch { return code; }
}

export const SECTION_LABEL: Record<string, string> = {
  section_about: "About", section_products: "Platform", section_approach: "How we work", section_why: "Why switch", section_founders: "Founders", section_contact: "Contact form",
};

/** "Ahmedabad, Gujarat, India"; parts the host could not determine are skipped, and nothing at all reads "Location not available". */
export function placeLabel(p: { city?: string | null; region?: string | null; country?: string | null }): string {
  const parts = [p.city, p.region, p.country ? countryName(p.country) : null].filter((x): x is string => Boolean(x));
  return parts.length ? parts.join(", ") : "Location not available";
}
