import { describe, expect, test } from "vitest";
import { classify } from "../../../../src/modules/chat/services/classifier.js";

const env = {
  AI_BASE_URL: "https://classifier.example/v1",
  AI_API_KEY: "test-key",
  AI_CLASSIFIER_MODEL: "test-classifier",
} as NodeJS.ProcessEnv;

function forbidProvider() {
  const prev = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error("rule case must not call provider"))) as typeof fetch;
  return () => {
    globalThis.fetch = prev;
  };
}

describe("modification intents (rule layer)", () => {
  test("ganti destinasi maps to replace_destination", async () => {
    const restore = forbidProvider();
    try {
      expect(await classify("ganti destinasi ke-4", env)).toMatchObject({
        intent: "replace_destination",
        source: "rule",
      });
    } finally {
      restore();
    }
  });

  test("hapus destinasi maps to remove_destination", async () => {
    const restore = forbidProvider();
    try {
      expect(await classify("hapus destinasi nomor 4", env)).toMatchObject({
        intent: "remove_destination",
        source: "rule",
      });
    } finally {
      restore();
    }
  });

  test("tambah 1 destinasi maps to add_destination", async () => {
    const restore = forbidProvider();
    try {
      expect(await classify("tambah 1 destinasi", env)).toMatchObject({
        intent: "add_destination",
        source: "rule",
      });
    } finally {
      restore();
    }
  });

  test("dislike without a verb maps to clarify_modification", async () => {
    const restore = forbidProvider();
    try {
      expect(await classify("saya tidak suka destinasi nomor 3", env)).toMatchObject({
        intent: "clarify_modification",
        source: "rule",
      });
    } finally {
      restore();
    }
  });

  test("versi selection and publish stay distinct", async () => {
    const restore = forbidProvider();
    try {
      expect(await classify("pilih versi 2", env)).toMatchObject({
        intent: "select_itinerary_version",
        source: "rule",
      });
      expect(await classify("publikasikan itinerary ini", env)).toMatchObject({
        intent: "publish_itinerary_version",
        source: "rule",
      });
    } finally {
      restore();
    }
  });

  test("time change is still modify_itinerary, not a destination replace", async () => {
    const restore = forbidProvider();
    try {
      expect(await classify("ubah jadwal jadi sore", env)).toMatchObject({
        intent: "modify_itinerary",
        source: "rule",
      });
    } finally {
      restore();
    }
  });

  test("colloquial verbs still map to destination intents via rule", async () => {
    const restore = forbidProvider();
    try {
      expect(await classify("tuker destinasi ke-4", env)).toMatchObject({
        intent: "replace_destination",
        source: "rule",
      });
      expect(await classify("hapusin destinasi nomor 3", env)).toMatchObject({
        intent: "remove_destination",
        source: "rule",
      });
      expect(await classify("tambahin 2 tempat", env)).toMatchObject({
        intent: "add_destination",
        source: "rule",
      });
      expect(await classify("destinasi ke-4 gak menarik", env)).toMatchObject({
        intent: "clarify_modification",
        source: "rule",
      });
    } finally {
      restore();
    }
  });
});
