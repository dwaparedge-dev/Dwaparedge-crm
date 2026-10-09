"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const IDLE_MS = 30 * 60 * 1000;
const EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

/** Signs this browser out after 30 minutes without activity (other devices stay signed in). Checked across tabs. */
export function IdleSignOut() {
  const router = useRouter();
  const last = useRef(0);
  useEffect(() => {
    const KEY = "crm_last_activity";
    const touch = () => {
      const now = Date.now();
      if (now - last.current < 5000) return; // don't write on every mouse move
      last.current = now;
      try { localStorage.setItem(KEY, String(now)); } catch { /* private mode */ }
    };
    touch();
    EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = setInterval(async () => {
      let seen = last.current;
      try { seen = Math.max(seen, Number(localStorage.getItem(KEY) ?? 0)); } catch { /* ignore */ }
      if (Date.now() - seen < IDLE_MS) return;
      clearInterval(timer);
      await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ everywhere: false }) }).catch(() => undefined);
      router.replace("/login?reason=idle");
      router.refresh();
    }, 30_000);
    return () => {
      clearInterval(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, touch));
    };
  }, [router]);
  return null;
}
