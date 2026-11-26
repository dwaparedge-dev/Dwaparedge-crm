# Revise Issued Invoice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff change the total (incl. GST) of an issued invoice while keeping its number, with every earlier version kept.

**Architecture:** A pure function turns a target total into exact per-line taxable amounts. A flag-gated guard (`app.invoice_amend`) lets one service function update the issued invoice's lines and totals in place, store a new version, and sync the linked instalment. A dialog on the invoice page calls a new route.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` route-handler guide before Task 4, per AGENTS.md), TypeScript, Postgres (`pg`), zod, MUI, vitest (`npm test`, `npm run test:db`).

**Spec:** `docs/superpowers/specs/2026-11-27-invoice-revise-design.md`

## Global Constraints

- Money is BigInt paise via `@/lib/money` (`parseScaled`, `formatScaled`); never floats.
- Invoice number, issue date, due date, client and sale never change in a revise.
- A reason is mandatory (1-500 chars).
- Payments rule: allowed when new total >= active allocated amount, else blocked (error code `BELOW_PAID`).
- Other instalments are not touched; only the instalment linked to this invoice is updated (to `basis='amount'`, `amount` = new subtotal).
- Schema changes go through `db/logic` + `npm run db:sync`; no new migration file.

## Review Focus

- Mixed GST rates (0% and 18% lines): the total still lands exactly on the target.
- Target unreachable (round-off off, paise gap): clear error, nothing written.
- New total below what is already paid: blocked; equal to paid: invoice shows fully paid.
- Revising up beyond what the sale has left to bill: `OVER_BILLED`; revising down frees the amount on the sale.
- Two revises (or a revise and a payment) at once: row lock serialises them; a draft, cancelled, zero, negative or 3-decimal total is rejected.

---

### Task 1: Reverse-GST solver

**Files:**
- Modify: `src/lib/billing.ts` (append)
- Test: `tests/billing.test.ts`

**Interfaces:**
- Produces: `reviseToTotal(lines: { id: string; taxable: string; taxRate: string }[], targetTotal: string, supply: SupplyType, roundToRupee: boolean): { shares: { id: string; taxable: string }[]; totals: InvoiceTotals }`. Throws `Error` with a message naming the nearest reachable totals when the target cannot be hit.

- [ ] **Step 1: Write failing tests** in `tests/billing.test.ts` (`describe("reviseToTotal")`):
  - one 18% line, intra, `"50000"` -> `shares[0].taxable === "42372.88"`, `totals.total === "50000.00"`, `totals.tax === "7627.12"`.
  - lines `0%` 1000.00 and `18%` 9000.00, inter, target `"5000"` -> `totals.total === "5000.00"`; shares sum equals `totals.subtotal`.
  - 12% line, round-off off, a target no taxable value reaches (find one by scanning in the test) -> `toThrow(/nearest/i)`.
  - round-off on: any whole-rupee target succeeds.
- [ ] **Step 2: Run** `npx vitest run tests/billing.test.ts` -> FAIL (not exported).
- [ ] **Step 3: Implement.** Split T paise over lines proportionally to current taxable (largest-remainder, as `planShares` does). Price with `computeInvoiceLine` + `summarizeInvoice` from `@/lib/gst`. Binary-search T in `[0, target]` (total is non-decreasing in T); among T giving the target pick the smallest. If none, throw naming the totals just below/above.
- [ ] **Step 4: Run** the same command -> PASS.
- [ ] **Step 5: Commit** `feat: reverse-GST solver for revising an invoice total`.

### Task 2: Guard triggers

**Files:**
- Modify: `db/logic/billing_guards.sql` (`guard_invoice_update`, `guard_invoice_items`)
- Test: `tests/integration/billing.int.test.ts` (`describe("amend flag")`, raw SQL via the pool, like the existing "tampering directly" test)

**Interfaces:**
- Produces: with `set_config('app.invoice_amend','on',true)` an `issued` invoice's `subtotal, cgst_total, sgst_total, igst_total, tax_total, round_off, total, document_snapshot` and its `invoice_items` rows may be UPDATEd (INSERT/DELETE of items stay blocked). Everything else stays frozen; without the flag nothing changes.

- [ ] **Step 1: Write failing tests:** with flag, `UPDATE invoices SET total=...` and `UPDATE invoice_items SET unit_price=...` succeed on an issued invoice; with flag, changing `invoice_number` or `client_id` still throws; without flag, the total update throws "immutable".
- [ ] **Step 2: Run** `npx vitest run --config vitest.integration.config.mts -t "amend flag"` -> FAIL.
- [ ] **Step 3: Edit the two functions:** read the flag with `current_setting('app.invoice_amend', true)`; when on, exclude the amount columns and `document_snapshot` from the immutable `ROW(...)` comparison; allow UPDATE (only) on items of a non-draft parent.
- [ ] **Step 4: Run** the same command -> PASS; then `npm run test:db` for regressions.
- [ ] **Step 5: Commit** `feat: flag-gated guard allowing an issued invoice's amounts to be revised`.

### Task 3: Service `reviseInvoice` and `previewRevise`

