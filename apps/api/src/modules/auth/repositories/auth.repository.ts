import type { Prisma } from "../../../generated/prisma/client.js";
import type { Role } from "../../../generated/prisma/enums.js";
import { prisma } from "../../../db/client.js";

export const authUserSelect = {
  id: true,
  pid: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
} satisfies Prisma.UserSelect;

export type AuthUserRecord = Prisma.UserGetPayload<{ select: typeof authUserSelect }>;

export function findUserByPid(pid: string): Promise<AuthUserRecord | null> {
  return prisma.user.findUnique({ where: { pid }, select: authUserSelect });
}

export function findUserByEmail(email: string): Promise<AuthUserRecord | null> {
  return prisma.user.findUnique({ where: { email }, select: authUserSelect });
}

export function insertUser(data: {
  pid: string;
  name: string;
  email: string | null;
  role: Role;
}): Promise<AuthUserRecord> {
  return prisma.user.create({ data, select: authUserSelect });
}

export function updateIdentity(
  id: string,
  data: { pid?: string; name?: string; email?: string | null; role?: Role },
): Promise<AuthUserRecord> {
  return prisma.user.update({ where: { id }, data, select: authUserSelect });
}
