# Task Desk: task management and follow-ups

Status: design for approval, 2026-11-19. Nothing is built yet.

## 1. Summary

A **Tasks module** inside the CRM, with one screen at its centre: the **Desk**. Every morning a founder opens the Desk and sees everything still pending, split by **urgency** (overdue, follow-up due, due today, this week) and by **category** (collections, sales, licences, ...). Categories and priorities are not fixed: the founders define them in Settings. Every task can carry a **follow-up timer**: "chase this again in 3 days". When the time comes the task reappears on the Desk until it is resolved. The CRM also **raises tasks by itself** from things it already knows (a new demo request, an overdue invoice, a licence about to expire, a milestone ready to bill) and closes them when the cause is gone.

It is built for the two founders now. Underneath, it carries the **base for staff access** (per-user permissions, owner and creator on every task, one authorization module), so adding staff later is a screen and a switch, not a rewrite.

## 2. Intent

The founders manage clients, billing, renewals and leads from memory and from several screens. Things slip: an invoice nobody chased, a demo request nobody called back, a licence that lapsed. The CRM already knows most of this, but it is spread over the Dashboard, Invoices, Licences and Demo Requests pages, and nothing remembers "I told them I'd call back Thursday".

Success looks like this:
- One screen at the start of the day answers "what must I do today, and what is slipping?" in under a minute.
- Nothing the CRM knows is overdue without appearing on the Desk.
- A follow-up the founder planned always comes back at the time they chose.
- Adding a staff member later does not change the data model.

## 3. Goals, non-goals, anti-goals

**Goals**
- The Desk with urgency sections, category grouping and filters.
- Dynamic categories and priorities (add, rename, reorder, colour, hide).
- Follow-up timers with a repeat cadence, a "waiting on" status and a record of every follow-up.
- Auto-raised tasks from CRM signals, deduplicated and auto-closing.
- A full history on every task, using the existing activity log.
- A per-user permission and ownership base (no fixed roles) so staff can be added later.

**Non-goals (v1)**
- Staff-facing screens, a user-management screen, per-user permissions for the rest of the CRM (phase 5).
- Email, WhatsApp or push notifications (phase 4; the data is shaped for them).
- Subtasks, dependencies, Gantt or kanban, time tracking, file attachments, @mentions.
- Complex recurrence rules ("every 2nd Tuesday").

**Anti-goals (a failure even if it technically works)**
- A noisy to-do list: auto-tasks that pile up, repeat, or stay open after the cause is fixed.
- A second source of truth: a task must never hold invoice or licence data that can drift from the real record.
- Hard-coded categories or priorities.
- Permission checks scattered through the code, so staff access becomes a risky retrofit.

## 4. What the founders see

