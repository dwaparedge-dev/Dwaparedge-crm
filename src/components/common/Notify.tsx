"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import Alert, { type AlertColor } from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";

interface Message {
  text: string;
  severity: AlertColor;
  key: number;
}
interface NotifyApi {
  success: (text: string) => void;
  error: (text: string) => void;
}

const NotifyContext = createContext<NotifyApi | null>(null);

export function NotifyProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<Message | null>(null);
  const show = useCallback(
    (severity: AlertColor, text: string) => setMessage({ severity, text, key: Date.now() }),
    [],
  );
  const api = useMemo<NotifyApi>(
    () => ({ success: (t) => show("success", t), error: (t) => show("error", t) }),
    [show],
  );
  return (
    <NotifyContext.Provider value={api}>
      {children}
      <Snackbar
        key={message?.key}
        open={message !== null}
        autoHideDuration={5000}
        onClose={() => setMessage(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {message ? (
          <Alert severity={message.severity} variant="filled" onClose={() => setMessage(null)}>
            {message.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </NotifyContext.Provider>
  );
}

export function useNotify(): NotifyApi {
  const ctx = useContext(NotifyContext);
  if (!ctx) throw new Error("useNotify must be used within NotifyProvider");
  return ctx;
}
