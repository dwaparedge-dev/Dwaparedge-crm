import { daysUntil, todayIST } from "@/lib/dates";
import { ACTIVE_STATUSES, type TaskStatus } from "./schema";
import { THRESHOLDS } from "./thresholds";

/**
 * Which Desk section a task lands in. Urgency is derived from time and never stored, and this file is the one
 * definition of it: the Desk query, the badge and the UI all go through these functions.
 */
export type Section = "parked" | "overdue" | "followups_due" | "today" | "next7" | "later";

/** The order the Desk lists its sections in. Parked sits last: those tasks have left the founder's list for now. */
export const SECTION_ORDER: Section[] = ["overdue", "followups_due", "today", "next7", "later", "parked"];

/** The "Next 7 days" section runs from tomorrow to today + 7, inclusive. */
const NEXT_DAYS = 7;

export interface SectionInput {
  status: TaskStatus;
  /** `YYYY-MM-DD` */
  dueDate: string | null;
  /** An ISO 8601 date and time with an offset or Z. */
  followUpAt: string | null;
}

const isActive = (status: TaskStatus) => (ACTIVE_STATUSES as readonly TaskStatus[]).includes(status);

/** The follow-up as a timestamp, or null when there is none (or it cannot be read, which then counts as none). */
function followUpTime(t: SectionInput): number | null {
  if (t.followUpAt === null) return null;
  const ms = Date.parse(t.followUpAt);
  return Number.isNaN(ms) ? null : ms;
}

/** Active and the follow-up time is still ahead: the task has left the list until then. */
function isParked(t: SectionInput, now: Date): boolean {
  const at = followUpTime(t);
  return isActive(t.status) && at !== null && at > now.getTime();
}

/**
 * The follow-up time has passed (it has returned from Parked), whatever the due date says: a task that is overdue
 * and has also returned keeps the "follow-up due" tag in the Overdue section.
 */
export function isFollowUpDue(t: SectionInput, now: Date = new Date()): boolean {
  const at = followUpTime(t);
  return isActive(t.status) && at !== null && at <= now.getTime();
}

/** Followed up often enough, without closing, that repeated chasing deserves a second look. */
export function isStuck(followUpCount: number): boolean {
  return followUpCount >= THRESHOLDS.stuckAfter;
}

/**
 * The first section that matches, in this order: parked, overdue, followups_due, today, next7, later. Parked wins
 * over everything, overdue included. Done and cancelled tasks are on no section (null). "Today" is the India date.
 */
export function sectionOf(t: SectionInput, now: Date = new Date()): Section | null {
  if (!isActive(t.status)) return null;
  if (isParked(t, now)) return "parked";

  const today = todayIST(now);
  const days = t.dueDate === null ? null : daysUntil(t.dueDate, today);

  if (days !== null && days < 0) return "overdue";
  if (isFollowUpDue(t, now)) return "followups_due";
  if (days === 0) return "today";
  if (days !== null && days <= NEXT_DAYS) return "next7";
  return "later";
}

/** Priority rank (1 = most urgent), then earliest due date (no date last), then oldest first. For `Array.sort`. */
export function compareTasks(
  a: { priorityRank: number; dueDate: string | null; createdAt: string },
  b: { priorityRank: number; dueDate: string | null; createdAt: string },
): number {
  if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;

  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1; // YYYY-MM-DD sorts as text
  }

  // As instants: the same moment can be written with different offsets. An unreadable time ties.
  return Date.parse(a.createdAt) - Date.parse(b.createdAt) || 0;
}

export interface DeskCounts {
  overdue: number;
  followUpsDue: number;
  dueToday: number;
  next7: number;
  parked: number;
  /** Parked tasks whose due date is already before today: hidden, but past their deadline. */
  parkedLate: number;
  /** Overdue plus follow-ups due. Parked tasks are not counted. */
  badge: number;
}

export function countSections(tasks: SectionInput[], now: Date = new Date()): DeskCounts {
  const today = todayIST(now);
  const counts: DeskCounts = { overdue: 0, followUpsDue: 0, dueToday: 0, next7: 0, parked: 0, parkedLate: 0, badge: 0 };

  for (const t of tasks) {
    switch (sectionOf(t, now)) {
      case "overdue":
        counts.overdue++;
        break;
      case "followups_due":
        counts.followUpsDue++;
        break;
      case "today":
        counts.dueToday++;
        break;
      case "next7":
        counts.next7++;
        break;
      case "parked":
        counts.parked++;
        if (t.dueDate !== null && daysUntil(t.dueDate, today) < 0) counts.parkedLate++;
        break;
      default: // "later", or null for a closed task
        break;
    }
  }

  counts.badge = counts.overdue + counts.followUpsDue;
  return counts;
}
