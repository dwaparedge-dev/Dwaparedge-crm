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

/** CSRF defence for cookie-authenticated mutations: require same-origin + JSON body (`multipart` for file uploads). */
export function assertSameOrigin(request: Request, opts: { multipart?: boolean } = {}) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    throw new AppError("Cross-origin request blocked", 403, "CSRF");
  }
  const wanted = opts.multipart ? "multipart/form-data" : "application/json";
  if (!request.headers.get("content-type")?.includes(wanted)) {
    throw new AppError(`Content-Type must be ${wanted}`, 415, "UNSUPPORTED_MEDIA_TYPE");
  }
}

/** The caller's address. On Vercel the platform sets these headers itself; a client-supplied value is overwritten. */
export function clientIp(request: Request): string {
  const h = request.headers;
  return h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export const userAgent = (request: Request) => (request.headers.get("user-agent") ?? "").slice(0, 300);

/** Parses a JSON body, turning malformed JSON into a 400 instead of a 500. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("Request body must be valid JSON", 400, "BAD_REQUEST");
  }
}

/** For callers outside the app (no session, no Origin): requires a JSON body and refuses one over `maxChars` before parsing. */
export async function readJsonLimited(request: Request, maxChars: number): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new AppError("Content-Type must be application/json", 415, "UNSUPPORTED_MEDIA_TYPE");
  }
  const tooLarge = () => new AppError("Request body is too large", 413, "PAYLOAD_TOO_LARGE");
  if (Number(request.headers.get("content-length") ?? 0) > maxChars) throw tooLarge();
  const text = await request.text();
  if (text.length > maxChars) throw tooLarge();
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("Request body must be valid JSON", 400, "BAD_REQUEST");
  }
}
