import Chip from "@mui/material/Chip";
import type { InvoiceRow } from "../service";

type Shape = Pick<InvoiceRow, "status" | "payment_status" | "is_overdue">;

export function InvoiceStatusChip({ invoice }: { invoice: Shape }) {
  if (invoice.status === "draft") return <Chip size="small" variant="outlined" label="Draft" />;
  if (invoice.status === "cancelled") return <Chip size="small" color="error" variant="outlined" label="Cancelled" />;
  if (invoice.payment_status === "paid") return <Chip size="small" color="success" label="Paid" />;
  if (invoice.is_overdue) return <Chip size="small" color="error" label={invoice.payment_status === "partial" ? "Overdue · partial" : "Overdue"} />;
  if (invoice.payment_status === "partial") return <Chip size="small" color="warning" label="Partially paid" />;
  return <Chip size="small" color="info" variant="outlined" label="Unpaid" />;
}
