// The times the follow-up and snooze dialogs offer. Plain functions with an injected `now`, so the presets are tested with exact
// values. The server checks the time again (future, at most 365 days out); this only builds the ISO string it expects.

const DAY_MS = 86_400_000;

/** The longest the server accepts a follow-up or snooze time ahead. */
export const MAX_DAYS_AHEAD = 365;

export interface Preset {
  key: "1d" | "3d" | "1w";
  label: string;
  days: number;
}

/** Follow-up next steps: +1 day, +3 days, +1 week. */
export const FOLLOW_UP_PRESETS: readonly Preset[] = [
  { key: "1d", label: "+1 day", days: 1 },
  { key: "3d", label: "+3 days", days: 3 },
  { key: "1w", label: "+1 week", days: 7 },
];

/** Snooze choices: tomorrow, in 3 days, next week. */
export const SNOOZE_PRESETS: readonly Preset[] = [
  { key: "1d", label: "Tomorrow", days: 1 },
  { key: "3d", label: "In 3 days", days: 3 },
  { key: "1w", label: "Next week", days: 7 },
];

/** `now` plus a number of days (24 hours each), as an ISO 8601 UTC time. */
export function daysFromNow(days: number, now: Date): string {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

/** What a `datetime-local` box holds (`2026-11-20T10:00`, the browser's own zone) as an ISO time; null when blank or unreadable. */
export function localToIso(value: string): string | null {
  if (value.trim() === "") return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Why a chosen time cannot be used, or null when it can. Wording matches what the server would say. */
export function whenProblem(iso: string | null, now: Date): string | null {
  if (iso === null) return "Choose a date and time";
  const t = Date.parse(iso);
  if (t <= now.getTime()) return "Choose a time in the future";
  if (t > now.getTime() + MAX_DAYS_AHEAD * DAY_MS) return `Choose a time within ${MAX_DAYS_AHEAD} days`;
  return null;
}

/** The "Follow up in (days)" field of the task form: a whole number 1..365, or blank (null). Anything else is `"invalid"`. */
export function parseDays(value: string): number | null | "invalid" {
  const v = value.trim();
  if (v === "") return null;
  if (!/^\d+$/.test(v)) return "invalid";
  const n = Number(v);
  return n >= 1 && n <= MAX_DAYS_AHEAD ? n : "invalid";
}
