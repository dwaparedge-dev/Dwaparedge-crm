"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api-client";
import type { DeskCounts } from "./sections";

const CHANGED_EVENT = "tasks:changed";
const POLL_MS = 60_000;

const NO_COUNTS: DeskCounts = { overdue: 0, followUpsDue: 0, dueToday: 0, next7: 0, parked: 0, parkedLate: 0, badge: 0 };

/** Tells the sidebar badge and the bell that a task changed, so they re-count straight away. */
export const announceTasksChanged = () => window.dispatchEvent(new Event(CHANGED_EVENT));

/**
 * The Desk counts for the signed-in user (overdue, follow-ups due, and the badge made of the two). Counted again on
 * every page change, when a task is changed, when the tab becomes visible, and every minute while it is visible, so
 * a task that falls due shows up without a reload. Each count also runs the auto-task sync on the server.
 */
export function useDeskCounts(): DeskCounts {
  const pathname = usePathname();
  const [counts, setCounts] = useState<DeskCounts>(NO_COUNTS);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      api<{ counts: DeskCounts }>("/api/tasks/sync", { method: "POST" })
        .then((result) => { if (!cancelled) setCounts(result.counts); })
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

  return counts;
}
