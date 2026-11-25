import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { getDeskCounts } from "@/features/tasks/desk";
import { syncAutoTasks } from "@/features/tasks/sync";

/** The badge's poll. A POST because the auto-task sync writes; the body is ignored. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    // A failing sync must not break the badge: the counts are still true, and the next poll tries again.
    const sync = await syncAutoTasks().catch((e) => { console.error("auto-task sync failed", e); return { status: "failed" as const }; });
    return NextResponse.json({ counts: await getDeskCounts(user), sync });
  } catch (error) {
    return errorResponse(error);
  }
}
