import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { deskQuerySchema } from "@/features/tasks/schema";
import { getDesk } from "@/features/tasks/desk";

/** The Desk: the sections with their tasks, and the counts. `owner` other than `me` needs `tasks.view_all` (the service checks). */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const query = deskQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return NextResponse.json(await getDesk(user, query));
  } catch (error) {
    return errorResponse(error);
  }
}
