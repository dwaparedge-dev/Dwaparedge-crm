import { SECTION_ORDER, type DeskCounts, type Section } from "./sections";

// What the Dashboard's "Needs you today" card shows, and the link into the Desk. Plain functions with no React in them,
// so the order, the wording and the links are tested with exact values (tests/tasks-needs-you.test.ts).

export interface NeedsYouFigure {
  key: "overdue" | "followups" | "today";
  /** The Desk section this figure opens. */
  section: Section;
  value: number;
  label: string;
  /** Overdue is a red warning; follow-ups due and due today are amber. */
  tone: "red" | "amber";
}

/** The figures that are above zero, most urgent first: overdue, follow-ups due, due today. Coming up and parked tasks are not here. */
export function needsYou(counts: DeskCounts): NeedsYouFigure[] {
  const all: NeedsYouFigure[] = [
    { key: "overdue", section: "overdue", value: counts.overdue, label: "overdue", tone: "red" },
    { key: "followups", section: "followups_due", value: counts.followUpsDue, label: counts.followUpsDue === 1 ? "follow-up due" : "follow-ups due", tone: "amber" },
    { key: "today", section: "today", value: counts.dueToday, label: "due today", tone: "amber" },
  ];
  return all.filter((f) => f.value > 0);
}

/** The Desk section named in the address (`/tasks?section=overdue`), or null when it is missing or not one of the sections. */
export function parseSectionParam(raw: string | string[] | undefined): Section | null {
  return typeof raw === "string" && (SECTION_ORDER as string[]).includes(raw) ? (raw as Section) : null;
}

/** The Desk, or one section of it. */
export const deskHref = (section?: Section) => (section ? `/tasks?section=${section}` : "/tasks");
