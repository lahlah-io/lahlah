import assert from "node:assert/strict";
import { test } from "vitest";
import { app } from "../../src/app.js";
import { createTestSession, deleteTestUser } from "./helpers/session.js";

test("user biasa dapat membaca dan mengubah profilnya sendiri", async () => {
  const session = await createTestSession({ role: "user" });

  try {
    const read = await app.request("/api/v1/auth/me", { headers: session.headers });
    assert.equal(read.status, 200);
    const before = await read.json().then((body) => body.data);
    assert.equal(before.id, session.user.id);
    assert.equal(before.bio, null);

    const patch = await app.request("/api/v1/users/me", {
      method: "PATCH",
      headers: session.headers,
      body: JSON.stringify({ name: "Nama Baru", bio: "Halo Padang", avatarUrl: "/logo-mark.svg" }),
    });
    assert.equal(patch.status, 200);
    const updated = await patch.json().then((body) => body.data);
    assert.equal(updated.name, "Nama Baru");
    assert.equal(updated.bio, "Halo Padang");
    assert.equal(updated.avatarUrl, "/logo-mark.svg");

    const cleared = await app.request("/api/v1/users/me", {
      method: "PATCH",
      headers: session.headers,
      body: JSON.stringify({ bio: "" }),
    });
    assert.equal(cleared.status, 200);
    assert.equal(await cleared.json().then((body) => body.data.bio), null);
  } finally {
    await deleteTestUser(session.user.id);
  }
});

test("user biasa tetap tidak dapat membuka profil user lain atau daftar admin", async () => {
  const session = await createTestSession({ role: "user" });
  const other = await createTestSession({ role: "user" });

  try {
    for (const path of [`/api/v1/users/${other.user.id}`, "/api/v1/users"]) {
      const response = await app.request(path, { headers: session.headers });
      assert.equal(response.status, 403, path);
    }
  } finally {
    await deleteTestUser(session.user.id);
    await deleteTestUser(other.user.id);
  }
});

test("profil sendiri menolak avatar dengan skema selain http(s) atau root-relative", async () => {
  const session = await createTestSession({ role: "user" });

  try {
    const response = await app.request("/api/v1/users/me", {
      method: "PATCH",
      headers: session.headers,
      body: JSON.stringify({ avatarUrl: "javascript:alert(1)" }),
    });
    assert.equal(response.status, 400);
  } finally {
    await deleteTestUser(session.user.id);
  }
});
