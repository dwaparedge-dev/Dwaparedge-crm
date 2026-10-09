import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { getPayment } from "@/features/payments/service";

export async function GET(_req: Request, ctx: RouteContext<"/api/payments/[id]">) {
  try {
    await requireUser();
    return NextResponse.json(await getPayment(uuid.parse((await ctx.params).id)));
  } catch (error) {
    return errorResponse(error);
  }
}
