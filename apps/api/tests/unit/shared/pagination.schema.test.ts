import assert from "node:assert/strict";
import test from "node:test";
import { paginationQuerySchema } from "../../../src/shared/schemas/pagination.schema.js";

test("pagination schema applies defaults and bounds page size", () => {
  assert.deepEqual(paginationQuerySchema.parse({}), { page: 1, limit: 20 });
  assert.deepEqual(paginationQuerySchema.parse({ page: "2", limit: "100" }), { page: 2, limit: 100 });
  assert.equal(paginationQuerySchema.safeParse({ limit: "101" }).success, false);
});
