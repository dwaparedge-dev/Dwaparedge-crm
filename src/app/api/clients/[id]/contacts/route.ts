import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { contactInputSchema } from "@/features/contacts/schema";
import { createContact, listContacts } from "@/features/contacts/service";

export async function GET(_req: Request, ctx: RouteContext<"/api/clients/[id]/contacts">) {
  try {
    await requireUser();
    const id = uuid.parse((await ctx.params).id);
    return NextResponse.json({ items: await listContacts(id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, ctx: RouteContext<"/api/clients/[id]/contacts">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const id = uuid.parse((await ctx.params).id);
    const contactId = await createContact(id, contactInputSchema.parse(await readJson(request)), user.id);
    return NextResponse.json({ id: contactId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
