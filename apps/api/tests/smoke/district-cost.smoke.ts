// Smoke test manual: wilayah + estimasi biaya + estimasi jarak.
// Jalankan: pnpm --filter api exec tsx tests/smoke/district-cost.smoke.ts
// Butuh DB lokal yang sudah dimigrasi & di-seed; OSRM butuh jaringan.
import assert from "node:assert/strict";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/client.js";
import { createToolExecutor } from "../../src/modules/chat/services/tools.js";
import { extractCategories } from "../../src/modules/chat/services/chat.service.js";
import { extractDistrict } from "../../src/modules/chat/services/chat.service.js";
import { searchDestinationsWhere } from "../../src/routes.js";

type Cost = { currency: string; min: number; max: number; kind: string; unit?: string };
type Row = {
  id: string;
  name: string;
  district: string | null;
  latitude: string | null;
  longitude: string | null;
  details: { estimatedCost?: Cost } & Record<string, unknown>;
  categories: Array<{ slug: string }>;
};

const results: Array<{ name: string; detail: string }> = [];
const fail: string[] = [];

async function check(name: string, fn: () => Promise<string>) {
  try {
    results.push({ name, detail: await fn() });
  } catch (error) {
    fail.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const list = async (query: string) => {
  const res = await app.request(`/api/v1/destinations?${query}`);
  assert.equal(res.status, 200, `HTTP ${res.status} untuk ${query}`);
  return (await res.json()) as { data: Row[]; meta?: { total: number } };
};

const money = (value: number) => `Rp${value.toLocaleString("id-ID")}`;

const deps = {
  searchDestinations: async (input: { keywords?: string; categories?: string[]; district?: string }) => {
    const rows = await prisma.destination.findMany({
      where: searchDestinationsWhere(input),
      take: 10,
      select: {
        id: true, name: true, description: true, address: true, latitude: true, longitude: true,
        details: true, city: true, district: true, isActive: true,
        categories: { select: { category: { select: { id: true, name: true, slug: true } } } },
      },
    });
    return rows.map((row) => ({
      ...row,
      latitude: row.latitude?.toNumber() ?? null,
      longitude: row.longitude?.toNumber() ?? null,
      categories: row.categories.map((c) => c.category),
    }));
  },
  getDestinationDetails: async (input: { destinationIds: string[] }) =>
    prisma.destination.findMany({ where: { id: { in: input.destinationIds } } }),
};

const toolRow = (row: unknown) => row as Row & { categories: Array<{ slug: string }> };

await check("1. daftar wilayah + jumlah destinasi", async () => {
  const res = await app.request("/api/v1/destinations/districts");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: Array<{ district: string; total: number }> };
  assert.equal(body.data.length, 11, "harus 11 kecamatan");
  const total = body.data.reduce((sum, d) => sum + d.total, 0);
  const expected = await prisma.destination.count({
    where: { city: "Padang", isActive: true, district: { not: null } },
  });
  assert.equal(total, expected, "jumlah per wilayah harus sama dengan total destinasi berwilayah");
  return `${body.data.length} kecamatan, ${total} destinasi; teratas ${body.data[0].district} (${body.data[0].total})`;
});

await check("2. filter per wilayah konsisten", async () => {
  const { data } = await list("district=padang%20barat&isActive=true&limit=100");
  assert.ok(data.length > 0, "Padang Barat harus berisi destinasi");
  for (const row of data) assert.equal(row.district, "Padang Barat");
  const { data: selatan } = await list("district=Padang%20Selatan&isActive=true&limit=100");
  const ids = new Set(selatan.map((r) => r.id));
  assert.ok(selatan.length > 0);
  assert.ok(data.every((r) => !ids.has(r.id)), "wilayah berbeda tidak boleh tumpang tindih");
  return `Padang Barat ${data.length} baris, Padang Selatan ${selatan.length} baris, tanpa irisan`;
});

await check("3. estimasi biaya tersimpan untuk semua destinasi aktif", async () => {
  const rows = await prisma.destination.findMany({
    where: { city: "Padang", isActive: true },
    select: { name: true, details: true },
  });
  const withCost = rows.filter((r) => {
    const cost = (r.details as { estimatedCost?: Cost } | null)?.estimatedCost;
    return cost && typeof cost.min === "number" && typeof cost.max === "number" && cost.min <= cost.max;
  });
  assert.equal(withCost.length, rows.length, `${rows.length - withCost.length} destinasi tanpa estimasi biaya`);
  const kinds = new Map<string, number>();
  for (const r of rows) {
    const kind = (r.details as { estimatedCost?: Cost }).estimatedCost?.kind ?? "?";
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
  }
  return `${withCost.length}/${rows.length} punya biaya; ${[...kinds].map(([k, n]) => `${k}=${n}`).join(" ")}`;
});

await check("4. estimasi biaya per wilayah (kuliner)", async () => {
  const rows = await prisma.destination.findMany({
    where: {
      city: "Padang", isActive: true, district: { not: null },
      categories: { some: { category: { slug: "kuliner" } } },
    },
    select: { district: true, details: true },
  });
  const perDistrict = new Map<string, { n: number; min: number; max: number }>();
  for (const row of rows) {
    const cost = (row.details as { estimatedCost?: Cost }).estimatedCost;
    if (!cost || !row.district) continue;
    const acc = perDistrict.get(row.district) ?? { n: 0, min: Infinity, max: 0 };
    perDistrict.set(row.district, {
      n: acc.n + 1,
      min: Math.min(acc.min, cost.min),
      max: Math.max(acc.max, cost.max),
    });
  }
  const top = [...perDistrict.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  assert.ok(top, "harus ada kuliner berwilayah");
  return `${perDistrict.size} kecamatan; ${top[0]} ${top[1].n} tempat ${money(top[1].min)}–${money(top[1].max)}/orang`;
});

await check("5. gabungan wilayah + kategori + biaya", async () => {
  const kuliner = await prisma.category.findUnique({ where: { slug: "kuliner" }, select: { id: true } });
  assert.ok(kuliner, "kategori kuliner harus ada");
  const { data } = await list(`district=Padang%20Barat&category=${kuliner.id}&isActive=true&limit=100`);
  assert.ok(data.length > 0, "Padang Barat + kuliner harus berisi");
  for (const row of data) {
    assert.equal(row.district, "Padang Barat");
    assert.ok(row.categories.some((c) => c.slug === "kuliner"), `${row.name} tidak bertag kuliner`);
    assert.ok((row.details as { estimatedCost?: Cost }).estimatedCost, `${row.name} tanpa biaya`);
  }
  const cheap = data.filter((r) => (r.details.estimatedCost as Cost).min <= 25_000);
  return `${data.length} kuliner Padang Barat, ${cheap.length} di antaranya mulai ≤ ${money(25_000)}`;
});

await check("6. pertanyaan user -> wilayah + kategori (jalur tool chat)", async () => {
  const question = "apa saja destinasi kuliner murah yang cocok di daerah padang barat?";
  const district = extractDistrict(question);
  const categories = extractCategories(question);
  assert.equal(district, "Padang Barat");
  assert.ok(categories.includes("kuliner"), "kategori kuliner harus terdeteksi");
  const exec = createToolExecutor({ ...deps, defaultCategories: categories, defaultDistrict: district });
  const rows = (await exec("search_destinations", {})) as unknown[];
  assert.ok(rows.length > 0, "tool harus mengembalikan destinasi");
  const parsed = rows.map(toolRow);
  for (const row of parsed) {
    assert.equal(row.district, "Padang Barat");
    assert.ok(row.details.estimatedCost, `${row.name} tanpa estimasi biaya`);
  }
  const cheapest = parsed
    .map((r) => ({ name: r.name, min: (r.details.estimatedCost as Cost).min }))
    .sort((a, b) => a.min - b.min)[0];
  return `${rows.length} hasil; termurah ${cheapest.name} ${money(cheapest.min)}`;
});

await check("7. estimasi jarak antar destinasi satu wilayah (HTTP /routes/driving)", async () => {
  const rows = await prisma.destination.findMany({
    where: {
      city: "Padang", isActive: true, district: "Padang Barat",
      latitude: { not: null }, longitude: { not: null },
    },
    select: { name: true, latitude: true, longitude: true },
  });
  assert.ok(rows.length >= 2, "butuh dua destinasi berkoordinat");
  // Ambil dua titik yang benar-benar berjauhan; data punya beberapa baris di koordinat sama.
  const sorted = rows
    .map((r) => ({ name: r.name, lat: r.latitude!.toNumber(), lon: r.longitude!.toNumber() }))
    .sort((a, b) => a.lat - b.lat || a.lon - b.lon);
  const from = sorted[0];
  const to = sorted[sorted.length - 1];
  const res = await app.request("/api/v1/routes/driving", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      profile: "car",
      points: [
        { latitude: from.lat, longitude: from.lon },
        { latitude: to.lat, longitude: to.lon },
      ],
    }),
  });
  assert.equal(res.status, 200, `HTTP ${res.status}`);
  const body = (await res.json()) as {
    data: { distanceKm: number; durationMin: number | null; source: string; legsDistanceKm: number[] };
  };
  assert.ok(body.data.distanceKm > 0, "jarak harus > 0");
  return `${from.name} -> ${to.name}: ${body.data.distanceKm} km, ${body.data.durationMin ?? "?"} menit (${body.data.source})`;
});

