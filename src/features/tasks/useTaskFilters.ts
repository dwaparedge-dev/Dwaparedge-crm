"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DEFAULT_FILTERS, SEARCH_MAX, filtersToQuery, parseFilters, type TaskListFilters } from "./list-filters";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * The All tasks filters, held in the address bar. The address is the one source of truth, so a view can be bookmarked,
 * and a link that arrives while the page is open (the sidebar's "All tasks", a link from the bell) simply shows its own filters.
 *
 * Changes are written with the browser's own `history.replaceState`, which the Next.js router follows (`useSearchParams` sees
 * the new address at once) without asking the server for the page again: the page itself does not depend on the filters, only
 * the list the browser fetches does. `replace`, not `push`, so a filter change does not fill the Back button.
 *
 * The search box keeps its own text while you type and writes it to the address a moment after you stop.
 */
export function useTaskFilters() {
  const params = useSearchParams();
  const query = params.toString();
  const filters = useMemo(() => parseFilters(params), [params]);

  const [text, setText] = useState(filters.search);
  /** Bumped when the address changes under us, so a control that keeps its own copy of a value starts again from the address. */
  const [resetCount, setResetCount] = useState(0);
  // `seen` is the address last rendered; `written` is the address this page last wrote. An address that is new and that this
  // page did not write came from outside (a link), so the search box is set from it. Comparing with what was written, not
  // with what is in the box, keeps letters typed while a write is still landing.
  const [seen, setSeen] = useState(query);
  const [written, setWritten] = useState(query);
  if (query !== seen) {
    setSeen(query);
    if (query !== written) {
      setWritten(query);
      setText(filters.search);
      setResetCount((n) => n + 1);
    }
  }

  /** Changes the filters. Anything that changes what is listed goes back to page 1; paging itself says which page. */
  const update = useCallback((patch: Partial<TaskListFilters>) => {
    // Built on the address as it is now, not on what was last rendered, so two changes in a row cannot undo each other.
    const current = parseFilters(new URLSearchParams(window.location.search));
    const q = filtersToQuery({ ...current, ...patch, page: patch.page ?? DEFAULT_FILTERS.page });
    setWritten(q);
    window.history.replaceState(null, "", q ? `${window.location.pathname}?${q}` : window.location.pathname);
  }, []);

  const writtenSearch = useMemo(() => parseFilters(new URLSearchParams(written)).search, [written]);
  useEffect(() => {
    const wanted = text.trim().slice(0, SEARCH_MAX);
    if (wanted === writtenSearch) return;
    const timer = window.setTimeout(() => update({ search: wanted }), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text, writtenSearch, update]);

  /** Drops every filter that narrows the list; the status tab and the page size stay. */
  const clear = useCallback(() => {
    setText("");
    setResetCount((n) => n + 1);
    update({ categoryId: "", priorityId: "", ownerId: "", clientId: "", origin: "", dueFrom: "", dueTo: "", search: "" });
  }, [update]);

  return { filters, update, clear, text, setText, resetCount };
}
