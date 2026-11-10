import { randomUUID } from "node:crypto";
import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";
import { env } from "../../../env.js";
import { HttpError } from "../../../shared/http/errors.js";

export type ItineraryDraftResponse = {
  draftId: string;
  status: "pending_confirmation";
  travelDate: string;
  startTime: string;
  endTime: string;
  destinations: Array<{
    order: number;
    destinationId: string;
    name: string;
    latitude: number;
    longitude: number;
    visitAt: string;
    durationMinutes: number;
  }>;
  route: {
    type: "LineString";
    coordinates: [longitude: number, latitude: number][];
  } | null;
};

type DraftInput = { userId: string; sessionId: string; itinerary: ItineraryDraftResponse };

export interface DraftStore {
  saveDraft(input: DraftInput): Promise<string> | string;
  getDraft(input: { draftId: string; userId: string; sessionId: string }): Promise<ItineraryDraftResponse> | ItineraryDraftResponse;
  replaceSessionDraft(input: DraftInput): Promise<string> | string;
}

function cloneDraft<T>(value: T): T {
  return structuredClone(value);
}

function toPayload(itinerary: ItineraryDraftResponse) {
  const clone = cloneDraft(itinerary);
  return clone as unknown as Prisma.InputJsonValue;
}

function fromPayload(payload: Prisma.JsonValue): ItineraryDraftResponse {
  const clone = cloneDraft(payload as ItineraryDraftResponse);
  return clone;
}

export function createDraftStore(input: { ttlSeconds?: number; now?: () => number } = {}): DraftStore {
  const ttlSeconds = input.ttlSeconds ?? env.DRAFT_TTL_SECONDS;
  const now = input.now ?? Date.now;

  async function saveDraft(draftInput: DraftInput): Promise<string> {
    return replaceSessionDraft(draftInput);
  }

  async function replaceSessionDraft(draftInput: DraftInput): Promise<string> {
    const at = now();
    const expiresAt = new Date(at + ttlSeconds * 1000);
    const draftId = randomUUID();
    const itinerary = cloneDraft(draftInput.itinerary);
    itinerary.draftId = draftId;
    const payload = toPayload(itinerary);

    await prisma.$transaction(async (tx) => {
      await tx.itineraryDraft.deleteMany({ where: { sessionId: draftInput.sessionId } });
      await tx.itineraryDraft.create({
        data: {
          id: draftId,
          sessionId: draftInput.sessionId,
          userId: draftInput.userId,
          payload,
          status: "pending_confirmation",
          expiresAt,
        },
      });
    });
    return draftId;
  }

  async function getDraft({ draftId, userId, sessionId }: { draftId: string; userId: string; sessionId: string }): Promise<ItineraryDraftResponse> {
    const at = now();
    const row = await prisma.itineraryDraft.findUnique({
      where: { id: draftId },
      select: { id: true, userId: true, sessionId: true, payload: true, expiresAt: true },
    });
    if (!row) throw new HttpError(404, "DRAFT_NOT_FOUND", "Draft not found or expired");
    if (row.expiresAt && row.expiresAt.getTime() <= at) {
      await prisma.itineraryDraft.deleteMany({ where: { id: draftId } });
      throw new HttpError(404, "DRAFT_EXPIRED", "Draft expired");
    }
    if (row.userId !== userId || row.sessionId !== sessionId) {
      throw new HttpError(403, "FORBIDDEN", "Draft access denied");
    }
    const draft = fromPayload(row.payload);
    draft.draftId = row.id;
    return cloneDraft(draft);
  }

  return {
    saveDraft,
    replaceSessionDraft,
    getDraft,
  };
}

const defaultStore = createDraftStore();

export async function saveDraft(input: DraftInput): Promise<string> {
  return defaultStore.saveDraft(input);
}

export async function getDraft(input: { draftId: string; userId: string; sessionId: string }): Promise<ItineraryDraftResponse> {
  return defaultStore.getDraft(input);
}

export async function replaceSessionDraft(input: DraftInput): Promise<string> {
  return defaultStore.replaceSessionDraft(input);
}