**Files:**
- Modify: `src/features/invoices/service.ts`
- Test: `tests/integration/billing.int.test.ts` (`describe("revising an issued invoice")`; use `issuedInvoice`, `makeClient`, `expectAppError`, the file's `actor`)

**Interfaces:**
- Consumes: `reviseToTotal` (Task 1), the amend flag (Task 2), existing `price`, `assertWithinSale`, `ensureOriginalVersion`, `storeVersion`, `buildDocumentSnapshot`, `lockInvoice`, `logActivity`.
- Produces:
  - `reviseInvoice(id: string, newTotal: string, reason: string, actorId: string): Promise<number>` returns the new version number.
  - `previewRevise(id: string, newTotal: string): Promise<{ currentTotal: string; newSubtotal: string; newTax: string; newRoundOff: string; newTotal: string; allocated: string; blocked: string | null }>` (read-only, no locks; errors from the solver go in `blocked`).

- [ ] **Step 1: Write failing tests:**
  - 3x1000 @18% invoice (total 3540.00) revised to `"3000"` -> same `invoice_number` and `issue_date`, `total === "3000.00"`, version 2 exists, version 1 PDF still downloadable via `getStoredInvoicePdf`, activity metadata holds old and new totals, `sale_billing.issued_taxable` follows the new subtotal.
  - linked instalment (use `replaceMilestones` then `createDraftForSale` with `mode: "milestone"`) ends with `basis='amount'`, `amount` = new subtotal.
  - paid 3540 then revise to 3000 -> 409 `BELOW_PAID`; revise to 3540 after paying 3000 -> allowed.
  - revise up beyond sale remainder -> 422 `OVER_BILLED`; draft or cancelled -> 409 `INVALID_TRANSITION`; `"0"`, `"-5"`, `"10.005"` -> 422 `VALIDATION_ERROR`; blank reason -> 422.
  - two concurrent `reviseInvoice` calls -> both succeed in order, versions 2 and 3.
- [ ] **Step 2: Run** `npx vitest run --config vitest.integration.config.mts -t "revising an issued invoice"` -> FAIL.
- [ ] **Step 3: Implement `reviseInvoice`** in one `db.transaction`, in this order: `lockInvoice` (must be `issued`); allocated check; `ensureOriginalVersion`; load items; `reviseToTotal` (wrap its error as 422 `REVISE_UNREACHABLE`); build per-line inputs with `quantity "1"`, `unitPrice` = share, `discountPercent "0"`, other fields unchanged; `price()` and confirm total equals target; `assertWithinSale`; set the flag (`set_config(..., true)`, reset to `off` in `finally`); a new helper `updateItemAmounts(tx, invoiceId, items, lines)` UPDATEs `invoice_items` by `position` (ids must not change) and UPDATEs the `invoices` totals; update the linked instalment; rebuild the document snapshot with `buildDocumentSnapshot(id, saleId, totals.subtotal, tx, issued_at)` and save it on the invoice; `storeVersion` as `last + 1` carrying forward the latest version's `item_codes` and `item_descriptions`, reason = `Amount revised from X to Y. <reason>`; `logActivity` action `revised` with metadata `{ version, from, to }`.
- [ ] **Step 4: Implement `previewRevise`** by running the same validation and solver without writing.
- [ ] **Step 5: Run** the Step 2 command -> PASS; `npm run test:db` -> no regressions.
- [ ] **Step 6: Commit** `feat: revise the amount of an issued invoice, keeping its number`.

### Task 4: Schema and route

**Files:**
- Modify: `src/features/invoices/schema.ts`
- Create: `src/app/api/invoices/[id]/revise/route.ts`
- Test: `tests/integration/api.int.test.ts` (follow its existing route-call pattern)

**Interfaces:**
- Produces: `reviseSchema` (`{ total: money string > 0, max 2 decimals; reason: string 1-500 }`); `GET /api/invoices/[id]/revise?total=` returns `previewRevise` JSON; `POST` returns `{ version }` with 201. Copy auth/same-origin/error handling from `regenerate/route.ts`.

- [ ] **Step 1: Write failing API tests:** POST without reason -> 422; POST valid -> 201 `{ version: 2 }`; GET preview with a below-paid total -> `blocked` set.
- [ ] **Step 2: Run** `npx vitest run --config vitest.integration.config.mts tests/integration/api.int.test.ts` -> FAIL.
- [ ] **Step 3: Implement** schema and route (read the Next docs route-handler page first; `RouteContext` usage mirrors the regenerate route).
- [ ] **Step 4: Run** the Step 2 command -> PASS. **Step 5: Commit** `feat: revise invoice API`.

### Task 5: Dialog and button

**Files:**
- Create: `src/features/invoices/components/ReviseInvoiceDialog.tsx`
- Modify: `src/features/invoices/components/InvoiceDetail.tsx` (dialog union at line 56, button beside Regenerate at line 161, render near line 288)

**Interfaces:**
- Consumes: the Task 4 route. Produces: `ReviseInvoiceDialog({ invoiceId, invoiceNumber, currentTotal, onClose, onDone: (version: number) => void })`.

- [ ] **Step 1: Build the dialog** modelled on `RegenerateInvoiceDialog.tsx`: total-incl-GST field, debounced GET preview showing taxable / GST / round-off / total and any `blocked` message, required reason, an alert "The invoice number stays <number>", disabled submit while blocked or loading.
- [ ] **Step 2: Add the "Revise amount" button** for `status === "issued"` and wire `onDone` to `notify.success("Invoice revised (version N)")` plus `reload()`.
- [ ] **Step 3: Verify:** `npm run check` passes; then run the app and revise a test invoice end to end (use the `run` skill), confirming the Versions tab lists the old and new PDFs and the Plan tab shows the new amount.
- [ ] **Step 4: Commit** `feat: Revise amount dialog on issued invoices`.

### Task 6: Docs and rollout

**Files:** Modify `docs/API.md` (new route) and `db/migrations/README.md` only if it lists guard flags.

- [ ] **Step 1:** Document the route and the amend rule in `docs/API.md`.
- [ ] **Step 2:** Record rollout in the PR description: run `npm run db:sync` on each database (it replaces the two trigger functions) before the app deploy, then revise Banshi Forge SL-AA01-01's first invoice to 50,000 from the invoice page.
- [ ] **Step 3: Commit** `docs: revise invoice route and rollout`.
