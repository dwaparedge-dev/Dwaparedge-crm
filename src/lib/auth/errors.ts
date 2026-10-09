export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
}
export const unauthorized = (msg = "Authentication required") => new AppError(msg, 401, "UNAUTHORIZED");
export const tooMany = (msg = "Too many attempts. Try again later.") => new AppError(msg, 429, "RATE_LIMITED");
