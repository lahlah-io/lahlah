import { describe, expect, test } from "vitest";
import { stripToolMarkup } from "../../../../src/modules/chat/services/answerer.js";

describe("answerer reply sanitising", () => {
  test("drops tool-call markup the model writes as plain text", () => {
    const raw =
      'Baik, saya cek dulu. 😊<tool_call><function=fetch_destinations_by_category><parameter=category>pantai</parameter></function></tool_call>';
    expect(stripToolMarkup(raw)).toBe("Baik, saya cek dulu. 😊");
  });

  test("leaves ordinary text untouched", () => {
    expect(stripToolMarkup("Halo! Mau ke pantai atau kuliner?")).toBe("Halo! Mau ke pantai atau kuliner?");
  });
});
