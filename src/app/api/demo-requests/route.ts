import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { listDemoRequestsSchema } from "@/features/demo-requests/schema";
import { listDemoRequests } from "@/features/demo-requests/service";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    return NextResponse.json(await listDemoRequests(listDemoRequestsSchema.parse(Object.fromEntries(request.nextUrl.searchParams))));
  } catch (error) {
    return errorResponse(error);
  }
}
