"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { NotificationContainer, type NotificationItem, type NotificationSeverity } from "@/components/shared/Notification";

interface NotifyApi {
  success: (text: string) => void;
  error: (text: string) => void;
  warning: (text: string) => void;
  info: (text: string) => void;
}

const NotifyContext = createContext<NotifyApi | null>(null);
const MAX_VISIBLE = 5;

const TITLES: Record<NotificationSeverity, string> = { success: "Success", error: "Something went wrong", warning: "Attention", info: "Notice" };

/** Toasts use the FactoONE notification components (frosted glass cards, top-right, auto-dismiss). */
export function NotifyProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const close = useCallback((id: string) => setItems((prev) => prev.filter((i) => i.id !== id)), []);
  const show = useCallback((severity: NotificationSeverity, message: string) => {
    setItems((prev) => {
      // Ignore an identical toast that is still on screen.
      if (prev.some((i) => i.severity === severity && i.message === message)) return prev;
      const next = [...prev, { id: crypto.randomUUID(), title: TITLES[severity], message, severity, duration: severity === "error" ? 7000 : 4500, createdAt: Date.now() }];
      return next.slice(-MAX_VISIBLE);
    });
  }, []);
  const api = useMemo<NotifyApi>(
    () => ({ success: (t) => show("success", t), error: (t) => show("error", t), warning: (t) => show("warning", t), info: (t) => show("info", t) }),
    [show],
  );
  return (
    <NotifyContext.Provider value={api}>
      {children}
      <NotificationContainer items={items} onClose={close} />
    </NotifyContext.Provider>
  );
}

export function useNotify(): NotifyApi {
  const ctx = useContext(NotifyContext);
  if (!ctx) throw new Error("useNotify must be used within NotifyProvider");
  return ctx;
}
