import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createDestinationSchema,
  listDestinationsQuerySchema,
  updateDestinationSchema,
} from "../../../../src/modules/destinations/schemas/destination.schema.js";

test("filter district dinormalisasi ke nama kecamatan resmi", () => {
  assert.equal(listDestinationsQuerySchema.parse({ district: "padang barat" }).district, "Padang Barat");
  assert.equal(listDestinationsQuerySchema.parse({ district: "barat" }).district, "Padang Barat");
  assert.equal(listDestinationsQuerySchema.parse({ district: "Padang Bar." }).district, "Padang Barat");
  assert.equal(listDestinationsQuerySchema.parse({}).district, undefined);
  assert.equal(listDestinationsQuerySchema.safeParse({ district: "" }).success, false);
  assert.equal(listDestinationsQuerySchema.safeParse({ district: "bandung" }).success, false);
});

test("district tersimpan di create dan update destination", () => {
  assert.equal(createDestinationSchema.parse({ name: "X", district: "Padang Utara" }).district, "Padang Utara");
  assert.equal(createDestinationSchema.parse({ name: "X", district: null }).district, null);
  assert.equal(createDestinationSchema.parse({ name: "X" }).district, undefined);
  assert.equal(updateDestinationSchema.parse({ district: "Pauh" }).district, "Pauh");
  assert.equal(updateDestinationSchema.safeParse({ district: "kota padang" }).success, false);
});
