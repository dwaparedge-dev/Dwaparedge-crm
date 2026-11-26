# Revise an issued invoice (same number) - design

Status: approved in conversation 2026-11-27 (short design, small change).

## Intent and why
A client (Banshi Forge, sale SL-AA01-01, billing plan 53% then 40%) needs the first invoice to total exactly
INR 50,000 **including GST**, which is what they paid. Today an issued invoice cannot change, a billed
instalment is locked, and the plan only takes amounts before GST. Cancelling and re-creating gives a new number, which the
business does not want. The fix must be a proper function, not hand edits in the database.

## Goals
- "Revise amount" on an issued invoice: enter the invoice total incl. GST; number, date, client and sale stay the same.
- Every earlier version is kept (PDF plus lines and totals) and stays downloadable; a reason is mandatory and logged.
- Totals are exact to the paisa (GST and round-off consistent with how issuing prices an invoice).

## Non-goals / anti-goals
- No credit notes, no renumbering, no changing date, client or sale.
- Must not weaken immutability for any path other than this one action.
- Must not allow over-billing the sale.
- Adding an "amount incl. GST" basis to the billing plan is out of scope (can follow later).

## Constraints
- Billed/remaining figures are DB views over `invoice_items`, so they follow automatically.
- Guard triggers in `db/logic/billing_guards.sql` currently freeze lines and totals; a transaction-local flag
  (like `app.invoice_renumber`) is the established way to allow one controlled change.
- Compliance: reusing a number with a different amount can mismatch GSTR-1 / e-invoice IRN if already reported.
  The user was told; it does not change the build.

## Approaches considered
- **A. Revise in place (chosen):** same invoice row, new version, flag-gated guard. One record, one number, full history.
- B. Cancel + reissue with same number: needs `UNIQUE(invoice_number)` relaxed; duplicate numbers confuse lookups. Rejected.
- C. Credit note + new invoice: accounting-standard but gives a new number. Rejected by the user.

## Design
1. **Guards only, no new column (changed while planning):** the old amounts are already preserved by the version's stored
   PDF and by the activity-log metadata, so `amounts_snapshot` is dropped. The guard triggers on `invoices` and `invoice_items`
   allow line/total changes only when `app.invoice_amend = 'on'` (applied with `npm run db:sync`, no migration).
   Lines are updated in place (same ids) so earlier versions' per-line codes/wording stay valid.
2. **Service `reviseInvoice(id, newTotal, reason, actor)`**, single transaction: lock; require `issued`;
   `ensureOriginalVersion` (v1 = as received); compute lines by reverse GST then confirm with `price()` (nudge by paise until total matches;
   mixed rates split proportionally); `assertWithinSale` excluding this invoice; set flag, rewrite items and totals,
   rebuild document snapshot; store new version with PDF; update the linked instalment to the new taxable amount;
   activity log (old total -> new total, reason).
3. **Payments rule (my call, agreed by default):** allowed if the new total >= active allocated amount; otherwise
   blocked with a clear message. No need to reverse and re-apply the payment.
4. **Remaining plan (my call):** other instalments (the 40%) are untouched; the Plan tab shows the new gap; the user edits it.
5. **API/UI:** `POST /api/invoices/[id]/revise` + zod schema; "Revise amount" dialog in InvoiceDetail (total incl. GST,
   live preview of taxable / GST / total, required reason, same-number warning); version history shows "Revised X -> Y".
6. **Tests:** reverse-GST unit tests (18%, 0%, mixed, round-off); DB integration for revise, payments rule,
   over-billing, and that the guard still blocks changes without the flag.

## Left to the builder
Exact dialog layout, error wording, how the nudge search is bounded, and whether receipts print invoice totals
(check; if they do, note the revision there).
