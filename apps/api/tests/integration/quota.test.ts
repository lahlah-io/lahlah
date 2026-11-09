import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/client.js";
import { createTestSession, deleteTestUser } from "./helpers/session.js";

test("plan saya dan kuota menghitung pemakaian nyata", async () => {
  const session = await createTestSession();
  const model = await prisma.model.create({
    data: {
      name: "Model Kuota",
      provider: `provider-${randomUUID()}`,
      modelIdentifier: "kuota-1",
    },
    select: { id: true },
  });

  try {
    const planResponse = await app.request("/api/v1/subscriptions/me", { headers: session.headers });
    assert.equal(planResponse.status, 200);
    const plan = await planResponse.json().then((body) => body.data);
    assert.equal(plan.plan.name, "free");
    assert.equal(plan.limits.chatMessagesPerMonth, 30);
    assert.equal(plan.limits.maxItineraries, 3);
    assert.equal(plan.usage.chatMessages, 0);

    const chatSession = await prisma.chatSession.create({
      data: {
        userId: session.user.id,
        modelId: model.id,
        title: "Sesi uji",
      },
      select: { id: true },
    });

    await prisma.chatMessage.createMany({
      data: [1, 2, 3].map((index) => ({
        sessionId: chatSession.id,
        role: "user" as const,
        content: `pesan ${index}`,
      })),
    });

    await prisma.itinerary.createMany({
      data: [1, 2].map((index) => ({
        userId: session.user.id,
        title: `Itinerary ${index}`,
        content: "{}",
      })),
    });

    const usageResponse = await app.request("/api/v1/subscriptions/me/quota", {
      headers: session.headers,
    });
    assert.equal(usageResponse.status, 200);
    const usage = await usageResponse.json().then((body) => body.data);
    assert.equal(usage.chatMessages.used, 3);
    assert.equal(usage.chatSessions.used, 1);
    assert.equal(usage.itineraries.used, 2);
    assert.equal(usage.chatMessages.remaining, 27);

    const allowedResponse = await app.request("/api/v1/subscriptions/me/quota/check", {
      method: "POST",
      headers: session.headers,
      body: JSON.stringify({ metric: "chatMessages", amount: 27 }),
    });
    assert.equal(allowedResponse.status, 200);
    const allowed = await allowedResponse.json().then((body) => body.data);
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.remaining, 0);

    const deniedResponse = await app.request("/api/v1/subscriptions/me/quota/check", {
      method: "POST",
      headers: session.headers,
      body: JSON.stringify({ metric: "chatMessages", amount: 28 }),
    });
    assert.equal(deniedResponse.status, 200);
    const denied = await deniedResponse.json().then((body) => body.data);
    assert.equal(denied.allowed, false);

    const historyResponse = await app.request("/api/v1/subscriptions/me/history", {
      headers: session.headers,
    });
    assert.equal(historyResponse.status, 200);
    const history = await historyResponse.json().then((body) => body.data);
    assert.equal(history.length, 1);
    assert.equal(history[0].plan.name, "free");
  } finally {
    await deleteTestUser(session.user.id);
    await prisma.model.deleteMany({ where: { id: model.id } });
  }
});
