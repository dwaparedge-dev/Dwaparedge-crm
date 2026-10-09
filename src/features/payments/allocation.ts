import { AppError } from "@/lib/auth/errors";
import { formatScaled, parseScaled } from "@/lib/money";

export interface AllocationRequest { invoiceId: string; amount: string }
export interface InvoiceState { number: string | null; clientId: string; status: string; total: string; allocated: string }

/**
 * Pure validation of an allocation plan (no I/O), so every rule is unit-testable.
 * Money is compared as integer paise. Throws a 422 AppError on the first violation.
 */
export function validateAllocationPlan(args: {
  paymentClientId: string;
  paymentVoided: boolean;
  paymentUnallocated: string; // payment amount minus active allocations
  requests: AllocationRequest[];
  invoices: Map<string, InvoiceState>;
}): { totalAllocated: string; remaining: string } {
  const fail = (m: string) => new AppError(m, 422, "ALLOCATION_INVALID");
  if (args.paymentVoided) throw fail("This payment is voided and cannot be allocated");
  const seen = new Set<string>();
  let total = 0n;
  for (const r of args.requests) {
    if (seen.has(r.invoiceId)) throw fail("Each invoice can appear only once in an allocation");
    seen.add(r.invoiceId);
    const inv = args.invoices.get(r.invoiceId);
    if (!inv) throw fail("An invoice in the allocation does not exist");
    const label = inv.number ?? "draft invoice";
    if (inv.status !== "issued") throw fail(`Invoice ${label} is ${inv.status}; payments can only be allocated to issued invoices`);
    if (inv.clientId !== args.paymentClientId) throw fail(`Invoice ${label} belongs to a different client than the payment`);
    const amount = parseScaled(r.amount, 2, "Amount");
    if (amount <= 0n) throw fail("Allocation amounts must be greater than 0");
    const balance = parseScaled(inv.total, 2) - parseScaled(inv.allocated, 2);
    if (amount > balance) throw fail(`Allocation to ${label} (${formatScaled(amount, 2)}) exceeds its balance of ${formatScaled(balance, 2)}`);
    total += amount;
  }
  const available = parseScaled(args.paymentUnallocated, 2);
  if (total > available) throw fail(`Allocations total ${formatScaled(total, 2)} but only ${formatScaled(available, 2)} of the payment is unallocated`);
  return { totalAllocated: formatScaled(total, 2), remaining: formatScaled(available - total, 2) };
}
