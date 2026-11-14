import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createDestinationSchema,
  listDestinationsQuerySchema,
  updateDestinationSchema,
} from "../../../../src/modules/destinations/schemas/destination.schema.js";
import {
  categorySlugSchema,
  createCategorySchema,
  updateCategorySchema,
} from "../../../../src/modules/destinations/schemas/category.schema.js";

test("koordinat dinormalisasi ke tujuh desimal", () => {
  const parsed = createDestinationSchema.parse({
    name: "Monas",
    latitude: -6.1754,
    longitude: "106.827153",
  });
  assert.equal(parsed.latitude, "-6.1754000");
  assert.equal(parsed.longitude, "106.8271530");

  const integer = createDestinationSchema.parse({ name: "Khatulistiwa", latitude: 0, longitude: 0 });
  assert.equal(integer.latitude, "0.0000000");
  assert.equal(integer.longitude, "0.0000000");
});

test("koordinat di luar rentang ditolak", () => {
  assert.equal(
    createDestinationSchema.safeParse({ name: "X", latitude: 90.1 }).success,
    false,
  );
  assert.equal(
    createDestinationSchema.safeParse({ name: "X", latitude: -90.1 }).success,
    false,
  );
  assert.equal(
    createDestinationSchema.safeParse({ name: "X", longitude: 180.1 }).success,
    false,
  );
  assert.equal(
    createDestinationSchema.safeParse({ name: "X", longitude: -180.1 }).success,
    false,
  );
  assert.equal(
    createDestinationSchema.safeParse({ name: "X", latitude: "1.12345678" }).success,
    false,
    "lebih dari tujuh desimal ditolak",
  );
});

test("create destination memakai default yang aman", () => {
  const parsed = createDestinationSchema.parse({ name: "  Danau  " });
  assert.equal(parsed.name, "Danau");
  assert.deepEqual(parsed.categoryIds, []);
  assert.deepEqual(parsed.details, {});
  assert.equal(parsed.latitude, undefined);
});

test("update destination kosong ditolak", () => {
  assert.equal(updateDestinationSchema.safeParse({}).success, false);
  assert.equal(updateDestinationSchema.safeParse({ name: "Baru" }).success, true);
});

test("slug kategori hanya huruf kecil, angka, dan tanda hubung", () => {
  assert.equal(categorySlugSchema.safeParse("pantai-uji-2").success, true);
  assert.equal(categorySlugSchema.safeParse("Pantai").success, false);
  assert.equal(categorySlugSchema.safeParse("pantai_uji").success, false);
  assert.equal(categorySlugSchema.safeParse("-pantai").success, false);
  assert.equal(categorySlugSchema.safeParse("pantai--uji").success, false);
  assert.equal(categorySlugSchema.safeParse("pantai uji").success, false);
});

test("kategori membuat slug otomatis dan menolak update kosong", () => {
  const parsed = createCategorySchema.parse({ name: "  Pantai  " });
  assert.equal(parsed.name, "Pantai");
  assert.equal(parsed.slug, undefined);
  assert.equal(updateCategorySchema.safeParse({}).success, false);
});

test("filter daftar destination mengubah isActive menjadi boolean", () => {
  assert.equal(listDestinationsQuerySchema.parse({}).page, 1);
  assert.equal(listDestinationsQuerySchema.parse({ isActive: "true" }).isActive, true);
  assert.equal(listDestinationsQuerySchema.parse({ isActive: "false" }).isActive, false);
  assert.equal(listDestinationsQuerySchema.safeParse({ isActive: "yes" }).success, false);
  assert.equal(listDestinationsQuerySchema.safeParse({ source: "unknown" }).success, false);
});

test("filter daftar destination mendukung city dan alias category", () => {
  const parsed = listDestinationsQuerySchema.parse({
    city: "Padang",
    category: "00000000-0000-4000-8000-000000000001",
  });
  assert.equal(parsed.city, "Padang");
  assert.equal(parsed.category, "00000000-0000-4000-8000-000000000001");
});
