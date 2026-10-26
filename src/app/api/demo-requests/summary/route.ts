import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { demoRequestSummary } from "@/features/demo-requests/service";

/** Counts per status; the sidebar badge and the bell read the "new" count from here. */
export async function GET() {
  try {
    await requireUser();
    return NextResponse.json(await demoRequestSummary());
  } catch (error) {
    return errorResponse(error);
  }
}
