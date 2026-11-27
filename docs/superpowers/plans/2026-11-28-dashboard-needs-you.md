# Dashboard Needs-You Card Implementation Plan

**Goal:** Show overdue (red) and due-today (amber) task counts on the Dashboard, linking into the Desk.
**Spec:** docs/superpowers/specs/2026-11-28-dashboard-needs-you-design.md
**Stack:** Next.js (searchParams is a Promise; see node_modules/next/dist/docs), MUI, vitest.

Task 1 (TDD): `src/features/tasks/needs-you.ts` + `tests/tasks-needs-you.test.ts` (figures order/labels/tones, zero omitted, `parseSectionParam` accepts the six section ids and rejects anything else/arrays, `deskHref`).
Task 2: `useDeskSummary` in `useDeskCounts.ts`; `tasks/page.tsx` passes `initialSection`; `DeskPage` takes `initialSection?: Section | null` as the initial `sectionFilter` (and opens Parked when it is `parked`).
Task 3: rewrite `NeedsYouToday` in DashboardPage.tsx to use the helpers. Verify with `npm run check`.
