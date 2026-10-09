import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { contactInputSchema } from "@/features/contacts/schema";
import { deleteContact, updateContact } from "@/features/contacts/service";

type Ctx = RouteContext<"/api/clients/[id]/contacts/[contactId]">;

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const p = await ctx.params;
    await updateContact(uuid.parse(p.id), uuid.parse(p.contactId), contactInputSchema.parse(await readJson(request)), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const p = await ctx.params;
    await deleteContact(uuid.parse(p.id), uuid.parse(p.contactId), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
