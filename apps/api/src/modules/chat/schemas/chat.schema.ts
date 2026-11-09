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

export const sendMessageSchema = z.object({
  userId,
  content: z.string().trim().min(1).max(4000),
});
