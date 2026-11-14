// Wilayah administratif Kota Padang. Dipakai seeder, filter API, dan chat:
// alamat Google Maps hanya kadang menyebut "Kec. X", sisanya harus ditebak dari kelurahan.

export const PADANG_DISTRICTS = [
  "Bungus Teluk Kabung",
  "Koto Tangah",
  "Kuranji",
  "Lubuk Begalung",
  "Lubuk Kilangan",
  "Nanggalo",
  "Padang Barat",
  "Padang Selatan",
  "Padang Timur",
  "Padang Utara",
  "Pauh",
] as const;

export type PadangDistrict = (typeof PADANG_DISTRICTS)[number];

const KELURAHAN: Record<PadangDistrict, string[]> = {
  "Bungus Teluk Kabung": [
    "Bungus Barat", "Bungus Selatan", "Bungus Timur",
    "Teluk Kabung Selatan", "Teluk Kabung Tengah", "Teluk Kabung Utara",
  ],
  "Koto Tangah": [
    "Air Pacah", "Balai Gadang", "Batang Kabung Ganting", "Batipuh Panjang", "Bungo Pasang",
    "Dadok Tunggul Hitam", "Koto Panjang Ikua Koto", "Koto Pulai", "Lubuk Buaya", "Lubuk Minturun",
    "Padang Sarai", "Parupuk Tabing", "Pasir Nan Tigo",
  ],
  Kuranji: [
    "Ampang", "Anduring", "Gunung Sarik", "Kalumbuk", "Korong Gadang", "Kuranji",
    "Lubuk Lintah", "Pasar Ambacang", "Sungai Sapih",
  ],
  "Lubuk Begalung": [
    "Banuaran", "Batung Taba", "Cengkeh", "Gates", "Gurun Laweh", "Kampung Baru", "Kampung Jua",
    "Koto Baru", "Lubuk Begalung", "Pagambiran Ampalu", "Pampangan", "Parak Laweh Pulau Air",
    "Tanjung Saba Pitameh", "Tanah Sirah Piai", "Tanjung Aur",
  ],
  "Lubuk Kilangan": [
    "Bandar Buat", "Batu Gadang", "Beringin", "Indarung", "Koto Lalang", "Padang Besi", "Tarantang",
  ],
  Nanggalo: [
    "Gurun Laweh", "Kampung Lapai", "Kampung Olo", "Kurao Pagang", "Surau Gadang",
    "Tabing Banda Gadang",
  ],
  "Padang Barat": [
    "Belakang Tangsi", "Berok Nipah", "Flamboyan Baru", "Kampung Jao", "Kampung Pondok", "Olo",
    "Padang Pasir", "Purus", "Rimbo Kaluang", "Ujung Gurun",
  ],
  "Padang Selatan": [
    "Air Manis", "Alang Laweh", "Batang Arau", "Belakang Pondok", "Bukit Gado-Gado", "Mato Aie",
    "Pasa Gadang", "Ranah Parak Rumbio", "Rawang", "Seberang Padang", "Seberang Palinggam",
    "Teluk Bayur",
  ],
  "Padang Timur": [
    "Andalas", "Ganting Parak Gadang", "Jati", "Jati Baru", "Kubu Dalam Parak Karakah",
    "Kubu Marapalam", "Parak Gadang Timur", "Sawahan", "Sawahan Timur", "Simpang Haru",
  ],
  "Padang Utara": [
    "Air Tawar Barat", "Air Tawar Timur", "Alai Parak Kopi", "Gunung Pangilun", "Lolong Belanti",
    "Ulak Karang Selatan", "Ulak Karang Utara",
  ],
  Pauh: [
    "Binuang Kampuang Dalam", "Cupak Tangah", "Kapalo Koto", "Koto Luar", "Lambung Bukit",
    "Limau Manis", "Limau Manis Selatan", "Piai Tangah", "Pisang",
  ],
};

/** Nama kecamatan yang aman dicocokkan di alamat: "Sumatera Barat" bukan Padang Barat. */
const STRONG_ALIASES: Record<PadangDistrict, string[]> = {
  "Bungus Teluk Kabung": ["bungus teluk kabung", "bungus tlk kabung", "tlk kabung", "teluk kabung", "bungus"],
  "Koto Tangah": ["koto tangah"],
  Kuranji: ["kuranji"],
  "Lubuk Begalung": ["lubuk begalung"],
  "Lubuk Kilangan": ["lubuk kilangan"],
  Nanggalo: ["nanggalo"],
  "Padang Barat": ["padang barat", "padang bar"],
  "Padang Selatan": ["padang selatan", "padang sel"],
  "Padang Timur": ["padang timur", "padang tim"],
  "Padang Utara": ["padang utara", "padang ut"],
  Pauh: ["pauh"],
};

/** Arah mata angin hanya untuk input chat ("di barat dong"), tidak untuk alamat. */
const WEAK_ALIASES: Record<PadangDistrict, string[]> = {
  "Bungus Teluk Kabung": [],
  "Koto Tangah": [],
  Kuranji: [],
  "Lubuk Begalung": [],
  "Lubuk Kilangan": [],
  Nanggalo: [],
  "Padang Barat": ["barat"],
  "Padang Selatan": ["selatan"],
  "Padang Timur": ["timur"],
  "Padang Utara": ["utara"],
  Pauh: [],
};

const clean = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type Entry = { district: PadangDistrict; alias: string };

const entries = (table: Record<PadangDistrict, string[]>): Entry[] =>
  PADANG_DISTRICTS.flatMap((district) => table[district].map((alias) => ({ district, alias })))
    // Alias terpanjang dulu supaya "padang barat" menang atas "barat".
    .sort((a, b) => b.alias.length - a.alias.length);

const STRONG = entries(STRONG_ALIASES);
const WEAK = entries(WEAK_ALIASES);
const KELURAHAN_ENTRIES: Entry[] = PADANG_DISTRICTS.flatMap((district) =>
  KELURAHAN[district].map((name) => ({ district, alias: clean(name) })),
).sort((a, b) => b.alias.length - a.alias.length);

const hasAlias = (text: string, alias: string) =>
  new RegExp(`(?:^| )${alias.replace(/ /g, " ")}(?: |$)`).test(text);

function firstMatch(text: string, list: Entry[]): PadangDistrict | null {
  for (const entry of list) if (hasAlias(text, entry.alias)) return entry.district;
  return null;
}

/** Input bebas dari chat atau query string: "padang barat", "barat", "Kec. Padang Bar.". */
export function normalizeDistrict(value: string | null | undefined): PadangDistrict | null {
  if (!value) return null;
  const text = clean(value).replace(/\b(?:kecamatan|kec)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return firstMatch(text, STRONG) ?? firstMatch(text, WEAK);
}

/**
 * Alamat Google Maps: pakai label "Kec." lebih dulu, lalu nama kecamatan/kelurahan
 * yang disebut di alamat. Arah mata angin tidak dipakai karena "Sumatera Barat"
 * ada di hampir semua alamat Padang.
 */
export function resolveDistrict(address: string | null | undefined): PadangDistrict | null {
  if (!address) return null;
  const labelled = /kec\.?\s*([^,]+)/i.exec(address);
  if (labelled?.[1]) {
    const fromLabel = firstMatch(clean(labelled[1]), STRONG);
    if (fromLabel) return fromLabel;
  }
  const text = clean(address);
  return firstMatch(text, STRONG) ?? firstMatch(text, KELURAHAN_ENTRIES);
}
