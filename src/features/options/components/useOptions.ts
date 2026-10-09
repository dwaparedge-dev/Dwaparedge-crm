"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/api-client";
import type { FieldOption } from "../registry";

/** One shared list per `table.column`, so adding an option in one form shows up in every other. */
const cache = new Map<string, FieldOption[]>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const EMPTY: FieldOption[] = [];

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

function load(key: string, force = false): Promise<void> {
  if (!force && cache.has(key)) return Promise.resolve();
  const running = inflight.get(key);
  if (running) return running;
  const [table, column] = key.split(".");
  const p = api<{ items: FieldOption[] }>(`/api/options?table=${table}&column=${column}`)
    .then((r) => {
      cache.set(key, r.items);
      emit();
    })
    .catch(() => undefined)
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Forget everything (used by the Settings page after it edits options). */
export function refreshOptions() {
  for (const key of cache.keys()) void load(key, true);
}

export function useOptions(table: string, column: string) {
  const key = `${table}.${column}`;
  const options = useSyncExternalStore(subscribe, () => cache.get(key) ?? EMPTY, () => EMPTY);
  useEffect(() => {
    void load(key);
  }, [key]);

  const add = useCallback(async (label: string) => {
    const { item } = await api<{ item: FieldOption }>("/api/options", { method: "POST", body: { table, column, label } });
    await load(key, true);
    return item;
  }, [table, column, key]);

  const labelOf = useCallback((value: string | null | undefined) => {
    if (!value) return "";
    return options.find((o) => o.option_key.toLowerCase() === value.toLowerCase())?.option_value ?? value;
  }, [options]);

  return { options, loaded: cache.has(key), add, labelOf };
}
