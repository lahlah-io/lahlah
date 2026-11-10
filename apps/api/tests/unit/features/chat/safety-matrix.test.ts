import { afterAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../../../src/db/client.js";
import { createToolExecutor } from "../../../../src/modules/chat/services/tools.js";
import { generateItinerary } from "../../../../src/modules/chat/services/itinerary-generator.js";
import { createDraftStore } from "../../../../src/modules/chat/services/draft-store.js";
import { HttpError } from "../../../../src/shared/http/errors.js";

const padangRow = {
  id: "6b4c9a63-0f4a-4f5e-9e4e-2a9f0f7f1a11",
  name: "Pantai Padang",
  city: "Padang",
  isActive: true,
  latitude: -0.95,
  longitude: 100.35,
  details: { estimated_duration_minutes: 60 },
  categories: [],
};

function executor(rows: unknown[]) {
  return createToolExecutor({
    searchDestinations: async () => rows,
    getDestinationDetails: async () => rows,
  });
}

function expectHttpError(fn: () => unknown, status: number, code: string) {
  try {
    fn();
    throw new Error("expected HttpError");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(status);
    expect((error as HttpError).code).toBe(code);
  }
}

describe("safety and security matrix", () => {
  test("SAF-002: tool results drop inactive, non-Padang, and malformed rows", async () => {
    const exec = executor([
      padangRow,
      { ...padangRow, id: "other-city", city: "Bukittinggi" },
      { ...padangRow, id: "inactive", isActive: false },
      { id: "missing-fields" },
      null,
    ]);
    const rows = (await exec("search_destinations", {})) as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).toEqual([padangRow.id]);
  });

  test("SAF-002: unknown destination ids produce an empty result, never a fabricated one", async () => {
    const exec = createToolExecutor({
      searchDestinations: async () => [],
      getDestinationDetails: async () => [],
    });
    const rows = await exec("get_destination_details", { destinationId: "00000000-0000-4000-8000-000000000000" });
    expect(rows).toEqual([]);
  });

  test("SAF-002: unknown tool names and category slugs are rejected", async () => {
    await expect(executor([])("delete_everything", {})).rejects.toMatchObject({ status: 422, code: "TOOL_UNKNOWN" });
    await expect(executor([])("search_destinations", { categories: ["bali"] })).rejects.toMatchObject({
      status: 422,
      code: "TOOL_ARGS_INVALID",
    });
  });

  test("SAF-003: user-supplied coordinates are ignored; candidate coordinates win", () => {
    const request = {
      city: "Padang",
      travelDate: "2026-11-20",
      startTime: "09:00",
      endTime: "12:00",
      categories: ["seed-pantai"],
      transportMode: "walk",
      latitude: 51.5,
      longitude: -0.12,
    };
    const result = generateItinerary(request, [
      { id: "a", name: "A", latitude: -0.95, longitude: 100.35, details: { estimated_duration_minutes: 30 } },
      { id: "b", name: "B", latitude: -0.94, longitude: 100.36, details: { estimated_duration_minutes: 30 } },
    ]);
    expect([result.destinations[0]!.latitude, result.destinations[0]!.longitude]).toEqual([-0.95, 100.35]);
    expect(result.route!.coordinates[0]).toEqual([100.35, -0.95]);
  });

  test("SAF-005: negative or malformed start time is rejected", () => {
    const base = { city: "Padang", travelDate: "2026-11-20", categories: [], transportMode: "walk" };
    expectHttpError(
      () => generateItinerary({ ...base, startTime: "-1:00", endTime: "12:00" }, []),
      422,
      "ITINERARY_REQUEST_INVALID",
    );
    expectHttpError(
      () => generateItinerary({ ...base, startTime: "25:00", endTime: "26:00" }, []),
      422,
      "ITINERARY_REQUEST_INVALID",
    );
  });

  test("SAF-006: end time earlier than or equal to start time is rejected", () => {
    const base = { city: "Padang", travelDate: "2026-11-20", categories: [], transportMode: "walk" };
    expectHttpError(
      () => generateItinerary({ ...base, startTime: "17:00", endTime: "10:00" }, []),
      422,
      "ITINERARY_REQUEST_INVALID",
    );
    expectHttpError(
      () => generateItinerary({ ...base, startTime: "10:00", endTime: "10:00" }, []),
      422,
      "ITINERARY_REQUEST_INVALID",
    );
    expectHttpError(
      () => generateItinerary({ ...base, startTime: "10:00", endTime: "12:00", travelDate: "2026-02-30" }, []),
      422,
      "ITINERARY_REQUEST_INVALID",
    );
  });

  test("SAF-008: 20 destinations in one hour cannot all be scheduled", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: String(i).padStart(2, "0"),
      name: `Dest ${i}`,
      latitude: -0.95,
      longitude: 100.35,
      details: { estimated_duration_minutes: 60 },
    }));
    const result = generateItinerary(
      { city: "Padang", travelDate: "2026-11-20", startTime: "09:00", endTime: "10:00", categories: [], transportMode: "walk" },
      many,
    );
    expect(result.destinations).toHaveLength(1);
  });

  test("SAF-010: drafts are bound to user and session, and expire", async () => {
    const userA = await prisma.user.create({ data: { name: "saf-a", email: `saf-a-${randomUUID()}@example.test` }, select: { id: true } });
    const userB = await prisma.user.create({ data: { name: "saf-b", email: `saf-b-${randomUUID()}@example.test` }, select: { id: true } });
    const model = await prisma.model.upsert({
      where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "safety-matrix" } },
      update: {},
      create: { provider: "test", modelIdentifier: "safety-matrix", name: "safety-matrix", isActive: true },
      select: { id: true },
    });
    const sessionA = await prisma.chatSession.create({ data: { userId: userA.id, modelId: model.id, title: "saf-a" }, select: { id: true } });
    const sessionB = await prisma.chatSession.create({ data: { userId: userA.id, modelId: model.id, title: "saf-b" }, select: { id: true } });
    let now = 1_000;
    const store = createDraftStore({ ttlSeconds: 60, now: () => now });
    try {
      const draftId = await store.saveDraft({
        userId: userA.id,
        sessionId: sessionA.id,
        itinerary: {
          draftId: "pending",
          status: "pending_confirmation",
          travelDate: "2026-11-20",
          startTime: "09:00",
          endTime: "15:00",
          destinations: [],
          route: null,
        },
      });

      expect((await store.getDraft({ draftId, userId: userA.id, sessionId: sessionA.id })).draftId).toBe(draftId);
      await expect(store.getDraft({ draftId, userId: userB.id, sessionId: sessionA.id })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
      await expect(store.getDraft({ draftId, userId: userA.id, sessionId: sessionB.id })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });

      now += 61_000;
      await expect(store.getDraft({ draftId, userId: userA.id, sessionId: sessionA.id })).rejects.toMatchObject({ status: 404, code: "DRAFT_NOT_FOUND" });
    } finally {
      await prisma.itineraryDraft.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
      await prisma.chatSession.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
      await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    }
  });
});
