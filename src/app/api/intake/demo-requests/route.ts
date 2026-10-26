import { NextResponse } from "next/server";
import { errorResponse, readJsonLimited } from "@/lib/http";
import { requireIntakeKey } from "@/lib/auth/intake-key";
import { demoRequestInputSchema } from "@/features/demo-requests/schema";
import { createDemoRequest } from "@/features/demo-requests/service";

/** The form has four short fields; anything near this size is not a demo request. */
const MAX_BODY_CHARS = 8_000;

/**
 * Receives a "Book a demo" submission from the FactoOne server. Not a staff route: no session and no Origin check
 * (the caller is a server, not a browser). The shared key is the credential, and it is checked before the body is read.
 */
export async function POST(request: Request) {
  try {
    requireIntakeKey(request);
    const input = demoRequestInputSchema.parse(await readJsonLimited(request, MAX_BODY_CHARS));
    const result = await createDemoRequest(input);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
