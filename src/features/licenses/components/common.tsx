import Chip from "@mui/material/Chip";
import { daysUntil } from "@/lib/dates";

const COLORS: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  pending: "info", active: "success", expired: "error", suspended: "warning", revoked: "default",
};

export function LicenseStatusChip({ status }: { status: string }) {
  return <Chip size="small" variant="outlined" color={COLORS[status] ?? "default"} label={status.charAt(0).toUpperCase() + status.slice(1)} />;
}

/** Days left until expiry, colour-coded by urgency. Only meaningful for active/expired licenses. */
export function DaysRemaining({ expiry, status }: { expiry: string; status: string }) {
  if (status !== "active" && status !== "expired") return <span>—</span>;
  const d = daysUntil(expiry);
  if (d < 0) return <Chip size="small" color="error" label={`Expired ${-d}d ago`} />;
  if (d === 0) return <Chip size="small" color="error" label="Expires today" />;
  const color = d <= 7 ? "error" : d <= 15 ? "warning" : d <= 30 ? "info" : "default";
  return <Chip size="small" color={color} variant={color === "default" ? "outlined" : "filled"} label={`${d} day${d === 1 ? "" : "s"}`} />;
}
