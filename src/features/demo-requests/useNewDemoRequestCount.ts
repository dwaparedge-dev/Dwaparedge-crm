"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api-client";

const CHANGED_EVENT = "demo-requests:changed";
const POLL_MS = 60_000;

/** Tells the sidebar badge and the bell that a request changed, so they re-count straight away. */
export const announceDemoRequestsChanged = () => window.dispatchEvent(new Event(CHANGED_EVENT));

/**
 * How many demo requests are waiting (status New). Counted again on every page change, when a request is changed,
 * when the tab becomes visible, and every minute while it is visible, so a new lead shows up without a reload.
 */
export function useNewDemoRequestCount(): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      api<{ new: number }>("/api/demo-requests/summary")
        .then((summary) => { if (!cancelled) setCount(summary.new); })
        .catch(() => undefined); // a badge is not worth an error message
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    window.addEventListener(CHANGED_EVENT, load);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(CHANGED_EVENT, load);
      document.removeEventListener("visibilitychange", load);
    };
  }, [pathname]);

  return count;
}
