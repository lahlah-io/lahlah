import assert from "node:assert/strict";
import { test } from "vitest";
import { searchDestinationsWhere } from "../../src/routes.js";

test("chat destination search excludes uncategorized and seed placeholder rows", () => {
  assert.deepEqual(searchDestinationsWhere({}).categories, { some: {} });
  assert.deepEqual(searchDestinationsWhere({}).source, { not: "admin" });
  assert.deepEqual(searchDestinationsWhere({ categories: ["pantai"] }).categories, {
    some: { category: { slug: { in: ["pantai"] } } },
  });
  assert.equal(searchDestinationsWhere({ keywords: "  " }).OR, undefined);
});
