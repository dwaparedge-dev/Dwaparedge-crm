import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { addOptionSchema, listOptionsSchema } from "@/features/options/schema";
import { addOption, listAllWithUsage, listOptions } from "@/features/options/service";

/** GET ?table=&column= lists one dropdown; GET with no params lists all of them (Settings page). */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const sp = Object.fromEntries(request.nextUrl.searchParams);
    if (!sp.table && !sp.column) return NextResponse.json({ fields: await listAllWithUsage() });
    const p = listOptionsSchema.parse(sp);
    return NextResponse.json({ items: await listOptions(p.table, p.column, p.all === "true") });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const p = addOptionSchema.parse(await readJson(request));
    return NextResponse.json({ item: await addOption(p.table, p.column, p.label, user.id) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
