import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { app } from "../../src/app.js";
import { deleteTestUser, createTestSession } from "./helpers/session.js";

const json = { "content-type": "application/json" };

test("endpoint users menolak request tanpa sesi", async () => {
  const response = await app.request("/api/v1/users");
  assert.equal(response.status, 401);
});

test("user biasa tidak boleh mengakses endpoint admin", async () => {
  const session = await createTestSession({ role: "user" });
  try {
    const response = await app.request("/api/v1/users", { headers: session.headers });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: { code: "FORBIDDEN", message: "Admin access required" },
    });
  } finally {
    await deleteTestUser(session.user.id);
  }
});

test("admin dapat membuat user, mengubah role, dan menonaktifkan user", async () => {
  const admin = await createTestSession({ role: "admin" });
  const email = `admin-created-${randomUUID()}@example.test`;
  let createdId: string | undefined;

  try {
    const createdResponse = await app.request("/api/v1/users", {
      method: "POST",
      headers: admin.headers,
      body: JSON.stringify({ name: "User Baru", email }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json().then((body) => body.data);
    createdId = created.id;
    assert.equal(created.email, email);
    assert.equal(created.role, "user");
    assert.equal(created.isActive, true);
    assert.equal(created.subscriptions[0]?.plan.name, "free", "user baru harus otomatis punya plan free");
    assert.equal(created.subscriptions[0]?.status, "active");

    const listResponse = await app.request("/api/v1/users?role=user&limit=100", {
      headers: admin.headers,
    });
    assert.equal(listResponse.status, 200);
    assert.ok(
      await listResponse.json().then((body) =>
        body.data.some((user: { id: string }) => user.id === createdId),
      ),
    );

    const roleResponse = await app.request(`/api/v1/users/${createdId}/role`, {
      method: "PATCH",
      headers: admin.headers,
      body: JSON.stringify({ role: "admin" }),
    });
    assert.equal(roleResponse.status, 200);
    assert.equal(await roleResponse.json().then((body) => body.data.role), "admin");

    const statusResponse = await app.request(`/api/v1/users/${createdId}/status`, {
      method: "PATCH",
      headers: admin.headers,
      body: JSON.stringify({ isActive: false }),
    });
    assert.equal(statusResponse.status, 200);
    assert.equal(await statusResponse.json().then((body) => body.data.isActive), false);

    const reactivateResponse = await app.request(`/api/v1/users/${createdId}/status`, {
      method: "PATCH",
      headers: admin.headers,
      body: JSON.stringify({ isActive: true }),
    });
    assert.equal(reactivateResponse.status, 200);

    const selfDemoteResponse = await app.request(`/api/v1/users/${admin.user.id}/role`, {
      method: "PATCH",
      headers: admin.headers,
      body: JSON.stringify({ role: "user" }),
    });
    assert.equal(selfDemoteResponse.status, 409);
    assert.equal(await selfDemoteResponse.json().then((body) => body.error.code), "CANNOT_MODIFY_SELF");
  } finally {
    if (createdId) await deleteTestUser(createdId);
    await deleteTestUser(admin.user.id);
  }
});

test("email duplikat saat membuat user ditolak 409", async () => {
  const admin = await createTestSession({ role: "admin" });
  const email = `dup-${randomUUID()}@example.test`;
  let createdId: string | undefined;

  try {
    const first = await app.request("/api/v1/users", {
      method: "POST",
      headers: admin.headers,
      body: JSON.stringify({ name: "Pertama", email }),
    });
    assert.equal(first.status, 201);
    createdId = await first.json().then((body) => body.data.id);

    const second = await app.request("/api/v1/users", {
      method: "POST",
      headers: { ...admin.headers, ...json },
      body: JSON.stringify({ name: "Kedua", email }),
    });
    assert.equal(second.status, 409);
    assert.equal(await second.json().then((body) => body.error.code), "EMAIL_ALREADY_EXISTS");
  } finally {
    if (createdId) await deleteTestUser(createdId);
    await deleteTestUser(admin.user.id);
  }
});
