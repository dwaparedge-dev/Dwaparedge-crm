import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { AppError } from "@/lib/auth/errors";
import { likePattern } from "@/lib/validation";
import type { DemoRequestInput, DemoRequestStatus, DemoRequestStatusInput, ListDemoRequestsParams, UpdateDemoRequestInput } from "./schema";

/** The same email or mobile asking again inside this window is counted on the first request, not stored as a new one. */
const REPEAT_WINDOW_HOURS = 24;

const hashIp = (ip: string) => createHash("sha256").update(`${getEnv().RATE_LIMIT_SALT}:demo-ip:${ip}`).digest("hex");

export interface CreateDemoRequestResult {
  id: string;
  /** True when nothing new was stored: a retry of the same attempt, or the same person asking again. */
  duplicate: boolean;
}

export async function createDemoRequest(input: DemoRequestInput): Promise<CreateDemoRequestResult> {
  return db.transaction(async (tx) => {
    // 1. The form retrying the same attempt (network drop, double click): answer with the original, change nothing.
    if (input.externalRef) {
      const { rows } = await tx.query<{ id: string }>("SELECT id FROM demo_requests WHERE external_ref = $1", [input.externalRef]);
      if (rows[0]) return { id: rows[0].id, duplicate: true };
    }

    const meta = { source: input.source, entryPoint: input.entryPoint ?? null };

    // 2. The same person asking again within a day: bump the counter on their first request so staff see it once.
    const { rows: again } = await tx.query<{ id: string }>(
      `UPDATE demo_requests SET repeat_count = repeat_count + 1, last_submitted_at = now(), updated_at = now()
       WHERE id = (
         SELECT id FROM demo_requests
         WHERE status <> 'spam' AND created_at > now() - make_interval(hours => $3) AND (lower(email) = $1 OR mobile = $2)
         ORDER BY created_at DESC LIMIT 1
         FOR UPDATE)
       RETURNING id`,
      [input.email, input.mobile, REPEAT_WINDOW_HOURS],
    );
    if (again[0]) {
      await logActivity(
        { entityType: "demo_request", entityId: again[0].id, action: "repeated", summary: `${input.name} (${input.company}) asked for a demo again`, actorId: null, metadata: meta },
        tx,
      );
      return { id: again[0].id, duplicate: true };
    }

    // 3. A new request. A concurrent retry with the same external_ref loses the insert and is answered with the winner.
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO demo_requests (name, company, mobile, email, source, entry_point, external_ref, ip_hash, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (external_ref) WHERE external_ref IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        input.name, input.company, input.mobile, input.email, input.source, input.entryPoint ?? null, input.externalRef ?? null,
        input.submitterIp ? hashIp(input.submitterIp) : null, input.userAgent ?? null,
      ],
    );
    if (!rows[0]) {
      const { rows: winner } = await tx.query<{ id: string }>("SELECT id FROM demo_requests WHERE external_ref = $1", [input.externalRef]);
      return { id: winner[0]!.id, duplicate: true };
    }
    await logActivity(
      { entityType: "demo_request", entityId: rows[0].id, action: "created", summary: `Demo requested by ${input.name} (${input.company})`, actorId: null, metadata: meta },
      tx,
    );
    return { id: rows[0].id, duplicate: false };
  });
}

// ---- Staff side: the Demo requests page ----

export interface DemoRequestRow {
  id: string;
  name: string;
  company: string;
  mobile: string;
  email: string;
  source: string;
  entry_point: string | null;
  status: DemoRequestStatus;
  owner_id: string | null;
  owner_name: string | null;
  notes: string | null;
  client_id: string | null;
  repeat_count: number;
  last_submitted_at: string;
  contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DemoRequestEventRow {
  id: string;
  action: string;
  summary: string;
  actor_name: string | null;
  created_at: string;
}

/** Everything the page shows; the visitor's hashed address and browser stay in the database. */
const SELECT = `
  SELECT d.id, d.name, d.company, d.mobile, d.email, d.source, d.entry_point, d.status, d.owner_id, u.name AS owner_name,
         d.notes, d.client_id, d.repeat_count, d.last_submitted_at, d.contacted_at, d.created_at, d.updated_at
  FROM demo_requests d LEFT JOIN users u ON u.id = d.owner_id`;

const SORTS = { created: "d.created_at", name: "lower(d.name)", company: "lower(d.company)" } as const;

export async function listDemoRequests(p: ListDemoRequestsParams) {
  const where: string[] = [];
  const values: unknown[] = [];
  const add = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };
  // Spam is kept out of the everyday view; it has its own tab.
  where.push(p.status ? `d.status = ${add(p.status)}` : "d.status <> 'spam'");
  if (p.ownerId) where.push(`d.owner_id = ${add(p.ownerId)}`);
  if (p.search) {
    const s = add(likePattern(p.search));
    where.push(`(d.name ILIKE ${s} OR d.company ILIKE ${s} OR d.mobile ILIKE ${s} OR d.email ILIKE ${s})`);
  }
  const order = `${SORTS[p.sort]} ${p.dir === "desc" ? "DESC" : "ASC"}, d.id`;
  const limit = add(p.pageSize);
  const offset = add((p.page - 1) * p.pageSize);

