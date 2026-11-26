// Pure date-range helpers (no server-only: unit-tested). Every report day is an Asia/Kolkata calendar day,
// because that is the day the people reading the dashboard live in.

export const REPORT_TZ = "Asia/Kolkata";
export const RANGE_PRESETS = ["today", "7d", "30d", "90d"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export interface ReportRange {
  /** First and last day, inclusive, as YYYY-MM-DD in Asia/Kolkata. */
  from: string;
  to: string;
  days: number;
  /** The period of the same length that ends the day before `from`, for "vs previous period". */
  prevFrom: string;
  prevTo: string;
}

const DAY_MS = 86_400_000;
const MAX_DAYS = 366;

/** Today's date in Asia/Kolkata as YYYY-MM-DD. */
export const todayIst = (now: Date = new Date()): string => new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

const toMs = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (ymd: string, n: number) => fromMs(toMs(ymd) + n * DAY_MS);

/** A preset ("7d" = today and the 6 days before) or an explicit from/to. Throws a plain Error on bad input. */
export function resolveRange(input: { range?: string; from?: string; to?: string }, now: Date = new Date()): ReportRange {
  const today = todayIst(now);
  let from: string;
  let to: string;
  if (input.from || input.to) {
    if (!input.from || !input.to) throw new Error("Give both from and to");
    from = input.from;
    to = input.to;
  } else {
    const preset = input.range ?? "30d";
    if (!(RANGE_PRESETS as readonly string[]).includes(preset)) throw new Error("Unknown range");
    const n = preset === "today" ? 1 : Number.parseInt(preset, 10);
    to = today;
    from = addDays(today, -(n - 1));
  }
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && fromMs(toMs(s)) === s;
  if (!valid(from) || !valid(to)) throw new Error("Use valid dates (YYYY-MM-DD)");
  if (to > today) to = today;
  if (from > to) throw new Error("The start date is after the end date");
  const days = (toMs(to) - toMs(from)) / DAY_MS + 1;
  if (days > MAX_DAYS) throw new Error(`Pick at most ${MAX_DAYS} days`);
  return { from, to, days, prevFrom: addDays(from, -days), prevTo: addDays(from, -1) };
}

/** Every day from..to inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
