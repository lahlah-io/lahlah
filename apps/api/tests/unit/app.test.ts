import assert from "node:assert/strict";
import { test } from "vitest";
import { app } from "../../src/app.js";

test("live health endpoint returns request id", async () => {
  const response = await app.request("/health/live");
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("X-Request-Id"));
  assert.deepEqual(await response.json().then(({ status }) => status), "ok");
});

test("unknown routes use the API error envelope", async () => {
  const response = await app.request("/api/v1/not-a-route");
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: { code: "NOT_FOUND", message: "Route not found" },
  });
});

test("user CRUD is disabled in production until auth is configured", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const response = await app.request("/api/v1/users");
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: { code: "AUTH_NOT_CONFIGURED", message: "User API is disabled until authentication is configured" },
    });
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test("invalid user body is rejected before database access", async () => {
  const response = await app.request("/api/v1/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "", email: "invalid" }),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { code: "VALIDATION_ERROR", message: "Request validation failed" },
  });
});

test("oversized API payload is rejected", async () => {
  const response = await app.request("/api/v1/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "x".repeat(1024 * 1024) }),
  });
  assert.equal(response.status, 413);
});
