import type { Prisma } from "../../generated/prisma/client.js";
import * as activityLogRepository from "./activity-log.repository.js";

export type RecordActivityInput = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Best-effort audit trail: a failed write must never break the request that is
 * being audited. Never pass tokens, passwords, or raw request bodies here.
 */
export async function recordActivity(input: RecordActivityInput): Promise<void> {
  try {
    await activityLogRepository.insertActivityLog({
      userId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "failed to write activity log",
        action: input.action,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
