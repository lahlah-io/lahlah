import { randomUUID } from "node:crypto";
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
type Entry = DraftInput & { draftId: string; expiresAt: number };

export interface DraftStore {
  saveDraft(input: DraftInput): string;
  getDraft(input: { draftId: string; userId: string; sessionId: string }): ItineraryDraftResponse;
  replaceSessionDraft(input: DraftInput): string;
}

function cloneDraft<T>(value: T): T {
  return structuredClone(value);
}

export function createDraftStore(input: { ttlSeconds?: number; now?: () => number } = {}): DraftStore {
  const ttlMs = (input.ttlSeconds ?? env.DRAFT_TTL_SECONDS) * 1000;
  const now = input.now ?? Date.now;
  const byId = new Map<string, Entry>();
  const activeBySession = new Map<string, string>();

  const sessionKey = (userId: string, sessionId: string) => `${userId}\0${sessionId}`;

  function purgeExpired(at: number) {
    for (const [id, entry] of byId) {
      if (entry.expiresAt > at) continue;
      byId.delete(id);
      const sk = sessionKey(entry.userId, entry.sessionId);
      if (activeBySession.get(sk) === id) activeBySession.delete(sk);
    }
  }

  function put(entryInput: DraftInput, at: number) {
    purgeExpired(at);
    const draftId = randomUUID();
    const itinerary = cloneDraft(entryInput.itinerary);
    itinerary.draftId = draftId;
    const entry: Entry = {
      ...entryInput,
      itinerary,
      draftId,
      expiresAt: at + ttlMs,
    };
    byId.set(draftId, entry);
    activeBySession.set(sessionKey(entryInput.userId, entryInput.sessionId), draftId);
    return draftId;
  }

  return {
    saveDraft(draftInput) {
      return put(draftInput, now());
    },
    replaceSessionDraft(draftInput) {
      const at = now();
      purgeExpired(at);
      const sk = sessionKey(draftInput.userId, draftInput.sessionId);
      const prev = activeBySession.get(sk);
      if (prev) byId.delete(prev);
      return put(draftInput, at);
    },
    getDraft({ draftId, userId, sessionId }) {
      const at = now();
      purgeExpired(at);
      const entry = byId.get(draftId);
      if (!entry) throw new HttpError(404, "DRAFT_NOT_FOUND", "Draft not found or expired");
      if (entry.userId !== userId || entry.sessionId !== sessionId) {
        throw new HttpError(403, "FORBIDDEN", "Draft access denied");
      }
      if (entry.expiresAt <= at) {
        byId.delete(draftId);
        throw new HttpError(404, "DRAFT_EXPIRED", "Draft expired");
      }
      return cloneDraft(entry.itinerary);
    },
  };
}

const defaultStore = createDraftStore();

export function saveDraft(input: DraftInput): string {
  return defaultStore.saveDraft(input);
}

export function getDraft(input: { draftId: string; userId: string; sessionId: string }): ItineraryDraftResponse {
  return defaultStore.getDraft(input);
}

export function replaceSessionDraft(input: DraftInput): string {
  return defaultStore.replaceSessionDraft(input);
}
