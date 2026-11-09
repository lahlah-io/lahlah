import assert from "node:assert/strict";
import { test } from "vitest";
import {
  destinationIdSchema,
  listDestinationsQuerySchema,
} from "../../../../src/modules/destinations/schemas/destination.schema.js";

test("list destinations query validates limit 1-100 and defaults", () => {
  assert.deepEqual(listDestinationsQuerySchema.parse({}), {
    page: 1,
    limit: 20,
  });
  assert.deepEqual(
    listDestinationsQuerySchema.parse({
      page: "2",
      limit: "5",
      city: "Padang",
      category: "00000000-0000-4000-8000-000000000001",
    }),
    { page: 2, limit: 5, city: "Padang", category: "00000000-0000-4000-8000-000000000001" },
  );
  assert.equal(listDestinationsQuerySchema.safeParse({ limit: "0" }).success, false);
  assert.equal(listDestinationsQuerySchema.safeParse({ limit: "101" }).success, false);
});

test("destination id schema accepts uuid and rejects invalid id", () => {
  assert.deepEqual(
    destinationIdSchema.parse({ id: "00000000-0000-4000-8000-000000000001" }),
    { id: "00000000-0000-4000-8000-000000000001" },
  );
  assert.equal(destinationIdSchema.safeParse({ id: "not-a-uuid" }).success, false);
});
