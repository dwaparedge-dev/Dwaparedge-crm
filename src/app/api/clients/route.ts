import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { clientInputSchema, listClientsSchema } from "@/features/clients/schema";
import { createClient, listClients } from "@/features/clients/service";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const params = listClientsSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return NextResponse.json(await listClients(params));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { confirmDuplicate, ...body } = (await readJson(request)) as Record<string, unknown>;
    const input = clientInputSchema.parse(body);
    const id = await createClient(input, user.id, confirmDuplicate === true);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
