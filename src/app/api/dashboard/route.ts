import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { dashboardQuerySchema, getDashboard } from "@/features/dashboard/service";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    return NextResponse.json(await getDashboard(dashboardQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))));
  } catch (error) {
    return errorResponse(error);
  }
}
