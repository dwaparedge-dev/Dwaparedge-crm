import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { createPrioritySchema, listConfigSchema } from "@/features/tasks/config-schema";
import { createConfig, listConfig } from "@/features/tasks/config-service";

/** Any signed-in user can read the list (for the pickers); `?all=true` includes hidden rows. */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const p = listConfigSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return NextResponse.json({ items: await listConfig("priorities", { includeInactive: p.all === "true" }) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Needs `tasks.manage_settings`; the service checks. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    return NextResponse.json(await createConfig("priorities", createPrioritySchema.parse(await readJson(request)), user), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
