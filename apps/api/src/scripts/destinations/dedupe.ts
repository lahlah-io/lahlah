import { isTokenSubset } from "./normalize.js";
import type { PlaceSource } from "./types.js";

export type DedupeCandidate = {
  id: string;
  canonicalKey: string | null;
  name: string;
  description: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  source: PlaceSource;
  createdAt: Date;
};

const PRIORITY: PlaceSource[] = ["geoapify", "firecrawl", "overpass", "wikidata", "manual"];
const EARTH_RADIUS_M = 6_371_000;

export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function nameSimilarity(a: string, b: string): number {
  const left = new Set(a.split(" "));
  const right = new Set(b.split(" "));
  const shared = [...left].filter((token) => right.has(token)).length;
  return shared / new Set([...left, ...right]).size;
}

export function shouldMergeDuplicate(a: DedupeCandidate, b: DedupeCandidate): boolean {
  if (!a.canonicalKey || !b.canonicalKey) return false;
  // isTokenSubset already rejects a name against its own extension, such as
  // "Pantai Padang" against "Pantai Padang Selatan", so no separate guard is needed.
  // The redundant guards below are kept so the safety intent is documented where read.
  if (a.canonicalKey === b.canonicalKey) return false;
  if (isTokenSubset(a.canonicalKey, b.canonicalKey)) return false;
  if (a.latitude === null || a.longitude === null) return false;
  if (b.latitude === null || b.longitude === null) return false;
  if (distanceMeters(a.latitude, a.longitude, b.latitude, b.longitude) > 150) return false;
  return nameSimilarity(a.canonicalKey, b.canonicalKey) >= 0.3;
}

function completeness(item: DedupeCandidate): number {
  return [item.description, item.address, item.latitude, item.longitude, item.imageUrl].filter(
    (value) => value !== null,
  ).length;
}

export function pickSurvivor(
  a: DedupeCandidate,
  b: DedupeCandidate,
): { survivor: DedupeCandidate; loser: DedupeCandidate } {
  const byCompleteness = completeness(b) - completeness(a);
  if (byCompleteness !== 0) {
    return byCompleteness > 0 ? { survivor: b, loser: a } : { survivor: a, loser: b };
  }

  const byPriority = PRIORITY.indexOf(a.source) - PRIORITY.indexOf(b.source);
  if (byPriority !== 0) {
    return byPriority > 0 ? { survivor: b, loser: a } : { survivor: a, loser: b };
  }

  return a.createdAt <= b.createdAt
    ? { survivor: a, loser: b }
    : { survivor: b, loser: a };
}
