import { z } from "zod";
import { cleanText } from "@/lib/validation";
import { RANGE_PRESETS } from "./range";

/** Short text from the website server: control characters out, length capped, blank = absent. */
const tidy = (max: number) =>
  z.string().transform(cleanText).pipe(z.string().max(max)).transform((s) => s || undefined).optional();

/** A path only: starts with "/", no query string or fragment (the website strips them, and we refuse them here too). */
const pathOnly = z.string().min(1).max(300).regex(/^\/[^?#\s]*$/, "path must start with / and carry no query string");

const tag = z.string().transform(cleanText).pipe(z.string().max(100)).transform((s) => s.toLowerCase() || undefined).optional();

export const analyticsEventSchema = z.object({
  eventId: z.string().uuid(),
  type: z.enum(["pageview", "engagement", "custom"]),
  /** Custom events only: section_about, form_start, demo_request, ... */
  name: z.string().regex(/^[a-z0-9_]{1,50}$/).optional(),
  path: pathOnly,
  /** Engagement only: seconds this page was visible, and how far it was scrolled. */
  durationS: z.number().int().min(0).max(3600).optional(),
  scrollPct: z.number().int().min(0).max(100).optional(),
  /** How long before the send this happened. The server clock decides the time; the visitor's clock is never trusted. */
  ageMs: z.number().int().min(0).max(600_000).default(0),
}).refine((e) => e.type !== "custom" || !!e.name, { message: "custom events need a name", path: ["name"] });

export const analyticsBatchSchema = z.object({
  visitorId: z.string().uuid(),
  sessionId: z.string().uuid(),
  /** Version of the privacy notice the visitor accepted, e.g. "2026-11-26". */
  consentVersion: z.string().regex(/^[A-Za-z0-9._-]{1,20}$/),
  country: z.string().regex(/^[A-Za-z]{2}$/).transform((s) => s.toUpperCase()).optional(),
  region: tidy(100),
  city: tidy(100),
  deviceType: z.enum(["desktop", "mobile", "tablet"]).default("desktop"),
  browser: tidy(40),
  os: tidy(40),
  language: tidy(20),
  referrerHost: z.string().toLowerCase().regex(/^[a-z0-9.-]{1,253}$/).optional(),
  utmSource: tag,
  utmMedium: tag,
  utmCampaign: tag,
  events: z.array(analyticsEventSchema).min(1).max(20),
});
export type AnalyticsBatch = z.infer<typeof analyticsBatchSchema>;
export type AnalyticsEventInput = z.infer<typeof analyticsEventSchema>;

export const forgetVisitorSchema = z.object({ visitorId: z.string().uuid() });

/** Query string of the staff reports. */
export const reportQuerySchema = z.object({
  range: z.enum(RANGE_PRESETS).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  /** Narrow every number on the report to one country (2-letter code) and/or one device type. Blank = everything. */
  country: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^[A-Za-z]{2}$/).transform((x) => x.toUpperCase()).optional()),
  device: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["desktop", "mobile", "tablet"]).optional()),
});

export const sessionListSchema = reportQuerySchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  /** "identified" = only visits linked to a demo request. */
  only: z.enum(["identified", "converted"]).optional(),
});
