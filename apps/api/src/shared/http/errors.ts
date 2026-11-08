import type { ErrorHandler } from "hono";
import { Prisma } from "../../generated/prisma/client.js";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorHandler = (error, c) => {
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
