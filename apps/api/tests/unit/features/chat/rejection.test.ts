import { expect, test } from "vitest";
import { detectRejectedCategories, handleRejection, rejectionReply } from "../../../../src/modules/chat/services/chat.service.js";

test.each([
  ["saya tidak suka ke museum", ["sejarah", "budaya"]],
  ["jangan pantai, saya mau kuliner", ["pantai"]],
  ["hindari wisata alam", ["alam"]],
  ["nggak mau tempat bersejarah", ["sejarah"]],
  ["saya suka pantai", []],
  ["rekomendasi museum", []],
  ["hapus destinasi ke 3", []],
])("detectRejectedCategories(%s) -> %j", (text, expected) => {
  expect(detectRejectedCategories(text)).toEqual(expected);
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
