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
        data: { userId: subscriber.user.id, planId, status: "active", startedAt: new Date() },
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
