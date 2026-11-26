import type { Permission } from "@/lib/auth/permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: "dashboard" | "analytics" | "tasks" | "demoRequests" | "clients" | "products" | "sales" | "licenses" | "invoices" | "payments" | "settings";
  ready: boolean;
  /** Hidden from people who do not hold this permission (the page and its API check it again). */
  permission?: Permission;
}

export interface NavGroup {
  title: string;
  /** Colour of the small dot beside the section label. */
  dot: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview", dot: "#FDB528",
    items: [
      { label: "Dashboard", href: "/", icon: "dashboard", ready: true },
      { label: "Desk", href: "/tasks", icon: "tasks", ready: true },
      { label: "All tasks", href: "/tasks/all", icon: "tasks", ready: true },
    ],
  },
  {
    title: "Sales", dot: "#666CFF",
    items: [
      { label: "Demo Requests", href: "/demo-requests", icon: "demoRequests", ready: true },
      { label: "Clients", href: "/clients", icon: "clients", ready: true },
      { label: "Products & Services", href: "/products", icon: "products", ready: true },
      { label: "Sales", href: "/sales", icon: "sales", ready: true },
      { label: "Software Licenses", href: "/licenses", icon: "licenses", ready: true },
    ],
  },
  {
    title: "Billing", dot: "#26C6F9",
    items: [
      { label: "Invoices", href: "/invoices", icon: "invoices", ready: true },
      { label: "Payments", href: "/payments", icon: "payments", ready: true },
    ],
  },
  {
    title: "Insights", dot: "#72E128",
    items: [
      { label: "Website Analytics", href: "/analytics", icon: "analytics", ready: true, permission: "analytics.view" },
      { label: "Settings", href: "/settings", icon: "settings", ready: true },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** The pages this account may open: items needing a permission it lacks are dropped, and so are groups left empty. */
export function visibleNavGroups(permissions: readonly string[]): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || permissions.includes(i.permission)) })).filter((g) => g.items.length > 0);
}
