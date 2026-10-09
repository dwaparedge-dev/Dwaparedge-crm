"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

interface Settled<T> {
  key: string;
  data: T | null;
  error: string | null;
}

/** Fetches JSON from `url` (null = skip). Keeps previous data visible while a refetch is in flight. */
export function useFetch<T>(url: string | null) {
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const key = `${url}#${tick}`;

  useEffect(() => {
    if (url === null) return;
    let cancelled = false;
    api<T>(url)
      .then((data) => !cancelled && setSettled({ key, data, error: null }))
      .catch((e: Error) => !cancelled && setSettled((prev) => ({ key, data: prev?.data ?? null, error: e.message })));
    return () => {
      cancelled = true;
    };
  }, [url, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return {
    data: settled?.data ?? null,
    error: settled?.key === key ? settled.error : null,
    loading: url !== null && settled?.key !== key,
    reload,
  };
}
