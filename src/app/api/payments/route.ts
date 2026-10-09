import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { listPaymentsSchema, paymentInputSchema } from "@/features/payments/schema";
import { listPayments, recordPayment } from "@/features/payments/service";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    return NextResponse.json(await listPayments(listPaymentsSchema.parse(Object.fromEntries(request.nextUrl.searchParams))));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const result = await recordPayment(paymentInputSchema.parse(await readJson(request)), user.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
