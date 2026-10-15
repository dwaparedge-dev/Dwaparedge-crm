import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { documentMetaSchema } from "@/features/clients/schema";
import { deleteDocument, getDocumentFile, updateDocument } from "@/features/clients/documents";

type Ctx = RouteContext<"/api/clients/[id]/documents/[docId]">;
const ids = async (ctx: Ctx) => {
  const p = await ctx.params;
  return { clientId: uuid.parse(p.id), docId: uuid.parse(p.docId) };
};

/** PDFs and images open in the browser; `?download=1` (and every other type) saves the file. */
export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
    const { clientId, docId } = await ids(ctx);
    const file = await getDocumentFile(clientId, docId);
    const inline = request.nextUrl.searchParams.get("download") !== "1" && /^(application\/pdf|image\/)/.test(file.mime_type);
    const ascii = file.file_name.replace(/[^A-Za-z0-9._-]+/g, "_");
    return new NextResponse(new Uint8Array(file.content), {
      headers: {
        "Content-Type": file.mime_type,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { clientId, docId } = await ids(ctx);
    await updateDocument(clientId, docId, documentMetaSchema.parse(await readJson(request)), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { clientId, docId } = await ids(ctx);
    await deleteDocument(clientId, docId, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
