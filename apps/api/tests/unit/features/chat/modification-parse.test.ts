import { describe, expect, test } from "vitest";
import { parseModification } from "../../../../src/modules/chat/services/modification.js";

describe("parseModification", () => {
  test("position targets: digits, nomor, ke-N, and ordinals", () => {
    expect(parseModification("ganti destinasi ke-4")).toMatchObject({
      operation: "replace_destination",
      targetPosition: 4,
    });
    expect(parseModification("ganti destinasi nomor 2 dengan tempat lain")).toMatchObject({
      operation: "replace_destination",
      targetPosition: 2,
    });
    expect(parseModification("Ganti destinasi kedua dengan tempat lain")).toMatchObject({
      operation: "replace_destination",
      targetPosition: 2,
    });
  });

  test("replace by name keeps the name as the target", () => {
    expect(parseModification("ganti Pantai Padang dengan tempat lain")).toMatchObject({
      operation: "replace_destination",
      targetName: "Pantai Padang",
    });
  });

  test("remove by position and by last", () => {
    expect(parseModification("hapus destinasi nomor 4")).toMatchObject({
      operation: "remove_destination",
      targetPosition: 4,
    });
    expect(parseModification("hapus destinasi terakhir")).toMatchObject({
      operation: "remove_destination",
      targetLast: true,
    });
  });

  test("add reads quantity with a destination noun", () => {
    expect(parseModification("tambah 1 destinasi")).toMatchObject({
      operation: "add_destination",
      quantity: 1,
    });
    expect(parseModification("tambahkan 2 tempat")).toMatchObject({
      operation: "add_destination",
      quantity: 2,
    });
    expect(parseModification("tambah destinasi")).toMatchObject({
      operation: "add_destination",
      quantity: 1,
    });
    expect(parseModification("tambah tiga lokasi")).toMatchObject({
      operation: "add_destination",
      quantity: 3,
    });
  });

  test("dislike without a verb asks for clarification with its target", () => {
    expect(parseModification("saya tidak suka destinasi nomor 3")).toMatchObject({
      operation: "clarify_modification",
      targetPosition: 3,
    });
    expect(parseModification("kurang cocok")).toMatchObject({ operation: "clarify_modification" });
  });

  test("replace wins over dislike in the same message", () => {
    expect(parseModification("tidak suka nomor 3, ganti destinasi nomor 3")).toMatchObject({
      operation: "replace_destination",
      targetPosition: 3,
    });
  });

  test("version selection reads the version number", () => {
    expect(parseModification("pilih versi 2")).toMatchObject({ operation: "select_version", version: 2 });
    expect(parseModification("kembali ke versi 1")).toMatchObject({ operation: "select_version", version: 1 });
  });

  test("non destination modifications are not parsed here", () => {
    expect(parseModification("tambahkan alam")).toBeNull();
    expect(parseModification("ubah jadwal jadi sore")).toBeNull();
    expect(parseModification("buat itinerary besok")).toBeNull();
    expect(parseModification("hapus semua")).toBeNull();
  });
});
