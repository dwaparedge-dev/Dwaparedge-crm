import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { requireAnalyticsView, parseRange } from "@/features/analytics/access";
import { sessionListSchema } from "@/features/analytics/schema";
import { listSessions } from "@/features/analytics/reports";

export async function GET(request: NextRequest) {
  try {
    requireAnalyticsView(await requireUser());
    const q = sessionListSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return NextResponse.json(await listSessions(parseRange(q), { page: q.page, pageSize: q.pageSize, only: q.only, filters: { country: q.country, device: q.device, region: q.region, city: q.city } }));
  } catch (error) {
    return errorResponse(error);
  }
}
