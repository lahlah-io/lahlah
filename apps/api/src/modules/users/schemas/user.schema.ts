import { z } from "zod";
import { paginationQuerySchema } from "../../../shared/schemas/pagination.schema.js";

const name = z.string().trim().min(1).max(255);
const email = z.email().max(255).transform((value) => value.toLowerCase());
const role = z.enum(["user", "admin"]);

export const createUserSchema = z.object({
  name,
  email,
  role: role.default("user"),
});

export const updateUserSchema = z
  .object({ name, email })
  .partial()
  .refine((data) => Object.keys(data).length > 0, "At least one field is required");

export const updateUserRoleSchema = z.object({ role });

export const updateUserStatusSchema = z.object({ isActive: z.boolean() });

export const listUsersQuerySchema = paginationQuerySchema.extend({
  isActive: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  role: role.optional(),
  q: z.string().trim().min(1).max(255).optional(),
});

export const userIdSchema = z.object({ id: z.uuid() });
