import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import {
  PADANG_DISTRICTS,
  normalizeDistrict,
  resolveDistrict,
} from "../../../../src/shared/geo/padang-district.js";

test("daftar kecamatan Kota Padang lengkap 11", () => {
  assert.equal(PADANG_DISTRICTS.length, 11);
  assert.ok(PADANG_DISTRICTS.includes("Padang Barat"));
  assert.ok(PADANG_DISTRICTS.includes("Bungus Teluk Kabung"));
});

test("membaca kecamatan dari alamat berlabel Kec.", () => {
  assert.equal(
    resolveDistrict("Jl. Purus IV No.8, Purus, Kec. Padang Bar., Kota Padang, Sumatera Barat 25115"),
    "Padang Barat",
  );
  assert.equal(
    resolveDistrict("Tlk. Kabung Utara, Kec. Bungus Tlk. Kabung, Kota Padang, Sumatera Barat"),
    "Bungus Teluk Kabung",
  );
  assert.equal(
    resolveDistrict("Jl. Andalas timur No.86, Andalas, Kec. Padang Tim., Kota Padang, Sumatera Barat 25125"),
    "Padang Timur",
  );
});

test("membaca kecamatan tanpa label dari nama kelurahan", () => {
  assert.equal(
    resolveDistrict("3935+JCV Ampera Mutiara Malam, Jl. Blk. Olo, Kampung Jao, Padang Barat, Padang City, West Sumatra"),
    "Padang Barat",
  );
  assert.equal(
    resolveDistrict("Jl. Sawahan IV No.6, Sawahan, Padang Timur, Padang City, West Sumatra 25121"),
    "Padang Timur",
  );
});

test("membaca kelurahan yang hanya muncul sebagai nama jalan", () => {
  assert.equal(
    resolveDistrict("Jl. Rawang No.11 B, Kampung Jao, Padang Barat, Padang City, West Sumatra 25112"),
    "Padang Barat",
  );
  assert.equal(
    resolveDistrict("Jl. Dr. Moh. Hatta No.40, Anduring, Kuranji, Padang City, West Sumatra 25176"),
    "Kuranji",
  );
});

test("membaca varian penulisan kecamatan", () => {
  assert.equal(resolveDistrict("Bungo Pasang, Padang, Kota Padang, Sumatera Barat 25586"), "Koto Tangah");
  assert.equal(
    resolveDistrict("Jl. Padang - Painan No.KM 23, North Teluk Kabung, Bungus Teluk Kabung, Padang City"),
    "Bungus Teluk Kabung",
  );
  assert.equal(
    resolveDistrict("Air Terjun Ambun Suri, Limau Manis Selatan, Pauh, Limau Manis Sel., Padang"),
    "Pauh",
  );
});

test("alamat tanpa jejak wilayah mengembalikan null", () => {
  assert.equal(resolveDistrict(null), null);
  assert.equal(resolveDistrict(""), null);
  assert.equal(resolveDistrict("Jl. Cendrawasih Gg. Pantau No.17, Kost Kuning, Padang (Kota"), null);
});

test("normalizeDistrict menerima input bebas dari chat dan FE", () => {
  assert.equal(normalizeDistrict("padang barat"), "Padang Barat");
  assert.equal(normalizeDistrict("Barat"), "Padang Barat");
  assert.equal(normalizeDistrict("Kec. Padang Bar."), "Padang Barat");
  assert.equal(normalizeDistrict("padang tim"), "Padang Timur");
  assert.equal(normalizeDistrict("  BUNGUS TLK. KABUNG "), "Bungus Teluk Kabung");
  assert.equal(normalizeDistrict("kuranji"), "Kuranji");
  assert.equal(normalizeDistrict("kecamatan padang utara"), "Padang Utara");
  assert.equal(normalizeDistrict("kota padang"), null);
  assert.equal(normalizeDistrict("bandung"), null);
});

test("data seeder baru: hampir semua destinasi punya kecamatan", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, "../../../../prisma/seed-data/destinations.padang.primary.json");
  const data = JSON.parse(readFileSync(path, "utf8")) as {
    destinations: Array<{ address: string | null }>;
  };
  const resolved = data.destinations.filter((d) => resolveDistrict(d.address) !== null);
  assert.ok(data.destinations.length >= 400, "seeder harus memuat data gmaps baru");
  assert.ok(
    resolved.length / data.destinations.length >= 0.98,
    `cakupan kecamatan terlalu rendah: ${resolved.length}/${data.destinations.length}`,
  );
});
