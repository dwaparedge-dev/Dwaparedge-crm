import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { exportReportCsv, reportQuerySchema, runReport } from "@/features/reports/service";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/reports/[key]">) {
  try {
    await requireUser();
    const { key } = await ctx.params;
    const q = reportQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    if (q.format === "csv") {
      const { filename, body } = await exportReportCsv(key, q);
      return new NextResponse(body, {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" },
      });
    }
    return NextResponse.json(await runReport(key, q));
  } catch (error) {
    return errorResponse(error);
  }
}