### The Desk (`/tasks`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Good morning, <name>        Thu 19 Nov 2026                      [+ New task]│
├──────────────────────────────────────────────────────────────────────────────┤
│ Overdue 4 │ Follow-ups due 3 │ Due today 5 │ Next 7 days 9 │ Parked 6 (2 late)│
│ View: (•) By urgency  ( ) By category    Owner: Me + Unassigned ▾  Priority ▾│
│ Categories: Collections 5 · Sales 4 · Licences 3 · Billing 2 · Admin 1       │
├─ OVERDUE ────────────────────────────────────────────────────────────────────┤
│ ● Critical  Collections  Collect ₹1,20,000 from AA07 Sharma Traders          │
│             INV-1126-AA07-01 · 12 days late · auto      [Done] [Follow up] ⋯ │
│ ● High      Sales        Send revised quote to Patel Foods · due 14 Nov      │
│                                                         [Done] [Follow up] ⋯ │
├─ FOLLOW-UPS DUE ─────────────────────────────────────────────────────────────┤
│ ● Normal    Sales        Call back Mehta Pharma · promised for today, 3rd    │
│             follow-up · last: "asked to call after Diwali"                   │
├─ DUE TODAY ──────────────────────────────────────────────────────────────────┤
│ ...                                                                          │
├─ NEXT 7 DAYS ────────────────────────────────────────────────────────────────┤
├─ NO DATE ────────────────────────────────────────────────────────────────────┤
├─ PARKED (chased, back later; 2 already late)  ▸ collapsed ──────────────────┤
└──────────────────────────────────────────────────────────────────────────────┘
```

"By category" regroups the same tasks into one block per category, each block still ordered by urgency. The category chips filter in place. The chosen view is remembered in the browser as a convenience only.

**Whose tasks the Desk shows.** By default: *my* tasks plus **Unassigned** ones (auto-raised tasks start unassigned, so they never vanish from a founder's view; a **Take it** button assigns one to yourself). The owner filter switches to Everyone or to the other founder. The sidebar badge and the stat strip use the same scope, so they count what *you* would see. (This is the view of a user holding `tasks.view_all` and `tasks.assign`, as both founders do. A user without them sees only their own tasks and has no owner filter or Take it button; see section 8.)

### Acting on a task
- **Done**: closes it (and records who and when).
- **Follow up**: records what happened ("called, no answer"), then asks what next: `+1 day`, `+3 days`, `+1 week`, a custom date and time, or "no more follow-ups". Choosing a time **parks** the task until then, even if it is overdue, so it leaves your list and returns on time.
- **Snooze**: parks the task without counting as a follow-up (for "not today"). It works on any task, overdue or not.
- On an auto-raised **demo request** task the main button is **Mark contacted** instead of Done (see section 7).
- **⋯**: edit, reassign, change priority or category, add a note, cancel, reopen.

### Other screens
- **All tasks** (`/tasks/all`): a filterable table (status, category, priority, owner, client, date range, source, search) for when the Desk is not enough. Filters live in the URL, so a view can be bookmarked.
- **Task detail**: a side panel with the fields, a link to the client or the source record, and the timeline of everything that happened.
- **Settings → Task categories** and **Task priorities**: the dynamic part (section 6).
- **Sidebar and bell**: a badge with *overdue + follow-ups due*. The Dashboard gets a "Needs you today" card linking to the Desk.

## 5. Rules

### A task
Title, optional description, **category**, **priority**, **status**, **owner** (who must do it), **creator**, optional **client**, optional **due date** (the deadline), optional **follow-up time** (when to look at it again), and, for auto-tasks, the **source record**.

**Statuses are fixed** because code depends on them: `open`, `in_progress`, `waiting`, `done`, `cancelled`. Done and cancelled tasks can be reopened. Tasks are never deleted; a mistaken task is cancelled, which matches how clients and invoices work in the rest of the CRM.

**Priority versus urgency.** Priority is the founders' judgement of importance (their own list, e.g. Critical / High / Normal / Low). Urgency is derived from time and is never stored: overdue, follow-up due, due today, and so on. The Desk shows urgency as its sections and orders by priority inside each section.

### Which section a task lands in
All times are Asia/Kolkata, as in the rest of the CRM. "Active" means open, in progress or waiting. A task appears in the **first** section that matches, checked in this order:

1. **Parked**: active and its follow-up time is still in the future. This wins over everything below, **including overdue**: once a founder has chased a task and chosen when to look at it again, it leaves their list until then. This is what makes "Follow up" and "Snooze" do something for a late invoice. Safeguards so nothing is hidden for good: the Parked count in the stat strip shows how many parked tasks are already past their deadline ("6, 2 late"), each parked row shows its deadline and the time it returns, and the database guarantees a parked task has a return time.
2. **Overdue**: the due date is before today.
3. **Follow-ups due**: the follow-up time has passed (it has returned) and the task is not overdue.
4. **Due today**.
5. **Next 7 days**.
6. **No date / later**.

Within a section the order is priority rank, then due date (earliest first, no date last), then oldest first. A task that has just returned from Parked keeps a "follow-up due" tag in whichever section it lands in.

A follow-up time is **never set automatically when a task is created**; a category's default follow-up days only decide the *next* time after the first "Followed up" is recorded. Otherwise every new Collections task would be parked the moment it was made.

**The badge** counts the tasks in Overdue + Follow-ups due (not Parked), within the viewer's scope.

**Ownership.** `owner_id` may be empty (Unassigned). A task whose owner has been deactivated (users are deactivated, never deleted, so a foreign key cannot catch this) is treated as Unassigned **at read time** by joining `users.is_active`, so it stays on a founder's Desk.

### Follow-up timers
- `follow_up_at` is the next time to chase. `follow_up_every_days` (optional) makes it repeat: after each "Followed up" the next time defaults to now + that many days. A category can supply a default cadence (for example Collections: every 3 days), copied onto a task when it is created and editable per task. A founder can also set a first follow-up time by hand when creating a task ("call in 3 days"); that task is parked until then.
- Each follow-up is recorded in the activity log with the founder's note, and `follow_up_count` goes up. A task followed up 3 or more times without closing is shown with a **Stuck** tag, so repeated chasing does not go unnoticed.
- A task in `waiting` must have a follow-up time (enforced by the database), so nothing can be parked and forgotten. `waiting_on` says who or what we are waiting for.
- v1 shows follow-ups inside the app. The Desk query that finds "due now" is the same one a later email or WhatsApp digest will use.

## 6. Dynamic categories and priorities

Two small configuration tables, managed from Settings in the same style as the existing "Dropdown options" screen:

- **Categories**: name, colour, default follow-up days, order, active.
- **Priorities**: name, colour, rank (1 = most urgent), order, active.

Starter categories (all editable): Sales & leads, Collections, Billing & invoicing, Licences & renewals, Clients & support, Delivery, Finance & compliance, Admin & hiring. Starter priorities: Critical, High, Normal, Low.

Rows the code relies on (the ones auto-tasks use) carry a stable `key` and `is_system`. A founder can rename, recolour or hide them but not delete them, the same rule `field_options` already follows. A category or priority in use cannot be deleted, only hidden.

## 7. Auto-raised tasks

A set of **signal rules** in code. Each rule is a SQL query returning the records that need a task. A sync step creates the missing tasks and closes the ones whose cause has gone.

| Rule | The condition (task exists while it holds) | Title | Category | Priority | Due | Owner |
|---|---|---|---|---|---|---|
| Demo request | status is `new` | "Call {name}, {company}" | Sales & leads | High | today | the request's `owner_id`, else Unassigned |
| Overdue invoice | issued, balance > 0, due date passed | "Collect ₹{balance} from {client} ({invoice no.})" | Collections | High | the invoice's due date | the client's `owner_id`, else Unassigned |
| Licence renewal | status `active` and expiry date is within 30 days **or already past** (a lapsed, unrenewed licence keeps its task) | "Renew {product} for {client}" (or "Renewal overdue: ..." once past) | Licences & renewals | Normal | 7 days before expiry, or today if sooner | the client's `owner_id`, else Unassigned |
| Milestone to bill | confirmed sale; milestone due within 7 days or past; no draft or issued invoice linked; **and the sale still has an amount left to bill** (`sale_billing.unbilled_estimate > 0`, so an invoice raised outside the plan does not leave a false task) | "Raise invoice: {milestone} for {client}" | Billing & invoicing | Normal | the milestone's due date | the client's `owner_id`, else Unassigned |

Rules of the sync:
- **Idempotent.** Each auto-task has a `dedupe_key` (`demo_request:{id}`, `invoice_overdue:{id}`, `license_renewal:{id}:{expiry}`, `milestone:{id}`), unique across all statuses. Running the sync twice, or from two tabs at once, never creates a duplicate.
- **Closes when the condition ends, reopens if it returns.** When the condition stops holding (invoice paid or cancelled, licence renewed, revoked or suspended, milestone linked to an invoice, demo request contacted) the task is closed by the system and logged ("Closed automatically: invoice paid"). A system-closed task is one with `status = done` and `completed_by` empty. If the cause comes back (a payment allocation is reversed, a draft invoice is deleted and the milestone returns to planned, a demo request is moved back to New) the same task is **reopened** and logged ("Reopened automatically"), not duplicated.
- **A founder's decision sticks.** If a founder marks an auto-task Done or cancels it while the condition still holds, the system never reopens or recreates it (one task per condition). To keep chasing, use Follow up or Waiting instead of Done. The renewal key includes the expiry date, so next year's renewal is a new task.
- **Demo requests write through, the others do not.** The demo-request task's button is **Mark contacted**, which calls the existing demo-request service (the same status change, history entry and badge update as on the Demo requests page) in the same transaction, then the task closes. Done is not offered on that task, so the Desk and the Demo requests page cannot disagree. Tasks for invoices, licences and milestones never write to those records: they are only closed by the real action (a payment, a renewal, an invoice), and Done on them just means "I'm handling it".
- **Titles are snapshots; numbers are not copied.** The title carries the amount for readability, but the source link is always the truth. The task detail shows the live figure from the invoice.
- **When it runs.** `POST /api/tasks/sync` runs the rules, guarded by a database advisory lock (a second caller skips instead of waiting), and returns the badge counts. The Desk calls it on open, and the sidebar badge calls it on its existing 60-second poll, so the badge is never staler than a minute. Four indexed queries per minute per open tab is negligible at this size. No scheduler is needed for v1 (the app has none); a daily cron arrives in phase 4 with the digests.
- **No first-day flood.** Auto-tasks are **off until `TASKS_AUTO_FROM=YYYY-MM-DD` is set**. After that the sync raises a task only for records whose trigger date (due date, expiry date, or arrival date for demo requests) is on or after that date. Everything older is handled once, on purpose, with `npm run tasks:backfill`: a dry run by default that lists what it would raise per rule, and `-- --apply [--max-age-days N]` to create them (the same pattern as `invoices:refresh`). The founders see the list before anything lands on the Desk.
- **Thresholds** (30 days, 7 days, 3 follow-ups) are constants in one file now and a settings screen later.

## 8. Built to scale to a team: access is per user, not per role

The founders asked that staff access be possible later without redoing the work, and that it be **based on each individual user, not on named roles**. So there is no "founder", "manager" or "staff" label anywhere in the data model. Every user carries their **own list of permissions**, and what they can see and do follows from that list plus the tasks they own or created. (A named bundle such as "Sales executive" can be added later as a convenience that just ticks several permissions at once.)

These pieces are built in v1 because they are cheap now and expensive to retrofit; everything user-facing for staff waits.

| Built in v1 | Why |
|---|---|
| `users.permissions`: a list of permission keys per user, **empty by default** | The CRM has no per-user access today ("every signed-in user can do everything"). Existing accounts get all four task permissions in the migration (they are the trusted users today), the first admin made by `db:seed-admin` gets them too, and **a new account gets none** (least privilege). A change takes effect on that user's very next request, because `getCurrentUser` already re-reads the user row every time. |
| One shared permissions module, `src/lib/auth/permissions.ts` | The list of valid keys (checked in code when they are granted) and one `can(user, key)` helper. Every later module (clients, invoices, payments) adds its own keys here, so phase 5 extends the same mechanism instead of inventing another. |
| `owner_id` and `created_by` on every task | "Mine", "assigned to me" and "assigned by me" all work from the first day. |
| **One tasks policy**, `src/features/tasks/policy.ts`, built on the module above | Every service function takes the acting user and asks the policy. Nothing else decides who can see what. |
| Scope parameter on the list API (`mine`, `all`) | The API already has the shape staff screens will need. |
| Command-line control: `npm run users -- permissions --email x`, `grant --email x --permission tasks.view_all`, `revoke ...`, and `create ... --grant a,b` | There is no user screen yet. Each grant and revoke is written to `activity_log` (`entity_type = 'user'`, the permission in `metadata`; the command line has no signed-in actor, so it is logged as a command-line change, and the phase 5 screen will record the person who made it), so privilege changes leave a trail. (`security_events` is not used: it has no field for which permission changed.) |
| Everything logged to `activity_log` with the actor | A real audit trail for a team. |
| Owner picker on tasks | Already useful between the two founders. |

**The four task permissions in v1**

| Permission | What it allows |
|---|---|
| *(none, so everyone)* | Create tasks for themselves. See, edit, complete, follow up on, snooze and add notes to the tasks they **own or created**. Read the category and priority lists (for the pickers). Nothing else. |
| `tasks.view_all` | See everyone's tasks and the unassigned ones; use the Desk's owner filter ("Everyone", or a named person). |
| `tasks.edit_all` | Edit, complete, follow up on and add notes to **other people's** tasks. Includes `tasks.view_all`. |
| `tasks.assign` | Give a task to someone else, or take an unassigned one ("Take it"). |
| `tasks.manage_settings` | Add, rename, recolour, reorder and hide categories and priorities. |

Both founders hold all four, so for them the Desk behaves exactly as described in section 4. A user with no permissions has a smaller, simpler Desk: only their own tasks, no owner filter, no Unassigned section (auto-raised tasks are unassigned until a founder assigns them, so they reach that person only when handed over). A task whose owner has been deactivated stays visible to whoever holds `tasks.view_all`, as an Unassigned task.

The policy is written and unit-tested now for every combination of the four permissions, even though no staff screens exist.

**Important limit.** The rest of the CRM (clients, invoices, payments, licences) has no per-user access control yet: any signed-in user can open them. The task module is safe for restricted users from day one; the other pages are not. So **do not create accounts for people who should not see client and billing data until phase 5**, when permissions such as `clients.view` and `invoices.view` are added to the same mechanism and the pages enforce them.

**Later, without a data-model change:** a user-management screen where someone holding `users.manage_permissions` ticks each person's permissions; a "reports to" link on users (`users.manager_id`) so a manager sees their team's tasks without seeing everyone's; named permission bundles; per-person workload; assignment notifications; saved views per user.

## 9. Data model

New tables are declared in `db/tables/tasks/` and registered in `db/schema.ts` (a new `tasks` module, after `clients`, `users` and `activity_log`). Default rows go in `db/seeds/defaults.sql` without overwriting edits. The one change to an existing table is `users.permissions TEXT[] NOT NULL DEFAULT '{}'`. It is added to `db/tables/core/users.sql` (so a sync adds the column and fresh installs have it), and `db/migrations/0017_user_permissions.sql` **backfills every existing account with the four task permissions** (they have full access today), because a sync cannot update existing rows. `db:seed-admin` grants the same four to the first admin. Valid keys are checked in code when granted; an unknown key stored by mistake grants nothing.

**`task_categories`**: `id`, `key` (unique slug), `name`, `colour`, `default_follow_up_days` (nullable, > 0), `sort_order`, `is_active`, `is_system`, timestamps.

**`task_priorities`**: `id`, `key` (unique slug), `name`, `colour`, `rank` (1 = most urgent), `sort_order`, `is_active`, `is_system`, timestamps.

**`tasks`**
- `id` UUID, `title` (1 to 200), `description` (up to 5000)
- `category_id`, `priority_id` (NOT NULL, `ON DELETE RESTRICT`)
- `status` CHECK in (`open`, `in_progress`, `waiting`, `done`, `cancelled`)
- `owner_id`, `created_by` (`ON DELETE SET NULL`, which only matters if a user row is ever removed; the everyday case, a **deactivated** user, is handled at read time by joining `users.is_active`, see section 5)
- `client_id` (optional, `ON DELETE SET NULL`)
- `origin` CHECK in (`manual`, `auto`); `source_type` CHECK in (`demo_request`, `invoice`, `license`, `sale_milestone`) and `source_id`, both set or both null; `dedupe_key`
- `due_date` DATE; `follow_up_at` TIMESTAMPTZ; `follow_up_every_days` (> 0); `follow_up_count` (>= 0); `last_followed_up_at`; `waiting_on`
- `completed_at`, `completed_by` (null `completed_by` with a set `completed_at` = closed by the system)
- `created_at`, `updated_at`

**Invariants in the database, not the application:** `waiting` requires `follow_up_at`; `done` requires `completed_at`; `source_type` and `source_id` are both set or both null; `dedupe_key` is unique where not null.

**Indexes:** `(owner_id, status, due_date)` for active tasks; `(follow_up_at)` for active tasks with a follow-up time; `(category_id)`; `(client_id)`; `(source_type, source_id)`; unique `dedupe_key`.

**History** is `activity_log` with `entity_type = 'task'` and the task's `client_id` set, so a client's History tab shows its tasks too. Actions: `created`, `edited`, `status_changed`, `reassigned`, `followed_up` (note and outcome in `metadata`), `snoozed`, `note_added`, `auto_created`, `auto_closed`. No new history table.

## 10. API

All routes call `requireUser()` and then the policy; all input is validated with Zod; list pages are capped at 100, like the rest of the CRM.

| Route | Purpose |
|---|---|
| `GET /api/tasks/desk` | The Desk: sections with their tasks and the counts, in one round trip. Read-only |
| `POST /api/tasks/sync` | Run the auto-task sync and return the badge counts (overdue, follow-ups due, due today). Called when the Desk opens and by the badge's 60-second poll. Writes, so it is a POST, not a GET |
| `GET /api/tasks` · `POST /api/tasks` | List with filters and `scope` (`mine`; `all` needs `tasks.view_all`); create |
| `GET/PATCH /api/tasks/{id}` | Detail with timeline; edit (including "Take it": set the owner) |
| `POST /api/tasks/{id}/status` | Change status (done, reopen, cancel, in progress, waiting) |
| `POST /api/tasks/{id}/follow-up` | Record a follow-up, with note and the next time (or stop) |
| `POST /api/tasks/{id}/snooze` | Park the task until a time, without counting a follow-up |
| `POST /api/tasks/{id}/notes` | Add a note to the timeline |
| `POST /api/tasks/{id}/mark-contacted` | Demo-request tasks only: calls the existing demo-request status service, then closes the task, in one transaction |
| `/api/task-categories`, `/api/task-priorities` | Read the dynamic lists (anyone signed in); change them (needs `tasks.manage_settings`) |

Status changes lock the row (`FOR UPDATE`) inside a transaction and log in the same transaction, as the demo-requests service does. Two people acting on one task at once cannot corrupt it.

## 11. Frontend

Follows the existing structure: `src/features/tasks/{schema,service,policy,signals}.ts` plus `components/`, pages under `src/app/(dashboard)/tasks/`, routes under `src/app/api/tasks/`.

- **Reused as they are:** `PageHeader` (the wavy banner with actions), `StatCard` for the section counts, the `CustomDataGrid` for All tasks, `DetailView`, the Settings tabs and the `OptionsManager` pattern for categories and priorities, and the bell/badge pattern from `useNewDemoRequestCount` (generalised into a hook that calls `POST /api/tasks/sync` on its existing 60-second poll and returns the Desk counts).
- **Navigation:** a "Desk" item in the Overview group, a badge on it, and an "All tasks" item; the bell lists *overdue* and *follow-ups due*.
- **Quick add** from the banner and, in phase 2, an "Add follow-up task" action on a client and on a demo request.
- **Accessibility and phones:** actions are real buttons with labels; the Desk works at phone width (the founders will check it from a phone).

## 12. Enterprise standards

- **Audit:** every change is in `activity_log` with actor and time; system actions have no actor and say so.
- **Authorization:** per-user permissions in one shared module and one tasks policy, tested for every combination of the four task permissions; grants and revokes are audited in `activity_log`.
- **Integrity:** the invariants above live in the database; auto-task sync is idempotent and concurrent-safe.
- **Security:** same-origin and JSON checks already enforced by the proxy; free text is cleaned like the demo-request fields; no new public endpoint (the sync route requires a session).
- **Performance:** the Desk is a handful of indexed queries; target well under a second with 10,000 tasks. Lists are paginated.
- **Tests:** Vitest unit tests for validation, section assignment (including parked-wins-over-overdue and the badge definition), ordering and the policy for every combination of the four task permissions (a user with none sees only their own tasks); database integration tests for the invariants, the sync's idempotency, auto-close, **reopen when the cause returns** and "a founder-closed task stays closed", the `TASKS_AUTO_FROM` cutoff, the demo-request write-through, and the permissions migration (existing accounts backfilled, new accounts empty). The schema-sync test is extended for the new tables.
- **Docs:** update `docs/DATA-MODEL.md`, `docs/API.md`, `docs/SECURITY.md` (the per-user permission model and the "do not create restricted accounts yet" limit), the README's staff-accounts section (the new `grant`, `revoke` and `permissions` commands), and the README (its "not in v1: follow-up reminders" line, plus `TASKS_AUTO_FROM` in the environment-variable table and `tasks:backfill` in the commands table).
- **Framework:** this app is on Next.js 16 and `AGENTS.md` says its conventions differ from older versions. The builder must read the relevant guide in `node_modules/next/dist/docs/` before writing routes or pages.

## 13. Delivery in phases

Each phase ships on its own and leaves the app working.

| Phase | Scope | Done when |
|---|---|---|
| **0. Foundation** | `users.permissions` column and backfill migration; `permissions.ts`; `users permissions / grant / revoke` commands and `create --grant`; `db:seed-admin` grants the first admin; the `tasks` module tables and seeds; the tasks policy with tests; `CurrentUser` carries its permissions | Migration applies on a copy of the real data; existing logins keep full task access; a new account has none; policy tests pass |
| **1. Tasks and the Desk** | Task CRUD, statuses, categories and priorities with their Settings screens, the Desk (urgency sections, category view, filters), All tasks, task detail with timeline, nav and badge, Dashboard card | A founder can create tasks in custom categories and see them sectioned on the Desk |
| **2. Follow-ups** | Follow-up timer, cadence, waiting and parked, Followed up and Snooze actions with notes, Stuck tag, quick add from client and demo request | A task parked for 3 days leaves the Desk (even if overdue) and returns on that day: to Follow-ups due, or to Overdue with the follow-up-due tag when its deadline has also passed (section 5 checks Overdue first); the Parked count shows how many parked tasks are already late |
| **3. Auto-tasks** | The four rules, `POST /api/tasks/sync` on Desk open and on the badge poll, auto-close and reopen, "auto" tag, Mark contacted write-through, `TASKS_AUTO_FROM` switch, `npm run tasks:backfill` | With `TASKS_AUTO_FROM` set, new overdue invoices, demo requests, expiring or lapsed licences and billable milestones appear and disappear by themselves, with no duplicates; the backfill dry run lists the older ones before anything is created |
| **4. Reminders** | Daily cron, email (and later WhatsApp) morning digest, saved views, simple recurring tasks, priority escalation for auto-tasks | The founders get the morning list without opening the CRM |
| **5. Team rollout** | User-management screen with each person's permissions (`users.manage_permissions`), permissions for the rest of the CRM (`clients.view`, `invoices.view`, ...) enforced on those pages, a "My tasks" view for restricted users, an optional "reports to" link so a manager sees their team, workload and follow-up reports | A restricted account can sign in and see only its own tasks and only the CRM pages it was given |

Phases 0 to 3 are the answer to "see what remains each morning, by category and urgency, with follow-ups". Phases 4 and 5 are the scale path.

## 14. Approaches considered

**How to build it**
1. **A dedicated Tasks module with its own tables and one Desk that reads from everywhere** (chosen). One place to look, one place to follow up, and the existing pages stay untouched. Costs one new module.
2. **Add an owner and follow-up date to each existing page** (demo requests, invoices, licences, ...). Cheap per page, but there is still no single morning view, and manual tasks ("send the quote") have nowhere to live. It fails the main goal.
3. **Use an outside tool (Asana, Linear, Notion) and link to it.** Fast to start, but tasks would not know about invoices, licences or demo requests, so auto-tasks and live context are lost, and the data splits across two places.

**Categories and priorities**
- Reuse `field_options`: free, and the Settings screen exists. But it holds only a key and a label, with no colour, rank or default follow-up days, which the Desk needs. **Chosen: two small dedicated tables**, managed in the same style.

**Keeping auto-tasks fresh**
- Database triggers: instant, but business rules hidden in SQL, and hard to change or test.
- A scheduled job: needs infrastructure the app does not have yet.
- **Chosen: sync when the Desk opens, with a lock and idempotent inserts.** Nothing new to run, and fresh exactly when the founders look. A cron is added when digests need one.

## 15. Risks

| Risk | Mitigation |
|---|---|
| Auto-tasks create noise and the Desk stops being trusted | Only four rules; thresholds in one file; auto-close and reopen; one task per condition; a founder's decision sticks; the milestone rule also requires an amount left to bill |
| The first sync dumps every historic overdue invoice and old milestone on the Desk | Auto-tasks stay off until `TASKS_AUTO_FROM` is set; older records go through a dry-run `tasks:backfill` the founders review |
| A parked task hides something late | Parked wins over overdue on purpose, but the Parked count shows how many are already late, rows show their deadline, and a parked task always has a return time |
| The Desk and the Demo requests page disagree about a lead | The demo-request task has no plain Done; Mark contacted goes through the same service |
| Badge reads 0 while things slip | The badge's poll runs the sync, so it is at most a minute stale |
| A restricted account is created before the rest of the CRM has per-user access and sees everything | The documented limit in section 8; a new account holds no permissions, the least privilege; phase 5 closes the gap |
| The permissions migration changes current users | Existing accounts are backfilled with all four task permissions in the same migration, so nothing they do today changes; tested on a copy first |
| A permission is granted by mistake or abused | Grants and revokes are command-line only in v1 (so only someone with access to the server can make them), recorded in `activity_log`; changes apply on the user's next request |
| Two tabs run the sync at once | Advisory lock plus a unique `dedupe_key` |
| An owner's account is deactivated and their tasks vanish | Read-time join on `users.is_active` treats them as Unassigned, and the Desk always includes Unassigned |
| A parked task is forgotten | The database refuses `waiting` without a follow-up time |

## 16. My calls, and what is left to the builder

**My calls** (decided without being asked, so please check them):
1. Dedicated category and priority tables instead of `field_options`.
2. `due_date` is a date; `follow_up_at` is a timestamp (day-level deadlines, but "in 4 hours" is possible).
3. Auto-task sync runs when the Desk opens **and on the badge's 60-second poll**, as a POST; no cron until phase 4.
4. The four auto-task rules and their thresholds (30 days for renewals, 7 for milestones, 3 follow-ups for "Stuck").
5. **Per-user permissions instead of roles** (your instruction): four task permissions (`tasks.view_all`, `tasks.edit_all`, `tasks.assign`, `tasks.manage_settings`) stored as a list on each user; **every existing account is given all four (please confirm every current login should have them)**, new accounts get none. I read "user based" as "each user is individually granted what they can do, with no named roles"; if you meant something else, the change is limited to section 8.
6. The Desk lives in the Overview group of the sidebar, groups by urgency by default, and shows *mine + Unassigned*.
7. A task is cancelled, never deleted.
8. A task a founder closed (Done or cancelled) is never reopened or recreated for the same condition; a task the **system** closed is reopened if its cause returns.
9. **Parked wins over overdue**: a chased task leaves the Overdue list until its follow-up time, with the Parked count showing how many are already late.
10. Auto-tasks start Unassigned, except that they inherit the demo request's or the client's owner when one is set; a lapsed, unrenewed licence keeps its task.
11. Demo-request tasks have **Mark contacted** (writes through the existing service) instead of Done; other auto-tasks never write to their source records.
12. Auto-tasks are off until `TASKS_AUTO_FROM` is set, and older records go through a reviewed `tasks:backfill`.

**Left to the builder:** colours and icons, the exact wording of titles and messages, the final starter category names, the visual layout inside the sketch above, and the column and constraint names (following the existing `db/tables` style).
