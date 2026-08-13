export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class DispatchError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DispatchError";
  }
}

export function safeError(error: unknown): DispatchError {
  if (error instanceof DispatchError) return error;
  return new DispatchError(
    500,
    "INTERNAL_ERROR",
    "The request could not be completed. Please try again.",
  );
}
