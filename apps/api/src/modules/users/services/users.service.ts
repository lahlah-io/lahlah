import { Prisma } from "../../../generated/prisma/client.js";
import { HttpError } from "../../../shared/http/errors.js";
import * as usersRepository from "../repositories/users.repository.js";
import type { createUserSchema, updateUserSchema } from "../schemas/user.schema.js";
import type { z } from "zod";

export const listUsers = usersRepository.findUsers;

export async function getUser(id: string) {
  const user = await usersRepository.findUserById(id);
  if (!user) throw new HttpError(404, "USER_NOT_FOUND", "User not found");
  return user;
}

export async function createUser(input: z.infer<typeof createUserSchema>) {
  try {
    return await usersRepository.insertUser(input);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists");
    }
    throw error;
  }
}

export async function updateUser(id: string, input: z.infer<typeof updateUserSchema>) {
  try {
    return await usersRepository.patchUser(id, input);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") throw new HttpError(404, "USER_NOT_FOUND", "User not found");
      if (error.code === "P2002") throw new HttpError(409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists");
    }
    throw error;
  }
}

export async function deactivateUser(id: string) {
  try {
    return await usersRepository.deactivateUserById(id);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new HttpError(404, "USER_NOT_FOUND", "User not found");
    }
    throw error;
  }
}
