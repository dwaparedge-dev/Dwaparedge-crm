import { daysUntil } from "@/lib/dates";
import { SECTION_ORDER, type Section } from "./sections";
import type { TaskRow } from "./queries";

// How the Desk words and groups things. Plain functions with no React in them, so the wording and the grouping are tested
// with exact strings (tests/tasks-display.test.ts). Everything is in India time, like the rest of the Task Desk.

const IST_OFFSET_MS = 330 * 60_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** India has no daylight saving, so a fixed offset is exact: the UTC fields of the shifted date are the India clock. */
const inIndia = (ms: number) => new Date(ms + IST_OFFSET_MS);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Due today", "Due tomorrow", "Due in 3 days", "1 day late", "12 days late", or "No due date". `today` is the India date. */
export function dueText(dueDate: string | null, today: string): string {
  if (dueDate === null) return "No due date";
  const days = daysUntil(dueDate, today);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days > 1) return `Due in ${days} days`;
  return `${plural(-days, "day", "days")} late`;
}

/** The greeting for the hour it is in India: morning until noon, afternoon until 5 pm, evening after. */
export function greeting(now: Date): string {
  const hour = inIndia(now.getTime()).getUTCHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "Thursday 19 November 2026", from a `YYYY-MM-DD` date. */
export function longDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${d} ${MONTHS_LONG[m! - 1]} ${y}`;
}

/** "14 Nov 2026", from a `YYYY-MM-DD` date. */
export function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m! - 1]} ${y}`;
}

/** "19 Nov 2026, 3:30 pm": an instant (ISO 8601) on the India clock. */
export function formatWhen(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = inIndia(t);
  const hour = d.getUTCHours();
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hour % 12 || 12}:${minutes} ${hour < 12 ? "am" : "pm"}`;
}

/** The first word of a person's name, for the greeting. */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? "";

/** "1 follow-up", "3 follow-ups". */
export const followUpsText = (count: number): string => plural(count, "follow-up", "follow-ups");

/** What an auto-raised task came from, and where to open it. Not every record has a page of its own, so `href` can be null. */
export function sourceLink(type: string | null, id: string | null): { label: string; href: string | null } | null {
  if (!type || !id) return null;
  switch (type) {
    case "demo_request":
      return { label: "Demo request", href: `/demo-requests/${id}` };
    case "invoice":
      return { label: "Invoice", href: `/invoices/${id}` };
    case "license":
      return { label: "License", href: `/licenses/${id}` };
    case "sale_milestone":
      return { label: "Sale milestone", href: null };
    default:
      return { label: type, href: null };
  }
}

// ---- Grouping ----

export interface DeskFilter {
  /** Show only this category's tasks. */
  categoryId?: string | null;
  /** Show only this section's tasks. */
  section?: Section | null;
}

/** The Desk's sections narrowed to the filter. Every section is still present; the order inside each is the server's. */
export function filterSections(sections: Record<Section, TaskRow[]>, filter: DeskFilter = {}): Record<Section, TaskRow[]> {
  const out = {} as Record<Section, TaskRow[]>;
  for (const s of SECTION_ORDER) {
    out[s] = filter.section && filter.section !== s ? [] : filter.categoryId ? sections[s].filter((t) => t.category_id === filter.categoryId) : sections[s];
  }
  return out;
}

export interface CategoryBlock {
  id: string;
  name: string;
  colour: string;
  /** In section order (overdue first, parked last); inside a section, in the order the server sent them. */
  tasks: { task: TaskRow; section: Section }[];
}

/**
 * One block per category, in the order of `categories` (most tasks first), each block's tasks ordered by urgency.
 * A category with no tasks left after filtering has no block. A task whose category is not in `categories` still
 * gets one, so a task can never drop off the screen.
 */
export function groupByCategory(sections: Record<Section, TaskRow[]>, categories: { id: string; name: string; colour: string }[]): CategoryBlock[] {
  const blocks = new Map<string, CategoryBlock>(categories.map((c) => [c.id, { id: c.id, name: c.name, colour: c.colour, tasks: [] }]));
  for (const section of SECTION_ORDER) {
    for (const task of sections[section]) {
      let block = blocks.get(task.category_id);
      if (!block) {
        block = { id: task.category_id, name: task.category_name, colour: task.category_colour, tasks: [] };
        blocks.set(task.category_id, block);
      }
      block.tasks.push({ task, section });
    }
  }
  return [...blocks.values()].filter((b) => b.tasks.length > 0);
}
