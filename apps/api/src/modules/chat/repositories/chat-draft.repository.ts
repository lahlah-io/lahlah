import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";

const draftSelect = {
  id: true,
  payload: true,
} satisfies Prisma.ItineraryDraftSelect;

function toResult(row: { id: string; payload: Prisma.JsonValue }) {
  return { draftId: row.id, payload: row.payload };
}

export async function upsertActiveDraft(input: { sessionId: string; userId: string; payload: unknown }) {
  const row = await prisma.itineraryDraft.upsert({
    where: { sessionId: input.sessionId },
    update: { payload: input.payload as Prisma.InputJsonValue, userId: input.userId },
    create: {
      sessionId: input.sessionId,
      userId: input.userId,
      payload: input.payload as Prisma.InputJsonValue,
      status: "pending_confirmation",
    },
    select: draftSelect,
  });
  return toResult(row);
}

export async function getActiveDraft(input: { sessionId: string; userId: string; draftId?: string }) {
  const row = await prisma.itineraryDraft.findUnique({
    where: { sessionId: input.sessionId },
    select: { ...draftSelect, userId: true, sessionId: true },
  });
  if (!row) return null;
  if (row.userId !== input.userId || row.sessionId !== input.sessionId) return null;
  if (input.draftId != null && row.id !== input.draftId) return null;
  return toResult(row);
}

export async function deleteActiveDraft(sessionId: string): Promise<void> {
  await prisma.itineraryDraft.deleteMany({ where: { sessionId } });
}