  const rows = await db.query<DemoRequestRow & { total_rows: string }>(
    `${SELECT.replace("SELECT d.id", "SELECT count(*) OVER() AS total_rows, d.id")} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  return {
    items: rows.map((r) => {
      const { total_rows, ...rest } = r;
      void total_rows;
      return rest;
    }),
    total: Number(rows[0]?.total_rows ?? 0),
    summary: await demoRequestSummary(),
    page: p.page,
    pageSize: p.pageSize,
  };
}

/** How many requests sit in each status. `all` is everything except spam, matching the list's default view. */
export async function demoRequestSummary() {
  const r = await db.queryOne<Record<"new" | "contacted" | "scheduled" | "done" | "spam" | "all", string>>(
    `SELECT count(*) FILTER (WHERE status = 'new') AS "new", count(*) FILTER (WHERE status = 'contacted') AS contacted,
            count(*) FILTER (WHERE status = 'scheduled') AS scheduled, count(*) FILTER (WHERE status = 'done') AS done,
            count(*) FILTER (WHERE status = 'spam') AS spam, count(*) FILTER (WHERE status <> 'spam') AS "all"
     FROM demo_requests`,
  );
  return {
    new: Number(r?.new ?? 0), contacted: Number(r?.contacted ?? 0), scheduled: Number(r?.scheduled ?? 0),
    done: Number(r?.done ?? 0), spam: Number(r?.spam ?? 0), all: Number(r?.all ?? 0),
  };
}

export async function getDemoRequest(id: string) {
  const row = await db.queryOne<DemoRequestRow>(`${SELECT} WHERE d.id = $1`, [id]);
  if (!row) throw new AppError("Demo request not found", 404, "NOT_FOUND");
  const events = await db.query<DemoRequestEventRow>(
    `SELECT a.id::text AS id, a.action, a.summary, u.name AS actor_name, a.created_at
     FROM activity_log a LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.entity_type = 'demo_request' AND a.entity_id = $1 ORDER BY a.created_at DESC, a.id DESC`,
    [id],
  );
  return { ...row, events };
}

/** Changes the owner and/or the notes. Only what is sent changes, and nothing is logged when nothing actually changed. */
export async function updateDemoRequest(id: string, input: UpdateDemoRequestInput, actorId: string) {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ name: string; company: string; owner_id: string | null; notes: string | null }>(
      "SELECT name, company, owner_id, notes FROM demo_requests WHERE id = $1 FOR UPDATE",
      [id],
    );
    const cur = rows[0];
    if (!cur) throw new AppError("Demo request not found", 404, "NOT_FOUND");

    const ownerChanged = input.ownerId !== undefined && input.ownerId !== cur.owner_id;
    const notesChanged = input.notes !== undefined && input.notes !== cur.notes;
    if (!ownerChanged && !notesChanged) return;

    let ownerName: string | null = null;
    if (ownerChanged && input.ownerId) {
      const owner = await tx.query<{ name: string }>("SELECT name FROM users WHERE id = $1 AND is_active", [input.ownerId]);
      if (!owner.rowCount) throw new AppError("Choose an active staff member", 422, "VALIDATION_ERROR");
      ownerName = owner.rows[0]!.name;
    }

    await tx.query(
      `UPDATE demo_requests SET owner_id = CASE WHEN $1::boolean THEN $2::uuid ELSE owner_id END,
                                notes = CASE WHEN $3::boolean THEN $4::text ELSE notes END, updated_at = now()
       WHERE id = $5`,
      [ownerChanged, input.ownerId ?? null, notesChanged, input.notes ?? null, id],
    );
    const who = `${cur.name} (${cur.company})`;
    if (ownerChanged) {
      await logActivity({ entityType: "demo_request", entityId: id, action: "assigned", summary: ownerName ? `Demo request from ${who} assigned to ${ownerName}` : `Demo request from ${who} unassigned`, actorId }, tx);
    }
    if (notesChanged) {
      await logActivity({ entityType: "demo_request", entityId: id, action: "notes_updated", summary: `Notes updated on the demo request from ${who}`, actorId }, tx);
    }
  });
}

const STATUS_LABEL: Record<DemoRequestStatus, string> = { new: "New", contacted: "Contacted", scheduled: "Scheduled", done: "Done", spam: "Spam" };

/** Moves a request to another status. Any status can follow any other (a request wrongly marked spam can be reopened). */
export async function setDemoRequestStatus(id: string, input: DemoRequestStatusInput, actorId: string) {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ name: string; company: string; status: DemoRequestStatus }>(
      "SELECT name, company, status FROM demo_requests WHERE id = $1 FOR UPDATE",
      [id],
    );
    const cur = rows[0];
    if (!cur) throw new AppError("Demo request not found", 404, "NOT_FOUND");
    if (cur.status === input.status) throw new AppError(`This request is already marked ${STATUS_LABEL[input.status]}`, 409, "INVALID_TRANSITION");

    // contacted_at records the first time anyone reached out; later moves (including back to New) never erase it.
    await tx.query(
      `UPDATE demo_requests SET status = $1,
              contacted_at = CASE WHEN $1 IN ('contacted','scheduled','done') AND contacted_at IS NULL THEN now() ELSE contacted_at END,
              updated_at = now()
       WHERE id = $2`,
      [input.status, id],
    );
    await logActivity(
      {
        entityType: "demo_request", entityId: id, action: "status_changed",
        summary: `Demo request from ${cur.name} (${cur.company}) moved from ${STATUS_LABEL[cur.status]} to ${STATUS_LABEL[input.status]}`,
        actorId, metadata: { from: cur.status, to: input.status },
      },
      tx,
    );
  });
}
