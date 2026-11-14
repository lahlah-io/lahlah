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
  // Pre-check memberi kode konflik yang akurat: `P2002` di dalam transaksi
  // tidak selalu membawa `meta.target`, sehingga service tidak bisa
  // membedakan email vs username duplikat dari error itu saja.
  const [byUsername, byEmail] = await Promise.all([
    usersRepository.findUserByUsername(input.username),
    input.email ? usersRepository.findUserByEmail(input.email) : Promise.resolve(null),
  ]);
  if (byUsername) {
    throw new HttpError(409, "USERNAME_ALREADY_EXISTS", "A user with this username already exists");
  }
  if (byEmail) {
    throw new HttpError(409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists");
  }

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
      // Balapan tulis: constraint DB tetap penjaga akhir.
      const meta = (error.meta as { target?: string[] } | undefined)?.target ?? [];
      const constraintText = `${error.message} ${JSON.stringify(error.meta ?? null)}`;
      const isUsername = meta.includes("username") || constraintText.includes("users_username_key");
      throw new HttpError(
        409,
        isUsername ? "USERNAME_ALREADY_EXISTS" : "EMAIL_ALREADY_EXISTS",
        isUsername
          ? "A user with this username already exists"
          : "A user with this email already exists",
      );
    }
    throw error;
  }
}

export async function updateUser(
  id: string,
  input: z.infer<typeof updateUserSchema>,
  actor: Actor,
) {
  // Pre-check agar kode 409 akurat: `P2002` pada `prisma.user.update()`
  // kadang tanpa `meta.target`, sehingga constraint tidak bisa dibedakan
  // dari error saja.
  if (input.username !== undefined) {
    const byUsername = await usersRepository.findUserByUsername(input.username);
    if (byUsername && byUsername.id !== id) {
      throw new HttpError(409, "USERNAME_ALREADY_EXISTS", "A user with this username already exists");
    }
  }
  if (input.email !== undefined) {
    const byEmail = await usersRepository.findUserByEmail(input.email);
    if (byEmail && byEmail.id !== id) {
      throw new HttpError(409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists");
    }
  }

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
      const meta = (error.meta as { target?: string[] } | undefined)?.target ?? [];
      const constraintText = `${error.message} ${JSON.stringify(error.meta ?? null)}`;
      const isUsername =
        meta.includes("username") || constraintText.includes("users_username_key");
      if (isUsername) {
        return new HttpError(409, "USERNAME_ALREADY_EXISTS", "A user with this username already exists");
      }
      // `prisma.$transaction` tidak selalu membawa `meta.target` untuk P2002,
      // jadi kasus email tanpa target tetap memakai kode email.
      // ponytail: ambil target pasti tanpa query ulang; tambah bila Prisma mengisi meta di transaksi.
      return new HttpError(409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists");
    }
  }
  return error;
}
