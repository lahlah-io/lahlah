import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";

export async function recordActivityLog(
  client: Prisma.TransactionClient | typeof prisma,
  input: {
    userId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  return client.activityLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? {},
    },
  });
}