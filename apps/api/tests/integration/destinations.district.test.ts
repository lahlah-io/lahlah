import assert from "node:assert/strict";
import { test } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/client.js";
import { PADANG_DISTRICTS } from "../../src/shared/geo/padang-district.js";

const seeded = async () =>
  (await prisma.destination.count({ where: { city: "Padang", isActive: true } })) > 0;

test("GET /destinations/districts mengelompokkan katalog aktif per kecamatan", async () => {
  if (!(await seeded())) return;
  const res = await app.request("/api/v1/destinations/districts");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: Array<{ district: string; total: number }> };
  assert.ok(body.data.length > 0, "harus ada minimal satu kecamatan");
  for (const row of body.data) {
    assert.ok(PADANG_DISTRICTS.includes(row.district as (typeof PADANG_DISTRICTS)[number]));
    assert.ok(row.total > 0);
  }
  const totals = body.data.map((r) => r.total);
  assert.deepEqual(totals, [...totals].sort((a, b) => b - a), "urut total menurun");

  const expected = await prisma.destination.count({
    where: { city: "Padang", isActive: true, district: { not: null } },
  });
  assert.equal(
    body.data.reduce((sum, r) => sum + r.total, 0),
    expected,
    "total per kecamatan harus menjumlah ke seluruh destinasi berwilayah",
  );
});

test("GET /destinations?district= memfilter dan menormalkan nama bebas", async () => {
  if (!(await seeded())) return;
  const res = await app.request("/api/v1/destinations?district=padang%20barat&isActive=true&limit=100");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: Array<{ district: string | null }> };
  assert.ok(body.data.length > 0, "Padang Barat harus punya destinasi");
  for (const row of body.data) assert.equal(row.district, "Padang Barat");

  const unknown = await app.request("/api/v1/destinations?district=bandung");
  assert.equal(unknown.status, 400);
});

test("filter wilayah tetap jalan bersama filter kategori", async () => {
  if (!(await seeded())) return;
  const res = await app.request(
    "/api/v1/destinations?district=Padang%20Barat&category=00000000-0000-4000-8000-000000000000",
  );
  assert.equal(res.status, 200);
});
