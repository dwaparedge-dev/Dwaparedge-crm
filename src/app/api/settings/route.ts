import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { settingsSchema } from "@/features/settings/schema";
import { getSettings, updateSettings } from "@/features/settings/service";

// The unused request parameter keeps this a request-time (never prerendered) handler.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: Request) {
  try {
    await requireUser();
    return NextResponse.json(await getSettings());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await updateSettings(settingsSchema.parse(await readJson(request)), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
