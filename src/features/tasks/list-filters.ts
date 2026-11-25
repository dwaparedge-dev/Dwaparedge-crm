import { listTasksSchema, type TaskStatus } from "./schema";

// The All tasks page keeps its filters in the address bar, so a view can be bookmarked or sent to someone. These plain
// functions read them from the URL, write them back, and turn them into the query the list API takes. No React and no
// browser in here, so the exact strings are unit-tested (tests/tasks-list-filters.test.ts).

export const DEFAULT_PAGE_SIZE = 20;
/** The list API refuses more than this per page. */
export const MAX_PAGE_SIZE = 100;
/** The longest search the API takes. */
export const SEARCH_MAX = 100;

/** `active` and `closed` are groups of statuses; the rest is one status. */
export type StatusFilter = "active" | "closed" | TaskStatus;

export interface TaskListFilters {
  status: StatusFilter;
  categoryId: string;
  priorityId: string;
  /** Empty (anyone), `unassigned`, or a user id. */
  ownerId: string;
  clientId: string;
  /** Empty (any source), added by hand, or raised by the CRM. */
  origin: "" | "manual" | "auto";
  /** `YYYY-MM-DD`, or empty. */
  dueFrom: string;
  dueTo: string;
  search: string;
  /** 1 is the first page (the address bar and the API count from 1; the table counts from 0). */
  page: number;
  pageSize: number;
}

export const DEFAULT_FILTERS: TaskListFilters = {
  status: "active",
  categoryId: "",
  priorityId: "",
  ownerId: "",
  clientId: "",
  origin: "",
  dueFrom: "",
  dueTo: "",
  search: "",
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

/** What a `URLSearchParams` (or the read-only one `useSearchParams` gives) can do for us. */
interface ParamReader {
  get(name: string): string | null;
}

// The address-bar names, in the order they are written.
const NAMES = { status: "status", categoryId: "category", priorityId: "priority", ownerId: "owner", clientId: "client", origin: "source", dueFrom: "from", dueTo: "to", search: "q", page: "page", pageSize: "size" } as const;

const fields = listTasksSchema.shape;
interface Checker { safeParse(v: unknown): { success: boolean } }
/** A value the list API would accept, judged by the API's own schema so the two cannot drift apart. */
const valid = (schema: Checker, value: string) => schema.safeParse(value).success;

const positiveInt = (v: string | null): number | null => (v !== null && /^\d+$/.test(v) && Number(v) >= 1 ? Number(v) : null);

/**
 * The filters in an address bar. Anything that is missing or that the API would refuse (a mistyped status, a half-copied id,
 * 2026-02-30) is dropped to its default, so a damaged link still opens a working list instead of an error.
 */
export function parseFilters(params: ParamReader): TaskListFilters {
  const text = (key: keyof typeof NAMES) => params.get(NAMES[key]) ?? "";
  const checked = (key: keyof typeof NAMES, schema: Checker) => {
    const v = text(key);
    return v !== "" && valid(schema, v) ? v : "";
  };
  const status = text("status");
  const page = positiveInt(params.get(NAMES.page));
  const size = positiveInt(params.get(NAMES.pageSize));
  return {
    status: valid(fields.status, status) ? (status as StatusFilter) : DEFAULT_FILTERS.status,
    categoryId: checked("categoryId", fields.categoryId),
    priorityId: checked("priorityId", fields.priorityId),
    ownerId: checked("ownerId", fields.ownerId),
    clientId: checked("clientId", fields.clientId),
    origin: checked("origin", fields.origin) as TaskListFilters["origin"],
    dueFrom: checked("dueFrom", fields.dueFrom),
    dueTo: checked("dueTo", fields.dueTo),
    search: text("search").trim().slice(0, SEARCH_MAX),
    page: page ?? DEFAULT_FILTERS.page,
    pageSize: size === null ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE),
  };
}

/** The filters as an address-bar query (no leading `?`). What is at its default is left out, so a plain view has a plain address. */
export function filtersToQuery(f: TaskListFilters): string {
  const q = new URLSearchParams();
  const put = (key: keyof typeof NAMES, value: string) => { if (value !== "") q.set(NAMES[key], value); };
  if (f.status !== DEFAULT_FILTERS.status) put("status", f.status);
  put("categoryId", f.categoryId);
  put("priorityId", f.priorityId);
  put("ownerId", f.ownerId);
  put("clientId", f.clientId);
  put("origin", f.origin);
  put("dueFrom", f.dueFrom);
  put("dueTo", f.dueTo);
  put("search", f.search.trim().slice(0, SEARCH_MAX));
  if (f.page !== DEFAULT_FILTERS.page) put("page", String(f.page));
  if (f.pageSize !== DEFAULT_PAGE_SIZE) put("pageSize", String(f.pageSize));
  return q.toString();
}

/** True when anything beyond the status tab and the paging is set: whether "clear filters" has something to clear. */
export function hasNarrowingFilters(f: TaskListFilters): boolean {
  return Boolean(f.categoryId || f.priorityId || f.ownerId || f.clientId || f.origin || f.dueFrom || f.dueTo || f.search);
}

/** Closed tasks are read newest change first; active ones by deadline (the API breaks ties by priority). */
const isClosedView = (status: StatusFilter) => status === "closed" || status === "done" || status === "cancelled";

/**
 * The query for `GET /api/tasks`. `scope` is `all` for someone holding tasks.view_all, who may also filter by owner; for everyone
 * else the API only ever returns their own tasks, so an owner left in a link is not sent.
 */
export function apiQuery(f: TaskListFilters, scope: "mine" | "all"): string {
  const q = new URLSearchParams({ scope, status: f.status });
  const put = (name: string, value: string) => { if (value !== "") q.set(name, value); };
  put("categoryId", f.categoryId);
  put("priorityId", f.priorityId);
  if (scope === "all") put("ownerId", f.ownerId);
  put("clientId", f.clientId);
  put("origin", f.origin);
  put("dueFrom", f.dueFrom);
  put("dueTo", f.dueTo);
  put("search", f.search.trim().slice(0, SEARCH_MAX));
  q.set("sort", isClosedView(f.status) ? "updated" : "due");
  q.set("dir", isClosedView(f.status) ? "desc" : "asc");
  q.set("page", String(f.page));
  q.set("pageSize", String(f.pageSize));
  return q.toString();
}
