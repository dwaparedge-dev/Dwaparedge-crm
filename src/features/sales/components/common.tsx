import Chip from "@mui/material/Chip";

const STATUS_COLOR: Record<string, "default" | "info" | "success" | "error"> = { draft: "default", confirmed: "info", completed: "success", cancelled: "error" };

export function SaleStatusChip({ status }: { status: string }) {
  return <Chip size="small" variant="outlined" color={STATUS_COLOR[status] ?? "default"} label={status.charAt(0).toUpperCase() + status.slice(1)} />;
}

export const BILLING_LABEL = { not_billed: "Not billed", partly_billed: "Partly billed", fully_billed: "Fully billed" } as const;
export const PAYMENT_LABEL = { unpaid: "Unpaid", partial: "Partly paid", paid: "Paid" } as const;