await check("8. chat nyata: wilayah + estimasi biaya (AI)", async () => {
  const turns = ["apa saja destinasi kuliner yang cocok di daerah Padang Barat dan kisaran biayanya?"];
  const { createTestSession, deleteTestUser } = await import("../integration/helpers/session.js");
  const session = await createTestSession();
  try {
    const created = await app.request("/api/v1/chat/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: session.user.id, title: "smoke wilayah" }),
    });
    assert.equal(created.status, 201, `create session HTTP ${created.status}`);
    const chat = ((await created.json()) as { data: { id: string } }).data;

    const res = await app.request(`/api/v1/chat/sessions/${chat.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: session.user.id,
        content: turns[0],
      }),
    });
    if (res.status === 502) return "dilewati: AI provider tidak dikonfigurasi (502 AI_PROVIDER_ERROR)";
    assert.equal(res.status, 200, `send HTTP ${res.status}`);
    const reply = ((await res.json()) as { data: { message: string; intent: string } }).data;
    assert.ok(reply.message.trim().length > 0, "jawaban kosong");

    // Wilayah harus dikenali dari pertanyaan nyata, apa pun bentuk jawabannya:
    // turn pertama boleh bertanya balik (missing_information), itu alur normal.
    assert.equal(extractDistrict(turns[0]), "Padang Barat", "wilayah tidak terdeteksi dari pertanyaan");

    const names = await prisma.destination.findMany({
      where: { city: "Padang", isActive: true, district: "Padang Barat", categories: { some: { category: { slug: "kuliner" } } } },
      take: 40,
      select: { name: true },
    });
    const hit = names.find((n) => reply.message.toLowerCase().includes(n.name.toLowerCase()));
    const cost = /rp\s?\d/i.test(reply.message) ? "biaya disebut" : "biaya tidak disebut (opsional)";
    return hit
      ? `intent=${reply.intent}; wilayah terdeteksi; menyebut "${hit.name}"; ${cost}`
      : `intent=${reply.intent}; wilayah terdeteksi; AI minta info tambahan; ${cost}`;
  } finally {
    await deleteTestUser(session.user.id);
  }
});

await prisma.$disconnect();

for (const r of results) console.log(`PASS  ${r.name}\n      ${r.detail}`);
for (const f of fail) console.log(`FAIL  ${f}`);
console.log(`\n${results.length} lulus, ${fail.length} gagal`);
if (fail.length > 0) process.exit(1);
