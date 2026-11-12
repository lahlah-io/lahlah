import type { ErrorHandler } from "hono";
import { Prisma } from "../../generated/prisma/client.js";
import { ZodError } from "zod";
import { appendLog } from "../logging/file-logger.js";

export type HttpStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 502 | 503 | 504;

export class HttpError extends Error {
  constructor(
    public readonly status: HttpStatus,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorHandler = (error, c) => {
  const sessionId = c.req.path.match(/\/sessions\/([^/]+)/)?.[1] ?? null;
  appendLog(
    "error",
    {
      method: c.req.method,
      path: c.req.path,
      type: error?.constructor?.name ?? "unknown",
      code:
        error instanceof HttpError
          ? error.code
          : error instanceof ZodError
            ? "VALIDATION_ERROR"
            : error instanceof Prisma.PrismaClientKnownRequestError
              ? error.code
              : "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : String(error),
    },
    sessionId,
  );

  if (error instanceof HttpError) {
    return c.json({ error: { code: error.code, message: error.message } }, error.status);
  }
  if (error instanceof ZodError) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed" } }, 400);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return c.json({ error: { code: "CONFLICT", message: "Resource already exists" } }, 409);
  }

  console.error(error);
  return c.json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }, 500);
};
