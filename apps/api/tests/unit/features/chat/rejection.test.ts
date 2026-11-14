import { expect, test } from "vitest";
import {
  detectRejectedCategories,
  detectRejectedDestination,
  handleRejection,
  rejectionReply,
} from "../../../../src/modules/chat/services/chat.service.js";

test.each([
  ["saya tidak suka ke museum", ["sejarah", "budaya"]],
  ["jangan pantai, saya mau kuliner", ["pantai"]],
  ["hindari wisata alam", ["alam"]],
  ["nggak mau tempat bersejarah", ["sejarah"]],
  ["saya suka pantai", []],
  ["rekomendasi museum", []],
  ["hapus destinasi ke 3", []],
  ["saya tidak suka pantai manis", []],
  ["saya tidak suka Pantai Air Manis", []],
])("detectRejectedCategories(%s) -> %j", (text, expected) => {
  expect(detectRejectedCategories(text)).toEqual(expected);
});

test("detectRejectedDestination identifies specific destinations", () => {
  const dest = detectRejectedDestination("saya tidak suka pantai manis");
  expect(dest).not.toBeNull();
  expect(dest?.name).toBe("Pantai Air Manis");
  expect(dest?.category).toBe("pantai");

  const dest2 = detectRejectedDestination("jangan ke Pantai Air Manis");
  expect(dest2?.name).toBe("Pantai Air Manis");

  expect(detectRejectedDestination("saya tidak suka pantai")).toBeNull();
});

test("rejectionReply asks for a replacement and never offers the rejected category", () => {
  const reply = rejectionReply("saya tidak suka ke museum", ["sejarah", "budaya"]);
  expect(reply).toContain("museum");
  expect(reply).toContain("pantai");
  expect(reply).toContain("kuliner");
  expect(reply).not.toContain("sejarah");
  expect(reply).not.toContain("budaya");
});

test("handleRejection asks before replacing when no new preference is given", () => {
  const outcome = handleRejection("saya tidak suka ke museum", ["pantai"]);
  expect(outcome).toMatchObject({ kind: "ask" });
  expect(outcome && outcome.kind === "ask" && outcome.message).toContain("pantai");
});

test("handleRejection asks for beach preference when specific beach is rejected", () => {
  const outcome = handleRejection("saya tidak suka pantai manis", ["pantai"]);
  expect(outcome).toMatchObject({ kind: "ask" });
  if (outcome && outcome.kind === "ask") {
    expect(outcome.message).toContain("Pantai Air Manis");
    expect(outcome.message).toContain("Pantai Padang");
    expect(outcome.message).toContain("Pantai Nirwana");
  }
});

test("handleRejection continues with alternate category when specific beach is replaced by user", () => {
  expect(handleRejection("jangan pantai manis, saya mau kuliner", ["pantai", "kuliner"])).toEqual({
    kind: "continue",
    categories: ["kuliner"],
    excludedDestinations: ["Pantai Air Manis", "Air Manis Beach", "pantai manis", "air manis"],
  });
});

test("handleRejection continues without the rejected category when a preference is given", () => {
  expect(handleRejection("jangan pantai, saya mau kuliner", ["pantai", "alam", "kuliner"])).toEqual({
    kind: "continue",
    categories: ["alam", "kuliner"],
  });
});

test("handleRejection leaves ordinary messages alone", () => {
  expect(handleRejection("saya suka pantai", ["pantai"])).toBeNull();
  expect(handleRejection("hapus destinasi ke 3", ["pantai"])).toBeNull();
});
