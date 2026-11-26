import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { requireAnalyticsView, parseRange } from "@/features/analytics/access";
import { reportQuerySchema } from "@/features/analytics/schema";
import { getOverview } from "@/features/analytics/reports";

export async function GET(request: NextRequest) {
  try {
    requireAnalyticsView(await requireUser());
    const q = reportQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return NextResponse.json(await getOverview(parseRange(q), { country: q.country, device: q.device }));
  } catch (error) {
    return errorResponse(error);
  }
}
