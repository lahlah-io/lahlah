import assert from "node:assert/strict";
import { test } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/client.js";

test("list destinations city=Padang returns only active Padang destinations", async () => {
  const response = await app.request("/api/v1/destinations?city=Padang&limit=50");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body.data));
  assert.ok(body.data.length >= 4);
  for (const item of body.data) {
    assert.equal(item.city, "Padang");
    assert.equal(item.isActive, true);
    if (item.latitude !== null) assert.equal(typeof item.latitude, "number");
    if (item.longitude !== null) assert.equal(typeof item.longitude, "number");
  }
});

test("list destinations category filter works", async () => {
  const category = await prisma.category.findUnique({ where: { slug: "seed-pantai" } });
  assert.ok(category, "seed-pantai category missing (run seed)");
  const response = await app.request(
    `/api/v1/destinations?city=Padang&category=${category.id}&limit=50`,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.data.length >= 1);
  for (const item of body.data) {
    assert.ok(
      item.categories.some((c: { id: string }) => c.id === category.id),
      `destination ${item.id} missing category ${category.id}`,
    );
  }
});

test("get destination by id returns data or 404", async () => {
  const any = await prisma.destination.findFirst({
    where: { city: "Padang", isActive: true },
    select: { id: true, name: true },
  });
  assert.ok(any, "no Padang destination (run seed)");
  const ok = await app.request(`/api/v1/destinations/${any.id}`);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.data.id, any.id);
  assert.equal(body.data.name, any.name);

  const missing = await app.request(
    "/api/v1/destinations/00000000-0000-4000-8000-000000000099",
  );
  assert.equal(missing.status, 404);
  const err = await missing.json();
  assert.ok(err.error?.code);
});
