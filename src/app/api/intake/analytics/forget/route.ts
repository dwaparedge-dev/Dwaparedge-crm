import { NextResponse } from "next/server";
import { errorResponse, readJsonLimited } from "@/lib/http";
import { requireIntakeKey } from "@/lib/auth/intake-key";
import { forgetVisitorSchema } from "@/features/analytics/schema";
import { forgetVisitor } from "@/features/analytics/service";

/** A visitor withdrew consent on the website: erase everything stored under their browser id. Same key as the other intake routes. */
export async function POST(request: Request) {
  try {
    requireIntakeKey(request);
    const { visitorId } = forgetVisitorSchema.parse(await readJsonLimited(request, 500));
    return NextResponse.json(await forgetVisitor(visitorId));
  } catch (error) {
    return errorResponse(error);
  }
}
