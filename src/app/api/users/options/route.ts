import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { likePattern } from "@/lib/validation";

/** Active staff for owner dropdowns. Optional ?search= narrows by name. */
export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get("search")?.trim().slice(0, 100);
    await requireUser();
    const items = await db.query<{ id: string; name: string }>(
      "SELECT id, name FROM users WHERE is_active AND ($1::text IS NULL OR name ILIKE $1) ORDER BY name",
      [search ? likePattern(search) : null],
    );
    return NextResponse.json({ items });
  } catch (error) {
    return errorResponse(error);
  }
}
