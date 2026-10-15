import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { AppError } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { documentMetaSchema } from "@/features/clients/schema";
import { addDocument, listDocuments, readUpload } from "@/features/clients/documents";

export async function GET(_req: Request, ctx: RouteContext<"/api/clients/[id]/documents">) {
  try {
    await requireUser();
    const id = uuid.parse((await ctx.params).id);
    return NextResponse.json({ items: await listDocuments(id) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** multipart/form-data: file, docName, docType. */
export async function POST(request: Request, ctx: RouteContext<"/api/clients/[id]/documents">) {
  try {
    assertSameOrigin(request, { multipart: true });
    const user = await requireUser();
    const id = uuid.parse((await ctx.params).id);
    const form = await request.formData().catch(() => {
      throw new AppError("Request body must be a valid form upload", 400, "BAD_REQUEST");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Choose a file to upload", 422, "VALIDATION_ERROR");
    const meta = documentMetaSchema.parse({ docName: form.get("docName"), docType: form.get("docType") });
    const docId = await addDocument(id, meta, await readUpload(file), user.id);
    return NextResponse.json({ id: docId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
