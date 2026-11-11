import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/client.js";
import { createTestSession, deleteTestUser } from "./helpers/session.js";

test("admin dapat CRUD model", async () => {
  const admin = await createTestSession({ role: "admin" });
  const provider = `provider-${randomUUID()}`;
  let modelId: string | undefined;

  try {
    const createdResponse = await app.request("/api/v1/models", {
      method: "POST",
      headers: admin.headers,
      body: JSON.stringify({
        name: "Model Uji",
        provider,
        modelIdentifier: "uji-1",
        priceInputPer1m: "1.25",
        priceOutputPer1m: 2.5,
      }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json().then((body) => body.data);
    modelId = created.id;
    assert.equal(created.priceInputPer1m, "1.25");
    assert.equal(created.priceOutputPer1m, "2.5");

    const duplicateResponse = await app.request("/api/v1/models", {
      method: "POST",
      headers: admin.headers,
      body: JSON.stringify({ name: "Duplikat", provider, modelIdentifier: "uji-1" }),
    });
    assert.equal(duplicateResponse.status, 409);

    const patchResponse = await app.request(`/api/v1/models/${modelId}`, {
      method: "PATCH",
      headers: admin.headers,
      body: JSON.stringify({ isActive: false, name: "Model Uji Baru" }),
    });
    assert.equal(patchResponse.status, 200);
    const patched = await patchResponse.json().then((body) => body.data);
    assert.equal(patched.isActive, false);
    assert.equal(patched.name, "Model Uji Baru");

    const listResponse = await app.request(`/api/v1/models?q=${provider}`, {
      headers: admin.headers,
    });
    assert.equal(listResponse.status, 200);
    assert.equal(await listResponse.json().then((body) => body.meta.total), 1);

    const deleteResponse = await app.request(`/api/v1/models/${modelId}`, {
      method: "DELETE",
      headers: admin.headers,
    });
    assert.equal(deleteResponse.status, 200);
    assert.equal(await deleteResponse.json().then((body) => body.data.isActive), false);
  } finally {
    if (modelId) await prisma.model.deleteMany({ where: { id: modelId } });
    await deleteTestUser(admin.user.id);
  }
});

test("admin dapat CRUD plan dan plan free dilindungi", async () => {
  const admin = await createTestSession({ role: "admin" });
  const model = await prisma.model.create({
    data: {
      name: "Model Default Uji",
      provider: `provider-${randomUUID()}`,
      modelIdentifier: "default-uji",
    },
    select: { id: true },
  });
  const planName = `plan-${randomUUID()}`;
  let planId: string | undefined;

  try {
    const createdResponse = await app.request("/api/v1/subscription-plans", {
      method: "POST",
      headers: admin.headers,
      body: JSON.stringify({
        name: planName,
        description: "Plan uji",
        price: "49000",
        billingInterval: "monthly",
        defaultModelId: model.id,
        details: { chatMessagesPerMonth: 300, maxItineraries: 20 },
      }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json().then((body) => body.data);
    planId = created.id;
    assert.equal(created.defaultModelId, model.id);
    assert.equal(created.details.chatMessagesPerMonth, 300);
    assert.equal(created.details.maxChatSessions, null, "limit yang tidak dikirim memakai default null");

    const patchedResponse = await app.request(`/api/v1/subscription-plans/${planId}`, {
      method: "PATCH",
      headers: admin.headers,
      body: JSON.stringify({ details: { chatMessagesPerMonth: 500 } }),
    });
    assert.equal(patchedResponse.status, 200);
    const patched = await patchedResponse.json().then((body) => body.data);
    assert.equal(patched.details.chatMessagesPerMonth, 500);
    assert.equal(patched.details.maxItineraries, 20, "details digabung, bukan ditimpa total");

    const freePlan = await prisma.subscriptionPlan.findUnique({
      where: { name: "free" },
      select: { id: true },
    });
    assert.ok(freePlan);
    const deleteFreeResponse = await app.request(`/api/v1/subscription-plans/${freePlan.id}`, {
      method: "DELETE",
      headers: admin.headers,
    });
    assert.equal(deleteFreeResponse.status, 409);
    assert.equal(await deleteFreeResponse.json().then((body) => body.error.code), "SYSTEM_PLAN");

    const subscriber = await createTestSession({ role: "user" });
    try {
      await prisma.userSubscription.create({
        data: { userId: subscriber.user.id, planId, status: "pending", startedAt: new Date() },
      });
      const deleteInUseResponse = await app.request(`/api/v1/subscription-plans/${planId}`, {
        method: "DELETE",
        headers: admin.headers,
      });
      assert.equal(deleteInUseResponse.status, 409);
      assert.equal(await deleteInUseResponse.json().then((body) => body.error.code), "PLAN_IN_USE");
      await prisma.userSubscription.deleteMany({ where: { userId: subscriber.user.id } });
    } finally {
      await deleteTestUser(subscriber.user.id);
    }

    const deleteResponse = await app.request(`/api/v1/subscription-plans/${planId}`, {
      method: "DELETE",
      headers: admin.headers,
    });
    assert.equal(deleteResponse.status, 200);
    planId = undefined;
  } finally {
    if (planId) {
      await prisma.userSubscription.deleteMany({ where: { planId } });
      await prisma.subscriptionPlan.deleteMany({ where: { id: planId } });
    }
    await prisma.model.deleteMany({ where: { id: model.id } });
    await deleteTestUser(admin.user.id);
  }
});

test("publik dapat membaca plan, perubahan tetap butuh admin", async () => {
  const freePlan = await prisma.subscriptionPlan.findUnique({
    where: { name: "free" },
    select: { id: true },
  });
  assert.ok(freePlan);

  const listResponse = await app.request("/api/v1/subscription-plans");
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json();
  assert.ok(list.data.some((plan: { id: string }) => plan.id === freePlan.id));

  const detailResponse = await app.request(`/api/v1/subscription-plans/${freePlan.id}`);
  assert.equal(detailResponse.status, 200);
  assert.equal(await detailResponse.json().then((body) => body.data.name), "free");

  const anonymousWrite = await app.request("/api/v1/subscription-plans", {
    method: "POST",
    body: JSON.stringify({ name: `plan-${randomUUID()}` }),
  });
  assert.equal(anonymousWrite.status, 401);

  const user = await createTestSession({ role: "user" });
  try {
    const userWrite = await app.request("/api/v1/subscription-plans", {
      method: "POST",
      headers: user.headers,
      body: JSON.stringify({ name: `plan-${randomUUID()}` }),
    });
    assert.equal(userWrite.status, 403);
  } finally {
    await deleteTestUser(user.user.id);
  }
});

test("plan memvalidasi allowedModelIds dan default model", async () => {
  const admin = await createTestSession({ role: "admin" });
  const allowed = await prisma.model.create({
    data: {
      name: "Model Diizinkan",
      provider: `provider-${randomUUID()}`,
      modelIdentifier: "allowed-uji",
    },
    select: { id: true },
  });
  const other = await prisma.model.create({
    data: {
      name: "Model Lain",
      provider: `provider-${randomUUID()}`,
      modelIdentifier: "other-uji",
    },
    select: { id: true },
  });
  let planId: string | undefined;

  try {
    const missingResponse = await app.request("/api/v1/subscription-plans", {
      method: "POST",
      headers: admin.headers,
      body: JSON.stringify({
        name: `plan-${randomUUID()}`,
        details: { allowedModelIds: [randomUUID()] },
      }),
    });
    assert.equal(missingResponse.status, 404);
    assert.equal(await missingResponse.json().then((body) => body.error.code), "MODEL_NOT_FOUND");

    await prisma.model.update({ where: { id: other.id }, data: { isActive: false } });
    const inactiveResponse = await app.request("/api/v1/subscription-plans", {
      method: "POST",
      headers: admin.headers,
      body: JSON.stringify({
        name: `plan-${randomUUID()}`,
        details: { allowedModelIds: [other.id] },
      }),
    });
    assert.equal(inactiveResponse.status, 400);
    assert.equal(await inactiveResponse.json().then((body) => body.error.code), "MODEL_INACTIVE");

    const mismatchResponse = await app.request("/api/v1/subscription-plans", {
      method: "POST",
      headers: admin.headers,
      body: JSON.stringify({
        name: `plan-${randomUUID()}`,
        defaultModelId: allowed.id,
        details: { allowedModelIds: [] },
      }),
    });
    assert.equal(mismatchResponse.status, 400);
    assert.equal(
      await mismatchResponse.json().then((body) => body.error.code),
      "DEFAULT_MODEL_NOT_ALLOWED",
    );

    const createdResponse = await app.request("/api/v1/subscription-plans", {
      method: "POST",
      headers: admin.headers,
      body: JSON.stringify({
        name: `plan-${randomUUID()}`,
        defaultModelId: allowed.id,
        details: { allowedModelIds: [allowed.id] },
      }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json().then((body) => body.data);
    planId = created.id;
    assert.deepEqual(created.details.allowedModelIds, [allowed.id]);
  } finally {
    if (planId) await prisma.subscriptionPlan.deleteMany({ where: { id: planId } });
    await prisma.model.deleteMany({ where: { id: { in: [allowed.id, other.id] } } });
    await deleteTestUser(admin.user.id);
  }
});

test("model yang tersedia mengikuti plan aktif", async () => {
  const session = await createTestSession();
  const activeModel = await prisma.model.create({
    data: {
      name: "Model Aktif",
      provider: `provider-${randomUUID()}`,
      modelIdentifier: "aktif-uji",
    },
    select: { id: true },
  });
  const inactiveModel = await prisma.model.create({
    data: {
      name: "Model Nonaktif",
      provider: `provider-${randomUUID()}`,
      modelIdentifier: "nonaktif-uji",
      isActive: false,
    },
    select: { id: true },
  });
  const plan = await prisma.subscriptionPlan.create({
    data: {
      name: `restricted-${randomUUID()}`,
      billingInterval: "monthly",
      defaultModelId: activeModel.id,
      details: { allowedModelIds: [activeModel.id] },
    },
    select: { id: true },
  });

  try {
    const freeResponse = await app.request("/api/v1/subscriptions/me/models", {
      headers: session.headers,
    });
    assert.equal(freeResponse.status, 200);
    const free = await freeResponse.json().then((body) => body.data);
    assert.equal(free.allowedModelIds, null, "plan free mengizinkan semua model");
    assert.ok(free.models.some((model: { id: string }) => model.id === activeModel.id));
    assert.ok(!free.models.some((model: { id: string }) => model.id === inactiveModel.id));

    await prisma.userSubscription.updateMany({
      where: { userId: session.user.id, status: "active" },
      data: { planId: plan.id },
    });

    const restrictedResponse = await app.request("/api/v1/subscriptions/me/models", {
      headers: session.headers,
    });
    assert.equal(restrictedResponse.status, 200);
    const restricted = await restrictedResponse.json().then((body) => body.data);
    assert.deepEqual(restricted.allowedModelIds, [activeModel.id]);
    assert.deepEqual(
      restricted.models.map((model: { id: string }) => model.id),
      [activeModel.id],
    );
    assert.equal(restricted.defaultModelId, activeModel.id);
  } finally {
    await deleteTestUser(session.user.id);
    await prisma.subscriptionPlan.deleteMany({ where: { id: plan.id } });
    await prisma.model.deleteMany({
      where: { id: { in: [activeModel.id, inactiveModel.id] } },
    });
  }
});
