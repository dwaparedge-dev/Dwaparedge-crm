import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { listProductsSchema, productInputSchema } from "@/features/products/schema";
import { createProduct, listProducts } from "@/features/products/service";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    return NextResponse.json(await listProducts(listProductsSchema.parse(Object.fromEntries(request.nextUrl.searchParams))));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const id = await createProduct(productInputSchema.parse(await readJson(request)), user.id);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
