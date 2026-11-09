import { Prisma } from "../../../generated/prisma/client.js";
import type { Role } from "../../../generated/prisma/enums.js";
import { recordActivity } from "../../../shared/audit/activity-log.js";
import { HttpError } from "../../../shared/http/errors.js";
import * as usersRepository from "../repositories/users.repository.js";
import type { createUserSchema, updateUserSchema } from "../schemas/user.schema.js";
import type { z } from "zod";

export type Actor = { id: string };

export const listUsers = usersRepository.findUsers;

export async function getUser(id: string) {
  const user = await usersRepository.findUserById(id);
  if (!user) throw new HttpError(404, "USER_NOT_FOUND", "User not found");
  return user;
}

export async function createUser(input: z.infer<typeof createUserSchema>, actor: Actor) {
  try {
    const user = await usersRepository.insertUserWithFreeSubscription(input);
    await recordActivity({
      actorId: actor.id,
      action: "user.created",
      entityType: "user",
      entityId: user.id,
      metadata: { role: user.role },
    });
    return user;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists");
    }
    throw error;
  }
}

export async function updateUser(
  id: string,
  input: z.infer<typeof updateUserSchema>,
  actor: Actor,
) {
  try {
    const user = await usersRepository.patchUser(id, input);
    await recordActivity({
      actorId: actor.id,
      action: "user.updated",
      entityType: "user",
      entityId: user.id,
      metadata: { fields: Object.keys(input) },
    });
    return user;
  } catch (error) {
    throw mapUserWriteError(error);
  }
}

export async function changeUserRole(id: string, role: Role, actor: Actor) {
  if (id === actor.id && role !== "admin") {
    throw new HttpError(409, "CANNOT_MODIFY_SELF", "You cannot change your own role");
  }

  try {
    const user = await usersRepository.patchUserRole(id, role);
    await recordActivity({
      actorId: actor.id,
      action: "user.role_changed",
      entityType: "user",
      entityId: user.id,
      metadata: { role },
    });
    return user;
  } catch (error) {
    throw mapUserWriteError(error);
  }
}

export async function changeUserStatus(id: string, isActive: boolean, actor: Actor) {
  if (id === actor.id && !isActive) {
    throw new HttpError(409, "CANNOT_MODIFY_SELF", "You cannot deactivate your own account");
  }

  try {
    const user = await usersRepository.patchUserStatus(id, isActive);
    await recordActivity({
      actorId: actor.id,
      action: isActive ? "user.activated" : "user.deactivated",
      entityType: "user",
      entityId: user.id,
      metadata: { isActive },
    });
    return user;
  } catch (error) {
    throw mapUserWriteError(error);
  }
}

export function deactivateUser(id: string, actor: Actor) {
  return changeUserStatus(id, false, actor);
}

function mapUserWriteError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") return new HttpError(404, "USER_NOT_FOUND", "User not found");
    if (error.code === "P2002") {
      return new HttpError(409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists");
    }
  }
  return error;
}
