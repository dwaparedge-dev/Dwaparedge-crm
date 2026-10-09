import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { licenseActionSchema } from "@/features/licenses/schema";
import { performAction } from "@/features/licenses/service";

export async function POST(request: Request, ctx: RouteContext<"/api/licenses/[id]/action">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await performAction(uuid.parse((await ctx.params).id), licenseActionSchema.parse(await readJson(request)), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
