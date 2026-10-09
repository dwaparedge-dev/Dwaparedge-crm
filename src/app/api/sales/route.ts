import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { listSalesSchema, saleInputSchema } from "@/features/sales/schema";
import { createSale, listSales } from "@/features/sales/service";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    return NextResponse.json(await listSales(listSalesSchema.parse(Object.fromEntries(request.nextUrl.searchParams))));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const id = await createSale(saleInputSchema.parse(await readJson(request)), user.id);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
