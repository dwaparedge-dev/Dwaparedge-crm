export interface NavItem {
  label: string;
  href: string;
  icon: "dashboard" | "clients" | "products" | "sales" | "licenses" | "invoices" | "payments" | "reports" | "settings";
  ready: boolean;
}

// `ready` flips to true as each module ships.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: "dashboard", ready: true },
  { label: "Clients", href: "/clients", icon: "clients", ready: true },
  { label: "Products & Services", href: "/products", icon: "products", ready: true },
  { label: "Sales", href: "/sales", icon: "sales", ready: true },
  { label: "Software Licenses", href: "/licenses", icon: "licenses", ready: true },
  { label: "Invoices", href: "/invoices", icon: "invoices", ready: true },
  { label: "Payments", href: "/payments", icon: "payments", ready: true },
  { label: "Reports", href: "/reports", icon: "reports", ready: true },
  { label: "Settings", href: "/settings", icon: "settings", ready: true },
];
