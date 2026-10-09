import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { licenseInputSchema } from "@/features/licenses/schema";
import { getLicense, updateLicense } from "@/features/licenses/service";

export async function GET(_req: Request, ctx: RouteContext<"/api/licenses/[id]">) {
  try {
    await requireUser();
    return NextResponse.json(await getLicense(uuid.parse((await ctx.params).id)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/licenses/[id]">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await updateLicense(uuid.parse((await ctx.params).id), licenseInputSchema.parse(await readJson(request)), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
