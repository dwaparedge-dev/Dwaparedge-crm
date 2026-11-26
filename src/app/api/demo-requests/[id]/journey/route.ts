import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { requireAnalyticsView } from "@/features/analytics/access";
import { uuid } from "@/lib/validation";
import { getJourney } from "@/features/analytics/reports";

/** What this lead did on the website before asking for a demo. Needs analytics.view. */
export async function GET(_request: Request, ctx: RouteContext<"/api/demo-requests/[id]/journey">) {
  try {
    requireAnalyticsView(await requireUser());
    return NextResponse.json(await getJourney(uuid.parse((await ctx.params).id)));
  } catch (error) {
    return errorResponse(error);
  }
}
