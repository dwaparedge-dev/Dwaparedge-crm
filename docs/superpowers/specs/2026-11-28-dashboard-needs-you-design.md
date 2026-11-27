# Dashboard "Needs you today" - overdue and due-today counts (short design)

Status: approved in conversation 2026-11-28 (small change).

## Intent
Staff should see on the Dashboard how many of their tasks are overdue (red warning) and due today (amber warning), and reach
the Desk (`/tasks`) from there. The card already exists (`NeedsYouToday` in DashboardPage.tsx) but shows only overdue and
follow-ups, has no due-today count, and disappears when there is nothing, so it looks like a missing feature.

## Goals
- Overdue: red count with a warning icon. Due today: amber count with a warning icon. Follow-ups due: kept.
- Each figure opens the Desk filtered to that section (`/tasks?section=overdue|today|followups_due`); the card opens the Desk.
- When nothing is due: a calm "Nothing due today" once the first count has arrived (no flash before that).

## Non-goals / constraints
- The sidebar badge and bell keep their meaning (overdue + follow-ups); due-today never inflates them.
- Counts are the Desk's own (`DeskCounts`, signed-in user's scope); no new API, no DB change.

## Approaches
- A (chosen): extend `NeedsYouToday`, add pure helpers for figures and the `?section=` value, add a `loaded` flag to the counts hook.
- B: add a separate card. Rejected: two cards saying related things.

## Design
- `src/features/tasks/needs-you.ts`: `needsYou(counts)` -> ordered figures `{key, section, value, label, tone}` (non-zero only, order overdue, follow-ups, today); `parseSectionParam(raw)` -> `Section | null`; `deskHref(section?)`.
- `useDeskCounts.ts`: new `useDeskSummary(): { counts, loaded }`; `useDeskCounts()` keeps its signature and returns `.counts`.
- `tasks/page.tsx` reads `searchParams.section` and passes `initialSection` to `DeskPage` (same pattern as demo-requests).
- `NeedsYouToday`: renders figures as links; nothing before `loaded`; "Nothing due today" when loaded and no figures.
