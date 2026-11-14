import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { RawPlace } from "../types.js";

type CsvRow = Record<string, string>;

const NAME_KEYS = ["name", "title"];
const LAT_KEYS = ["lat", "latitude"];
const LNG_KEYS = ["long", "lng", "lon", "longitude"];
const ADDRESS_KEYS = ["address", "full_address", "complete_address"];
const CATEGORY_KEYS = ["category", "categories"];
const LINK_KEYS = ["link", "url", "cid", "place_id", "placeid", "data_id", "dataid"];
const DESC_KEYS = ["description", "about", "short_description"];

function pick(row: CsvRow, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value == null) continue;
    const trimmed = value.trim();
    if (trimmed !== "") return trimmed;
  }
  return undefined;
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function splitCategories(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[|;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseCsv(content: string): CsvRow[] {
  const text = content.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  if (rows.length === 0) return [];

  const headers = rows[0]!.map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((cells) => {
    const out: CsvRow = {};
    headers.forEach((h, idx) => {
      out[h] = cells[idx] ?? "";
    });
    return out;
  });
}

function normalizeRows(rows: unknown[], categorySlugs: string[]): RawPlace[] {
  const slugHints = categorySlugs.filter(Boolean);
  return rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = Object.fromEntries(
      Object.entries(item as Record<string, unknown>).map(([k, v]) => [
        k.toLowerCase(),
        v == null ? "" : String(v),
      ]),
    ) as CsvRow;

    const name = pick(row, NAME_KEYS);
    if (!name) return [];
    const latitude = parseNumber(pick(row, LAT_KEYS));
    const longitude = parseNumber(pick(row, LNG_KEYS));
    // keep rows even if coords missing? normalize can keep, but be tolerant: include
    const address = pick(row, ADDRESS_KEYS) ?? null;
    const rawCat = pick(row, CATEGORY_KEYS);
    const rawCategories = [...new Set([...slugHints, ...splitCategories(rawCat)])];
    const link = pick(row, ["link", "url"]);
    const sourceId = pick(row, LINK_KEYS) ?? name;
    const description = pick(row, DESC_KEYS) ?? null;

    const details: Record<string, unknown> = { provider: "gosom" };
    if (link) details.link = link;
    else if (sourceId && sourceId !== name) details.id = sourceId;
    if (rawCat) details.rawCategory = rawCat;

    const place: RawPlace = {
      source: "manual",
      sourcePlaceId: sourceId,
      name,
      description,
      address,
      latitude,
      longitude,
      imageUrl: null,
      rawCategories,
      details,
    };
    return [place];
  });
}

export function parseGosomResults(
  content: string,
  format: "csv" | "json",
  categorySlugs: string[],
): RawPlace[] {
  if (format === "json") {
    try {
      const parsed = JSON.parse(content) as unknown;
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return normalizeRows(rows, categorySlugs);
    } catch {
      return [];
    }
  }
  return normalizeRows(parseCsv(content), categorySlugs);
}

export async function loadGosomPlacesFromDir(
  dirPath: string,
  format: "csv" | "json",
  categorySlugs: string[],
): Promise<RawPlace[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const ext = format === "json" ? ".json" : ".csv";
  const files = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(ext))
    .map((e) => path.join(dirPath, e.name));
  const results: RawPlace[] = [];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    results.push(...parseGosomResults(content, format, categorySlugs));
  }
  return results;
}
