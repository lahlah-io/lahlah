import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/db/client.js";
import { ensureTripForSessionTx, findTripMembership, checkUserTripAccess } from "../../src/modules/itinerary/repositories/trip.repository.js";

const createdUserIds: string[] = [];

async function seedUser() {
  const user = await prisma.user.create({
    data: { name: "Membership Test", username: `u-${randomUUID()}`, email: `membership-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  return user;
}

afterAll(async () => {
  for (const userId of createdUserIds) {
    await prisma.trip.deleteMany({ where: { members: { some: { userId } } } });
    await prisma.chatSession.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
});

test("ensureTripForSessionTx creates trip and membership idempotently", async () => {
  const user = await seedUser();
  const model = await prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: "test", modelIdentifier: "trip-member" } },
    update: {},
    create: { provider: "test", modelIdentifier: "trip-member", name: "trip-member", isActive: true },
    select: { id: true },
  });
  const session = await prisma.chatSession.create({
    data: { userId: user.id, modelId: model.id, title: "Session A" },
    select: { id: true },
  });

  const trip1 = await prisma.$transaction(async (tx) =>
    ensureTripForSessionTx(tx, { sessionId: session.id, userId: user.id, title: "Trip Padang" }),
  );
  assert.ok(trip1?.id);

  const trip2 = await prisma.$transaction(async (tx) =>
    ensureTripForSessionTx(tx, { sessionId: session.id, userId: user.id, title: "Trip Padang" }),
  );
  assert.equal(trip2?.id, trip1?.id);

  const membership = await findTripMembership(user.id, trip1!.id);
  assert.equal(membership?.role, "owner");
});

test("checkUserTripAccess validates access via membership", async () => {
  const owner = await seedUser();
  const stranger = await seedUser();
  const model = await prisma.model.findFirstOrThrow({ select: { id: true } });
  const session = await prisma.chatSession.create({
    data: { userId: owner.id, modelId: model.id, title: "Session B" },
    select: { id: true },
  });
  const trip = await prisma.$transaction(async (tx) =>
    ensureTripForSessionTx(tx, { sessionId: session.id, userId: owner.id, title: "Access Trip" }),
  );

  assert.equal(await checkUserTripAccess(owner.id, trip!.id), true);
  assert.equal(await checkUserTripAccess(stranger.id, trip!.id), false);
});
