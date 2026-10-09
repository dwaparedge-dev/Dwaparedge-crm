import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    scope: "/",
    name: "DwaparEdge CRM",
    short_name: "DwaparEdge",
    description: "Clients, sales, invoices, payments and software licences in one place.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#F7F7F9",
    theme_color: "#384152",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "New invoice", short_name: "Invoice", url: "/invoices/new", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Record payment", short_name: "Payment", url: "/payments", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Clients", short_name: "Clients", url: "/clients", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
