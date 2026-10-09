export interface NavItem {
  label: string;
  href: string;
  icon: "dashboard" | "clients" | "products" | "sales" | "licenses" | "invoices" | "payments" | "reports" | "settings";
  ready: boolean;
}

export interface NavGroup {
  title: string;
  /** Colour of the small dot beside the section label. */
  dot: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  { title: "Overview", dot: "#FDB528", items: [{ label: "Dashboard", href: "/", icon: "dashboard", ready: true }] },
  {
    title: "Sales", dot: "#666CFF",
    items: [
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
      { label: "Reports", href: "/reports", icon: "reports", ready: true },
      { label: "Settings", href: "/settings", icon: "settings", ready: true },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
