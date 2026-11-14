import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, test } from "vitest";
import sharp from "sharp";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/client.js";
import { createSession } from "../../src/shared/auth/session.service.js";
import { CHECKPOINT_IMAGE_URL_PREFIX } from "../../src/modules/images/index.js";
import { env } from "../../src/env.js";

const createdUserIds: string[] = [];
const createdDestinationIds: string[] = [];
const createdImages: string[] = [];
const origin = { latitude: -0.9471, longitude: 100.4172 };

async function seed() {
  const user = await prisma.user.create({
    data: { name: "Upload Test", username: `u-${randomUUID()}`, email: `up-${randomUUID()}@example.test` },
    select: { id: true },
  });
  createdUserIds.push(user.id);

  const destination = await prisma.destination.create({
    data: {
      name: `Upload Destination ${randomUUID()}`,
      city: "Padang",
      source: "manual",
      latitude: origin.latitude,
      longitude: origin.longitude,
    },
    select: { id: true },
  });
  createdDestinationIds.push(destination.id);

  const trip = await prisma.trip.create({
    data: { title: "Upload Trip", members: { create: { userId: user.id } } },
    select: { id: true },
  });
  const stop = await prisma.tripDestination.create({
    data: { tripId: trip.id, destinationId: destination.id },
    select: { id: true },
  });

  const session = await createSession(user.id, { userAgent: "upload-test" });
  return { tripId: trip.id, tripDestinationId: stop.id, token: session.token };
}

afterAll(async () => {
  for (const userId of createdUserIds) {
    await prisma.trip.deleteMany({ where: { members: { some: { userId } } } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
  for (const id of createdDestinationIds) {
    await prisma.destination.delete({ where: { id } }).catch(() => undefined);
  }
  for (const imageUrl of createdImages) {
    await rm(path.join(env.UPLOAD_DIR, "checkpoints", imageUrl.slice(imageUrl.lastIndexOf("/") + 1)), {
      force: true,
    });
  }
});

test("multipart check-in compresses the camera photo and serves it back", async () => {
  const { tripId, tripDestinationId, token } = await seed();
  const jpeg = await sharp({
    create: { width: 3000, height: 2000, channels: 3, background: { r: 10, g: 90, b: 40 } },
  })
    .jpeg()
    .toBuffer();

  const form = new FormData();
  form.append("tripDestinationId", tripDestinationId);
  form.append("latitude", String(origin.latitude));
  form.append("longitude", String(origin.longitude));
  form.append("accuracyMeters", "8");
  form.append("note", "from camera");
  form.append("image", new File([jpeg], "photo.jpg", { type: "image/jpeg" }));

  const response = await app.request(`/api/v1/trips/${tripId}/checkpoints`, {
    method: "POST",
    headers: { cookie: `lahlah_session=${token}` },
    body: form,
  });
  assert.equal(response.status, 201);
  const body = (await response.json()) as { data: { imageUrl: string; note: string } };
  assert.ok(body.data.imageUrl.startsWith(CHECKPOINT_IMAGE_URL_PREFIX), body.data.imageUrl);
  assert.equal(body.data.note, "from camera");
  createdImages.push(body.data.imageUrl);

  const image = await app.request(body.data.imageUrl);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/webp");
  const stored = Buffer.from(await image.arrayBuffer());
  assert.equal((await sharp(stored).metadata()).width, 1200);

  // Repeating the check-in keeps the first row (and its photo).
  const repeat = await app.request(`/api/v1/trips/${tripId}/checkpoints`, {
    method: "POST",
    headers: { cookie: `lahlah_session=${token}` },
    body: form,
  });
  assert.equal(repeat.status, 200);
  const repeatBody = (await repeat.json()) as { data: { imageUrl: string } };
  assert.equal(repeatBody.data.imageUrl, body.data.imageUrl);
});

test("JSON check-in without a photo still works", async () => {
  const { tripId, tripDestinationId, token } = await seed();
  const response = await app.request(`/api/v1/trips/${tripId}/checkpoints`, {
    method: "POST",
    headers: { cookie: `lahlah_session=${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      tripDestinationId,
      latitude: origin.latitude,
      longitude: origin.longitude,
    }),
  });
  assert.equal(response.status, 201);
  const body = (await response.json()) as { data: { imageUrl: string | null } };
  assert.equal(body.data.imageUrl, null);
});
