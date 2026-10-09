export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: { duplicates?: Array<{ id: string; legalName: string; email: string | null; archived: boolean }>; issues?: Array<{ path: (string | number)[]; message: string }> },
  ) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, init?: Omit<RequestInit, "body"> & { body?: unknown }): Promise<T> {
  const method = init?.method ?? "GET";
  const hasBody = method !== "GET";
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: hasBody ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
      body: hasBody ? JSON.stringify(init?.body ?? {}) : undefined,
    });
  } catch {
    throw new ApiError("Network error. Check your connection and try again.", 0);
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401 && typeof window !== "undefined") {
    // Full navigation on purpose: drops all client state once the session is gone.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(e?.message ?? "Request failed", res.status, e?.code, { duplicates: e?.duplicates, issues: e?.issues });
  }
  return data as T;
}
