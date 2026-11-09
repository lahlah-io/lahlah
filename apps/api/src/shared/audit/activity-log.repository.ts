import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../db/client.js";

export type ActivityLogInput = {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Prisma.InputJsonValue;
};

export function insertActivityLog(input: ActivityLogInput) {
  return prisma.activityLog.create({ data: input, select: { id: true } });
}
