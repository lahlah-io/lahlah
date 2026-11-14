import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/client.js";
import { createTestSession, deleteTestUser } from "./helpers/session.js";

test("GET /auth/me menolak request tanpa sesi", async () => {
  const response = await app.request("/api/v1/auth/me");
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: { code: "UNAUTHENTICATED", message: "Authentication required" },
  });
});

test("GET /auth/me menolak token yang tidak dikenal", async () => {
  const response = await app.request("/api/v1/auth/me", {
    headers: { authorization: "Bearer token-palsu" },
  });
  assert.equal(response.status, 401);
});

test("Bearer token dan cookie sesi sama-sama diterima", async () => {
  const session = await createTestSession();
  try {
    const bearerResponse = await app.request("/api/v1/auth/me", { headers: session.headers });
    assert.equal(bearerResponse.status, 200);
    const bearerBody = await bearerResponse.json();
    assert.equal(bearerBody.data.id, session.user.id);

    const cookieResponse = await app.request("/api/v1/auth/me", {
      headers: { cookie: `lahlah_session=${session.token}` },
    });
    assert.equal(cookieResponse.status, 200);
    assert.equal(await cookieResponse.json().then((body) => body.data.id), session.user.id);
  } finally {
    await deleteTestUser(session.user.id);
  }
});

test("user nonaktif ditolak meskipun sesinya valid", async () => {
  const session = await createTestSession({ isActive: false });
  try {
    const response = await app.request("/api/v1/auth/me", { headers: session.headers });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: { code: "ACCOUNT_INACTIVE", message: "Account is inactive" },
    });
  } finally {
    await deleteTestUser(session.user.id);
  }
});

test("logout mencabut sesi aktif", async () => {
  const session = await createTestSession();
  try {
    const logoutResponse = await app.request("/api/v1/auth/logout", {
      method: "POST",
      headers: session.headers,
    });
    assert.equal(logoutResponse.status, 200);

    const meResponse = await app.request("/api/v1/auth/me", { headers: session.headers });
    assert.equal(meResponse.status, 401);
  } finally {
    await deleteTestUser(session.user.id);
  }
});

test("login Peridot menautkan akun yang dibuat admin lewat email", async () => {
  const originalFetch = globalThis.fetch;
  const suffix = randomUUID();
  const email = `link-${suffix}@example.test`;
  const pid = `pid-link-${suffix}`;
  const existing = await prisma.user.create({
    data: { name: "Dibuat Admin", username: `link_${suffix.replace(/-/g, "").slice(0, 12).toLowerCase()}`, email },
    select: { id: true },
  });

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({
      pid,
      profile: { displayName: "Nama Peridot" },
      credentials: [{ provider: "google", email }],
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

  try {
    const response = await app.request("/api/v1/auth/peridot/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "kode-tautan", redirectUri: "http://localhost:5174/" }),
    });
    assert.equal(response.status, 200);
    const user = await response.json().then((body) => body.data.user);
    assert.equal(user.id, existing.id, "akun lama harus ditautkan, bukan diduplikasi");

    const linked = await prisma.user.findUnique({
      where: { id: existing.id },
      select: { pid: true, name: true, email: true },
    });
    assert.equal(linked?.pid, pid);
    assert.equal(linked?.name, "Nama Peridot");
    assert.equal(linked?.email, email);

    const subscription = await prisma.userSubscription.findFirst({
      where: { userId: existing.id, status: "active" },
      select: { plan: { select: { name: true } } },
    });
    assert.equal(subscription?.plan.name, "free");
  } finally {
    globalThis.fetch = originalFetch;
    await deleteTestUser(existing.id);
  }
});

test("exchange pid_code membuat user, sesi, langganan free, dan log", async () => {
  const originalFetch = globalThis.fetch;
  const suffix = randomUUID();
  const email = `peridot-${suffix}@example.test`;
  const pid = `pid-${suffix}`;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({
      pid,
      profile: { displayName: "Peridot Test" },
      credentials: [{ provider: "google", email }],
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

  let userId: string | undefined;
  try {
    const response = await app.request("/api/v1/auth/peridot/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "kode-sekali-pakai", redirectUri: "http://localhost:5173/" }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    userId = body.data.user.id;
    assert.equal(body.data.user.email, email);
    const expectedUsername = `peridot_${suffix.replace(/-/g, "_")}`.slice(0, 24);
    assert.equal(body.data.user.username, expectedUsername);
    assert.equal(body.data.user.role, "user");
    assert.equal(body.token, undefined, "token tidak boleh bocor tanpa X-Session-Mode: bearer");
    assert.match(response.headers.get("set-cookie") ?? "", /lahlah_session=/);

    const subscription = await prisma.userSubscription.findFirst({
      where: { userId },
      select: { status: true, plan: { select: { name: true } } },
    });
    assert.equal(subscription?.status, "active");
    assert.equal(subscription?.plan.name, "free");

    const log = await prisma.activityLog.findFirst({
      where: { userId, action: "auth.login" },
      select: { id: true },
    });
    assert.ok(log);

    const bearerResponse = await app.request("/api/v1/auth/peridot/exchange", {
      method: "POST",
      headers: { "content-type": "application/json", "x-session-mode": "bearer" },
      body: JSON.stringify({ code: "kode-kedua", redirectUri: "http://localhost:5173/" }),
    });
    assert.equal(bearerResponse.status, 200);
    const bearerBody = await bearerResponse.json();
    assert.equal(typeof bearerBody.data.token, "string");
  } finally {
    globalThis.fetch = originalFetch;
    if (userId) await deleteTestUser(userId);
  }
});
