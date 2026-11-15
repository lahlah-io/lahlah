import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, test } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/client.js";
import { createSession } from "../../src/shared/auth/session.service.js";

const createdUserIds: string[] = [];
const createdDestinationIds: string[] = [];

type SeedStop = { name: string; distance?: number };

async function seedUser(name: string) {
  const user = await prisma.user.create({
    data: {
      name,
      username: `mine-${randomUUID()}`,
      email: `mine-${randomUUID()}@example.test`,
    },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  return user;
}

async function seedTrip(userId: string, stops: SeedStop[], isPublic: boolean) {
  const destinationIds: string[] = [];
  for (const stop of stops) {
    const destination = await prisma.destination.create({
      data: {
        name: stop.name,
        city: "Padang",
        source: "manual",
        latitude: -0.9471,
        longitude: 100.4172,
      },
      select: { id: true },
    });
    destinationIds.push(destination.id);
    createdDestinationIds.push(destination.id);
  }

  const trip = await prisma.trip.create({
    data: {
      title: `Mine Trip ${randomUUID()}`,
      isPublic,
      members: { create: { userId } },
    },
    select: { id: true },
  });
  await prisma.tripDestination.createMany({
    data: destinationIds.map((destinationId, index) => ({
      tripId: trip.id,
      destinationId,
      distance: stops[index]?.distance ?? null,
    })),
  });
  return { tripId: trip.id, destinationIds };
}

type MineBody = {
  data: Array<{
    id: string;
    title: string;
    stopCount: number;
    destinationNames: string[];
    likeCount: number;
    viewCount: number;
    likedByMe: boolean;
    waypoints: Array<[number, number]>;
    distanceM: number | null;
  }>;
  meta: { totalTrips: number; totalLikes: number; totalDistanceM: number | null };
};

function getMine(token: string | null) {
  return app.request("/api/v1/itineraries/mine", {
    headers: token ? { cookie: `lahlah_session=${token}` } : {},
  });
}

afterAll(async () => {
  for (const userId of createdUserIds) {
    await prisma.trip.deleteMany({ where: { members: { some: { userId } } } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
  for (const id of createdDestinationIds) {
    await prisma.destination.delete({ where: { id } }).catch(() => undefined);
  }
});

test("mine requires a session", async () => {
  const response = await getMine(null);
  assert.equal(response.status, 401);
});

test("mine lists only the caller's trips with stats and road distance", async () => {
  const owner = await seedUser("Mine Owner");
  const other = await seedUser("Mine Other");
  const session = await createSession(owner.id, { userAgent: "my-trips-test" });

  const privateTrip = await seedTrip(
    owner.id,
    [{ name: "Pantai Air Manis" }, { name: "Jembatan Sitti Nurbaya", distance: 1200 }],
    false,
  );
  const publicTrip = await seedTrip(
    owner.id,
    [
      { name: "Pantai Padang" },
      { name: "Pulau Pasumpahan", distance: 800 },
      { name: "Pantai Carolina", distance: 700 },
    ],
    true,
  );
  const foreign = await seedTrip(other.id, [{ name: "Rahasia" }], true);

  await prisma.tripLike.create({ data: { userId: other.id, tripId: privateTrip.tripId } });

  const response = await getMine(session.token);
  assert.equal(response.status, 200);
  const body = (await response.json()) as MineBody;

  const ids = body.data.map((card) => card.id);
  assert.ok(ids.includes(privateTrip.tripId), "own private trip must be listed");
  assert.ok(ids.includes(publicTrip.tripId), "own public trip must be listed");
  assert.ok(!ids.includes(foreign.tripId), "another user's trip leaked into /mine");

  const privateCard = body.data.find((card) => card.id === privateTrip.tripId);
  assert.ok(privateCard);
  assert.equal(privateCard.stopCount, 2);
  assert.deepEqual(privateCard.destinationNames, ["Pantai Air Manis", "Jembatan Sitti Nurbaya"]);
  assert.equal(privateCard.distanceM, 1200);
  assert.equal(privateCard.likeCount, 1);
  assert.deepEqual(privateCard.waypoints, [
    [100.4172, -0.9471],
    [100.4172, -0.9471],
  ]);

  const publicCard = body.data.find((card) => card.id === publicTrip.tripId);
  assert.ok(publicCard);
  assert.equal(publicCard.distanceM, 1500);

  assert.equal(body.meta.totalTrips, 2);
  assert.equal(body.meta.totalLikes, 1);
  assert.equal(body.meta.totalDistanceM, 2700);
});
