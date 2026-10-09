import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/lib/auth/errors";

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    const extra = "duplicates" in error ? { duplicates: (error as { duplicates: unknown }).duplicates } : {};
    return NextResponse.json({ error: { code: error.code, message: error.message, ...extra } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input", issues: error.issues.map((i) => ({ path: i.path, message: i.message })) } },
      { status: 422 },
    );
  }
  // Our own integrity triggers raise check_violation with a human-readable message (e.g. over-allocation
  // that slipped past a service check). Surface it as a conflict instead of a 500.
  if ((error as { code?: string }).code === "23514" && typeof (error as Error).message === "string") {
    return NextResponse.json({ error: { code: "CONSTRAINT_VIOLATION", message: (error as Error).message } }, { status: 409 });
  }
  console.error(error);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong" } }, { status: 500 });
}

/** CSRF defence for cookie-authenticated mutations: require same-origin + JSON body. */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    throw new AppError("Cross-origin request blocked", 403, "CSRF");
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new AppError("Content-Type must be application/json", 415, "UNSUPPORTED_MEDIA_TYPE");
  }
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Parses a JSON body, turning malformed JSON into a 400 instead of a 500. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("Request body must be valid JSON", 400, "BAD_REQUEST");
  }
}
