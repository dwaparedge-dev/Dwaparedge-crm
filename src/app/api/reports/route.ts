import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { REPORTS } from "@/features/reports/definitions";

/** Report catalogue (metadata only: titles, filters, columns). The `run` functions never leave the server. */
export async function GET(request: NextRequest) {
  try {
    void request.nextUrl;
    await requireUser();
    return NextResponse.json({
      items: REPORTS.map(({ key, title, description, definition, filters, dateLabel, requiresClient, statusOptions, columns, defaultSort, defaultDir, sorts }) => ({
        key, title, description, definition, filters, dateLabel, requiresClient: Boolean(requiresClient), statusOptions: statusOptions ?? [], columns, defaultSort, defaultDir, sortable: Object.keys(sorts),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
