import Chip from "@mui/material/Chip";

export const SALE_TYPE_LABELS: Record<string, string> = { project: "Project", license: "Software license", service: "Service" };
const STATUS_COLOR: Record<string, "default" | "info" | "success" | "error"> = { draft: "default", confirmed: "info", completed: "success", cancelled: "error" };

export function SaleStatusChip({ status }: { status: string }) {
  return <Chip size="small" variant="outlined" color={STATUS_COLOR[status] ?? "default"} label={status.charAt(0).toUpperCase() + status.slice(1)} />;
}
