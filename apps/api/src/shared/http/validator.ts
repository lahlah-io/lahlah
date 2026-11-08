import { zValidator as zv } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";

export const zValidator = <Schema extends z.ZodSchema, Target extends keyof ValidationTargets>(
  target: Target,
  schema: Schema,
) =>
  zv(target, schema, (result, c) => {
    if (!result.success) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed" } }, 400);
    }
  });
