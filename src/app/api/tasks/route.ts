import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { createTaskSchema, listTasksSchema } from "@/features/tasks/schema";
import { createTask, listTasks } from "@/features/tasks/service";

/** The caller's own tasks; `scope=all` needs `tasks.view_all` (the service checks). */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const params = listTasksSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return NextResponse.json(await listTasks(params, user));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Status, origin, source and creator are not in the schema, so a caller cannot set them. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = createTaskSchema.parse(await readJson(request));
    return NextResponse.json(await createTask(input, user), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
