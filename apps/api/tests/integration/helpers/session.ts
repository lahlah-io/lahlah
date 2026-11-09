import { randomUUID } from "node:crypto";
import { prisma } from "../../../src/db/client.js";
import { env } from "../../../src/env.js";
import type { Role } from "../../../src/generated/prisma/enums.js";
import { hashToken, randomToken } from "../../../src/shared/auth/tokens.js";
import { ensureFreeSubscription } from "../../../src/shared/billing/subscription.service.js";

export type TestSession = {
  user: { id: string; name: string; email: string | null; role: Role; isActive: boolean };
  token: string;
  headers: { authorization: string; "content-type": string };
};

export async function createTestSession(options: { role?: Role; isActive?: boolean } = {}): Promise<TestSession> {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      name: `Test ${suffix.slice(0, 8)}`,
      email: `test-${suffix}@example.test`,
      role: options.role ?? "user",
      isActive: options.isActive ?? true,
    },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  const token = randomToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token, env.SESSION_TOKEN_PEPPER),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  await ensureFreeSubscription(user.id);

  return {
    user,
    token,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  };
}

/**
 * Removes only rows created by tests for the given user id.
 */
export async function deleteTestUser(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.activityLog.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.userSubscription.deleteMany({ where: { userId } });
    await tx.chatMessage.deleteMany({ where: { session: { userId } } });
    await tx.chatSession.deleteMany({ where: { userId } });
    await tx.itinerary.deleteMany({ where: { userId } });
    await tx.user.deleteMany({ where: { id: userId } });
  });
}
