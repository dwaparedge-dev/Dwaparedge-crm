import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { getDeskCounts } from "@/features/tasks/desk";

/** The badge's poll. A POST because the auto-task sync (added later) writes; the body is ignored. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    return NextResponse.json({ counts: await getDeskCounts(user) });
  } catch (error) {
    return errorResponse(error);
  }
}
