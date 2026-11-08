import assert from "node:assert/strict";
import test from "node:test";
import { createUserSchema, listUsersQuerySchema } from "../../../../src/modules/users/schemas/user.schema.js";

test("skema user menerima input valid dan menolak email atau nama tidak valid", () => {
  assert.deepEqual(createUserSchema.parse({ name: " Test ", email: "test@example.test" }), {
    name: "Test",
    email: "test@example.test",
    role: "user",
  });
  assert.equal(createUserSchema.safeParse({ name: "", email: "bukan-email" }).success, false);
});

test("parameter list user memakai pagination bersama dan filter status", () => {
  assert.deepEqual(listUsersQuerySchema.parse({ isActive: "false" }), {
    page: 1,
    limit: 20,
    isActive: false,
  });
  assert.equal(listUsersQuerySchema.safeParse({ limit: "101" }).success, false);
});
