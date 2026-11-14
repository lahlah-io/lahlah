import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/client.js";

export const authUserSelect = {
  id: true,
  pid: true,
  name: true,
  username: true,
  email: true,
  bio: true,
  avatarUrl: true,
  role: true,
  isActive: true,
} satisfies Prisma.UserSelect;

export type AuthUserRecord = Prisma.UserGetPayload<{ select: typeof authUserSelect }>;

export function createSessionRecord(data: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ip?: string | null;
}) {
  return prisma.session.create({ data, select: { id: true } });
}

export function findSessionByTokenHash(tokenHash: string) {
  return prisma.session.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: authUserSelect },
    },
  });
}

export function revokeSessionByTokenHash(tokenHash: string) {
  return prisma.session.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
