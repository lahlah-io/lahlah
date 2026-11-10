import { z } from "zod";
import { paginationQuerySchema } from "../../../shared/schemas/pagination.schema.js";

const id = z.uuid();
const userId = z.string().trim().min(1).max(255);

export const createSessionSchema = z.object({
  userId,
  title: z.string().trim().min(1).max(255).optional(),
});

export const sessionIdParamSchema = z.object({ id });

export const listSessionsQuerySchema = paginationQuerySchema.extend({ userId });
export const listMessagesQuerySchema = paginationQuerySchema.extend({ userId });

export const getSessionQuerySchema = z.object({ userId });
export const deleteSessionQuerySchema = z.object({ userId });

export const updateSessionSchema = z
  .object({
    userId,
    title: z.string().trim().min(1).max(255).optional(),
    summary: z.string().trim().max(4000).nullable().optional(),
    status: z.string().trim().min(1).max(64).optional(),
  })
  .refine((v) => v.title !== undefined || v.summary !== undefined || v.status !== undefined, {
    message: "at least one field required",
  });

export const sendMessageSchema = z.object({
  userId,
  content: z.string().trim().min(1).max(4000),
});
