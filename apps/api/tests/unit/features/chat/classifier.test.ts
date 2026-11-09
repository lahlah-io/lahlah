import assert from "node:assert/strict";
import test from "node:test";
import { classify } from "../../../../src/modules/chat/services/classifier.js";

const env = {
  AI_BASE_URL: "https://cls.example/v1",
  AI_API_KEY: "cls-key",
  AI_CLASSIFIER_MODEL: "cls-model",
} as NodeJS.ProcessEnv;

function withFetch(
  impl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>,
) {
  const prev = globalThis.fetch;
  globalThis.fetch = impl as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = prev;
  });
}

function modelResponse(content: string) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }),
    { status: 200 },
  );
}

test("maps greetings to general_chat via rule without provider call", async () => {
  assert.deepEqual(await classify("halo"), { intent: "general_chat", source: "rule" });
  assert.deepEqual(await classify("Selamat pagi, ada yang bisa dibantu?"), {
    intent: "general_chat",
    source: "rule",
  });
});

test("maps explicit command keywords to intents via rule", async () => {
  assert.deepEqual(await classify("buat itinerary untuk besok"), {
    intent: "generate_itinerary",
    source: "rule",
  });
  assert.deepEqual(await classify("ubah jadwal jadi sore"), {
    intent: "modify_itinerary",
    source: "rule",
  });
  assert.deepEqual(await classify("buat ulang itinerarynya"), {
    intent: "regenerate_itinerary",
    source: "rule",
  });
  assert.deepEqual(await classify("ya konfirmasi draft ini"), {
    intent: "confirm_itinerary",
    source: "rule",
  });
});

test("returns model intent with confidence when output is valid", async () => {
  await withFetch(
    async () => modelResponse(JSON.stringify({ intent: "generate_itinerary", confidence: 0.95 })),
    async () => {
      assert.deepEqual(await classify("pengen wisata kuliner Padang besok", env), {
        intent: "generate_itinerary",
        confidence: 0.95,
        source: "model",
      });
    },
  );
});

test("maps unknown label to missing_information", async () => {
  await withFetch(
    async () => modelResponse(JSON.stringify({ intent: "order_pizza", confidence: 0.9 })),
    async () => {
      assert.deepEqual(await classify("pesan tiket pesawat", env), {
        intent: "missing_information",
        source: "rule",
      });
    },
  );
});

test("maps broken JSON to missing_information", async () => {
  await withFetch(async () => modelResponse("{not json"), async () => {
    assert.deepEqual(await classify("rekomendasi oleh-oleh khas Padang", env), {
      intent: "missing_information",
      source: "rule",
    });
  });
});

test("maps low confidence to missing_information", async () => {
  await withFetch(
    async () => modelResponse(JSON.stringify({ intent: "confirm_itinerary", confidence: 0.4 })),
    async () => {
      assert.deepEqual(await classify("lanjut saja ya", env), {
        intent: "missing_information",
        source: "rule",
      });
    },
  );
});

test("maps provider failure to missing_information", async () => {
  await withFetch(
    async () => {
      throw new Error("network down");
    },
    async () => {
      assert.deepEqual(await classify("mau liburan akhir pekan", env), {
        intent: "missing_information",
        source: "rule",
      });
    },
  );
});