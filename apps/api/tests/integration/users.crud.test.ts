import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { app } from "../../src/app.js";

const json = { "content-type": "application/json" };

test("CRUD users benar-benar menyimpan perubahan ke PostgreSQL", async () => {
  const email = `crud-${randomUUID()}@example.test`;
  let userId: string | undefined;

  try {
    const createdResponse = await app.request("/api/v1/users", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ name: "CRUD Test", email }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json().then((body) => body.data);
    userId = created.id;
    assert.equal(created.email, email);
    assert.equal(created.isActive, true);

    const detailResponse = await app.request(`/api/v1/users/${userId}`);
    assert.equal(detailResponse.status, 200);
    assert.equal(await detailResponse.json().then((body) => body.data.id), userId);

    const listResponse = await app.request("/api/v1/users?limit=100");
    assert.equal(listResponse.status, 200);
    assert.ok(await listResponse.json().then((body) => body.data.some((user: { id: string }) => user.id === userId)));

    const updateResponse = await app.request(`/api/v1/users/${userId}`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({ name: "CRUD Updated" }),
    });
    assert.equal(updateResponse.status, 200);
    assert.equal(await updateResponse.json().then((body) => body.data.name), "CRUD Updated");

    const deleteResponse = await app.request(`/api/v1/users/${userId}`, { method: "DELETE" });
    assert.equal(deleteResponse.status, 200);
    assert.equal(await deleteResponse.json().then((body) => body.data.isActive), false);

    const deletedUserResponse = await app.request(`/api/v1/users/${userId}`);
    assert.equal(deletedUserResponse.status, 200);
    assert.equal(await deletedUserResponse.json().then((body) => body.data.isActive), false);
  } finally {
    if (userId) await app.request(`/api/v1/users/${userId}`, { method: "DELETE" });
  }
});
