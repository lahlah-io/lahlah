import assert from "node:assert/strict";
import { test } from "vitest";
import { createUserSchema, listUsersQuerySchema, updateUserSchema } from "../../../../src/modules/users/schemas/user.schema.js";

test("skema user menerima input valid dan menolak email atau nama tidak valid", () => {
  assert.deepEqual(
    createUserSchema.parse({ name: " Test ", username: "Test_User ", email: "test@example.test" }),
    {
      name: "Test",
      username: "test_user",
      email: "test@example.test",
      role: "user",
    },
  );
  assert.equal(createUserSchema.safeParse({ name: "", email: "bukan-email" }).success, false);
  assert.equal(
    createUserSchema.safeParse({ name: "Test", username: "ab", email: "t@example.test" }).success,
    false,
    "username di bawah 3 karakter ditolak",
  );
  assert.equal(
    createUserSchema.safeParse({ name: "Test", username: "ada-spasi", email: "t@example.test" })
      .success,
    false,
    "username dengan karakter selain huruf kecil/angka/underscore ditolak",
  );
});

test("skema update menerima bio kosong sebagai hapus dan menolak avatar aneh", () => {
  assert.deepEqual(updateUserSchema.parse({ bio: "  " }), { bio: null });
  assert.deepEqual(updateUserSchema.parse({ avatarUrl: "/logo-mark.svg" }), {
    avatarUrl: "/logo-mark.svg",
  });
  assert.equal(
    updateUserSchema.safeParse({ avatarUrl: "ftp://x/y" }).success,
    false,
    "avatar non http/https/root-relative ditolak",
  );
  assert.equal(updateUserSchema.safeParse({}).success, false, "update kosong ditolak");
});

test("parameter list user memakai pagination bersama dan filter status", () => {
  assert.deepEqual(listUsersQuerySchema.parse({ isActive: "false" }), {
    page: 1,
    limit: 20,
    isActive: false,
  });
  assert.deepEqual(listUsersQuerySchema.parse({ username: "Budi_Santoso " }).username, "budi_santoso");
  assert.equal(listUsersQuerySchema.safeParse({ limit: "101" }).success, false);
});
