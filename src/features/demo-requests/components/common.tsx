import Chip from "@mui/material/Chip";
import { DEMO_REQUEST_STATUSES, type DemoRequestStatus } from "../schema";

export const STATUS_LABEL: Record<DemoRequestStatus, string> = { new: "New", contacted: "Contacted", scheduled: "Scheduled", done: "Done", spam: "Spam" };

const COLORS: Record<DemoRequestStatus, "info" | "warning" | "primary" | "success" | "default"> = {
  new: "info", contacted: "warning", scheduled: "primary", done: "success", spam: "default",
};

/** Narrows a value from the address bar to a status; anything else means "no status filter". */
export const asStatus = (v: string | undefined): DemoRequestStatus | "" => (DEMO_REQUEST_STATUSES.find((s) => s === v) ?? "");

export function DemoRequestStatusChip({ status }: { status: DemoRequestStatus }) {
  // "New" is filled so requests nobody has touched stand out in a list of outlined chips.
  return <Chip size="small" color={COLORS[status]} variant={status === "new" ? "filled" : "outlined"} label={STATUS_LABEL[status]} />;
}

/** "9876543210" -> "+91 98765 43210". */
export const formatMobile = (mobile: string) => (/^\d{10}$/.test(mobile) ? `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}` : mobile);

/** Where the visitor came from, in words. */
export function describeSource(source: string, entryPoint: string | null): string {
  const page = source === "landing" ? "FactoOne landing page" : source;
  const via: Record<string, string> = { navbar: "top menu button", "navbar-mobile": "mobile menu button", hero: "main banner button", form: "the form (scrolled to it)" };
  return entryPoint ? `${page} · ${via[entryPoint] ?? entryPoint}` : page;
}
