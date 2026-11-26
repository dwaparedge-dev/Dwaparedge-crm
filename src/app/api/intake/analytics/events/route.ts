import { NextResponse } from "next/server";
import { errorResponse, readJsonLimited } from "@/lib/http";
import { requireIntakeKey } from "@/lib/auth/intake-key";
import { analyticsBatchSchema } from "@/features/analytics/schema";
import { ingestBatch } from "@/features/analytics/service";

/** 20 events of a few dozen bytes each; anything near this size is not a tracker batch. */
const MAX_BODY_CHARS = 16_000;

/** Receives a batch of website events from the website server (never from a browser). The shared key is checked before the body is read. */
export async function POST(request: Request) {
  try {
    requireIntakeKey(request);
    const batch = analyticsBatchSchema.parse(await readJsonLimited(request, MAX_BODY_CHARS));
    return NextResponse.json(await ingestBatch(batch), { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
