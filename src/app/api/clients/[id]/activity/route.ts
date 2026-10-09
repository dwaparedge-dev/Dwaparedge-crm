import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { listClientActivity } from "@/features/clients/service";

export async function GET(_req: Request, ctx: RouteContext<"/api/clients/[id]/activity">) {
  try {
    await requireUser();
    const id = uuid.parse((await ctx.params).id);
    return NextResponse.json({ items: await listClientActivity(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
