import { addMonths, differenceInCalendarDays, format, parseISO } from "date-fns";

/** Today's date in India as YYYY-MM-DD, independent of the server's or browser's timezone. */
export function todayIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

/** Whole days from today (IST) until `date` (YYYY-MM-DD). Negative once past. */
export function daysUntil(date: string, today: string = todayIST()): number {
  return differenceInCalendarDays(parseISO(date), parseISO(today));
}

/** Renewal helper: `months` after the later of the current expiry and today. */
export function suggestRenewalExpiry(currentExpiry: string, months = 12, today: string = todayIST()): string {
  const base = currentExpiry > today ? currentExpiry : today;
  return format(addMonths(parseISO(base), months), "yyyy-MM-dd");
}

export type RangePreset = "this_month" | "last_month" | "last_30" | "this_fy" | "last_fy";
export const RANGE_PRESETS: ReadonlyArray<{ value: RangePreset; label: string }> = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_30", label: "Last 30 days" },
  { value: "this_fy", label: "This financial year" },
  { value: "last_fy", label: "Last financial year" },
];

/** [from, to] as YYYY-MM-DD, relative to `today` (India date). Financial years run April-March. */
export function presetRange(preset: RangePreset, today: string = todayIST()): [string, string] {
  const t = parseISO(today);
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  const y = t.getFullYear();
  const fyStartYear = t.getMonth() >= 3 ? y : y - 1;
  switch (preset) {
    case "this_month":
      return [fmt(new Date(y, t.getMonth(), 1)), fmt(new Date(y, t.getMonth() + 1, 0))];
    case "last_month":
      return [fmt(new Date(y, t.getMonth() - 1, 1)), fmt(new Date(y, t.getMonth(), 0))];
    case "last_30":
      return [fmt(new Date(y, t.getMonth(), t.getDate() - 29)), today];
    case "this_fy":
      return [`${fyStartYear}-04-01`, `${fyStartYear + 1}-03-31`];
    case "last_fy":
      return [`${fyStartYear - 1}-04-01`, `${fyStartYear}-03-31`];
  }
}
