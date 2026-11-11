import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/client.js";
import { createTestSession, deleteTestUser } from "./helpers/session.js";

type CategoryBody = { id: string; name: string; slug: string };
type DestinationBody = {
  id: string;
  name: string;
  isActive: boolean;
  latitude: string | null;
  longitude: string | null;
  categories: CategoryBody[];
};

test("admin dapat CRUD kategori dengan slug otomatis dan cascade unlink", async () => {
  const admin = await createTestSession({ role: "admin" });
  const name = `Pantai Uji ${randomUUID().slice(0, 8)}`;
  let categoryId: string | undefined;

  try {
    const createdResponse = await app.request("/api/v1/categories", {
      method: "POST",
      headers: admin.headers,
      body: JSON.stringify({ name: `${name}!` }),
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()).data as CategoryBody;
    categoryId = created.id;
    assert.match(created.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(created.slug.startsWith("pantai-uji-"), true);

    const duplicateResponse = await app.request("/api/v1/categories", {
      method: "POST",
      headers: admin.headers,
      body: JSON.stringify({ name: "Duplikat", slug: created.slug }),
    });
    assert.equal(duplicateResponse.status, 409);
    assert.equal(
      (await duplicateResponse.json()).error.code,
      "CATEGORY_SLUG_EXISTS",
    );

    const patchResponse = await app.request(`/api/v1/categories/${categoryId}`, {
      method: "PATCH",
      headers: admin.headers,
      body: JSON.stringify({ name: `${name} Baru` }),
    });
    assert.equal(patchResponse.status, 200);
    assert.equal((await patchResponse.json()).data.name, `${name} Baru`);

    const destinationResponse = await app.request("/api/v1/destinations", {
      method: "POST",
      headers: admin.headers,
      body: JSON.stringify({ name: `Destinasi ${randomUUID().slice(0, 8)}`, categoryIds: [categoryId] }),
    });
    assert.equal(destinationResponse.status, 201);
    const destination = (await destinationResponse.json()).data as DestinationBody;
    assert.deepEqual(
      destination.categories.map((category) => category.id),
      [categoryId],
    );

    const deleteResponse = await app.request(`/api/v1/categories/${categoryId}`, {
      method: "DELETE",
      headers: admin.headers,
    });
    assert.equal(deleteResponse.status, 200);
    categoryId = undefined;

    const afterDelete = await app.request(`/api/v1/destinations/${destination.id}`, {
      headers: admin.headers,
    });
    assert.equal(afterDelete.status, 200);
    const afterDeleteBody = (await afterDelete.json()).data as DestinationBody;
    assert.deepEqual(afterDeleteBody.categories, [], "hapus kategori hanya melepas tag");
    assert.equal(afterDeleteBody.id, destination.id, "destination tidak ikut terhapus");

    await prisma.destination.deleteMany({ where: { id: destination.id } });
  } finally {
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    await deleteTestUser(admin.user.id);
  }
});

test("admin dapat CRUD destination lengkap dengan filter dan soft delete", async () => {
  const admin = await createTestSession({ role: "admin" });
  const suffix = randomUUID().slice(0, 8);
  const category = await prisma.category.create({
    data: { name: `Kategori ${suffix}`, slug: `kategori-${suffix}` },
    select: { id: true },
  });
  let destinationId: string | undefined;

  try {
    const createdResponse = await app.request("/api/v1/destinations", {
      method: "POST",
      headers: admin.headers,
      body: JSON.stringify({
        name: `Danau ${suffix}`,
        description: "Danau untuk pengujian",
        latitude: -6.2,
        longitude: "106.8166666",
        address: `Jl. Uji ${suffix}`,
        imageUrl: "https://example.test/danau.jpg",
        details: { entranceFee: 10000 },
        categoryIds: [category.id, category.id],
      }),
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()).data as DestinationBody;
    destinationId = created.id;
    assert.equal(created.latitude, "-6.2000000");
    assert.equal(created.longitude, "106.8166666");
    assert.equal(created.categories.length, 1);
    assert.equal(created.categories[0].id, category.id);

    const missingCategory = await app.request("/api/v1/destinations", {
      method: "POST",
      headers: admin.headers,
      body: JSON.stringify({ name: `Gagal ${suffix}`, categoryIds: [randomUUID()] }),
    });
    assert.equal(missingCategory.status, 404);
    assert.equal((await missingCategory.json()).error.code, "CATEGORY_NOT_FOUND");

    const byQuery = await app.request(`/api/v1/destinations?q=${suffix}`, {
      headers: admin.headers,
    });
    assert.equal(byQuery.status, 200);
    assert.equal((await byQuery.json()).meta.total, 1);

    const byCategory = await app.request(`/api/v1/destinations?categoryId=${category.id}`, {
      headers: admin.headers,
    });
    assert.equal(byCategory.status, 200);
    assert.equal((await byCategory.json()).meta.total, 1);

    const byActive = await app.request("/api/v1/destinations?isActive=false", {
      headers: admin.headers,
    });
    assert.equal(byActive.status, 200);
    assert.equal(
      (await byActive.json()).data.some((item: DestinationBody) => item.id === destinationId),
      false,
    );

    const patchResponse = await app.request(`/api/v1/destinations/${destinationId}`, {
      method: "PATCH",
      headers: admin.headers,
      body: JSON.stringify({
        name: `Danau ${suffix} Baru`,
        details: { openHour: "08:00" },
        categoryIds: [],
      }),
    });
    assert.equal(patchResponse.status, 200);
    const patched = (await patchResponse.json()).data as DestinationBody & {
      details: Record<string, unknown>;
    };
    assert.equal(patched.name, `Danau ${suffix} Baru`);
    assert.deepEqual(patched.categories, []);
    assert.equal(patched.details.entranceFee, 10000, "details digabung, bukan ditimpa");
    assert.equal(patched.details.openHour, "08:00");

    const deleteResponse = await app.request(`/api/v1/destinations/${destinationId}`, {
      method: "DELETE",
      headers: admin.headers,
    });
    assert.equal(deleteResponse.status, 200);
    assert.equal((await deleteResponse.json()).data.isActive, false);

    const stillExists = await prisma.destination.findUnique({
      where: { id: destinationId },
      select: { isActive: true },
    });
    assert.equal(stillExists?.isActive, false, "delete destination bersifat soft delete");
  } finally {
    if (destinationId) await prisma.destination.deleteMany({ where: { id: destinationId } });
    await prisma.category.deleteMany({ where: { id: category.id } });
    await deleteTestUser(admin.user.id);
  }
});

test("endpoint destination dan kategori khusus admin", async () => {
  const anonymousList = await app.request("/api/v1/destinations");
  assert.equal(anonymousList.status, 401);

  const anonymousCategories = await app.request("/api/v1/categories");
  assert.equal(anonymousCategories.status, 401);

  const user = await createTestSession({ role: "user" });
  try {
    const listResponse = await app.request("/api/v1/destinations", { headers: user.headers });
    assert.equal(listResponse.status, 403);

    const createResponse = await app.request("/api/v1/categories", {
      method: "POST",
      headers: user.headers,
      body: JSON.stringify({ name: `Kategori ${randomUUID()}` }),
    });
    assert.equal(createResponse.status, 403);
  } finally {
    await deleteTestUser(user.user.id);
  }

  const admin = await createTestSession({ role: "admin" });
  try {
    const invalidId = await app.request("/api/v1/destinations/not-a-uuid", {
      headers: admin.headers,
    });
    assert.equal(invalidId.status, 400);
    assert.equal((await invalidId.json()).error.code, "VALIDATION_ERROR");
  } finally {
    await deleteTestUser(admin.user.id);
  }
});
