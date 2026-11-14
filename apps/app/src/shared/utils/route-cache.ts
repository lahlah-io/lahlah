import { decodePolyline } from "./polyline";

const CACHE_PREFIX = "lahlah:route:v1";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHED_ROUTES = 12;

type CachedRoute = {
  encoded: string;
  savedAt: number;
};

function getStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** FNV-1a 32-bit, cukup untuk membedakan kombinasi waypoint. */
function hashSignature(signature: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < signature.length; index += 1) {
    hash ^= signature.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

export function buildRouteCacheKey(waypoints: [number, number][]): string {
  const signature = waypoints
    .map(([longitude, latitude]) => {
      return `${longitude.toFixed(5)},${latitude.toFixed(5)}`;
    })
    .join(";");

  return `${CACHE_PREFIX}:driving:${hashSignature(signature)}`;
}

function readSavedAt(storage: Storage, key: string): number | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CachedRoute>;
    return typeof parsed.savedAt === "number" ? parsed.savedAt : null;
  } catch {
    return null;
  }
}

/** Buang entri kedaluwarsa dan sisakan beberapa rute terbaru saja. */
function pruneCache(storage: Storage) {
  const entries: { key: string; savedAt: number }[] = [];
  const now = Date.now();

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(`${CACHE_PREFIX}:`)) continue;

    const savedAt = readSavedAt(storage, key);
    if (savedAt === null || now - savedAt > CACHE_TTL_MS) {
      storage.removeItem(key);
      continue;
    }

    entries.push({ key, savedAt });
  }

  entries.sort((left, right) => left.savedAt - right.savedAt);

  while (entries.length >= MAX_CACHED_ROUTES) {
    const oldest = entries.shift();
    if (!oldest) break;
    storage.removeItem(oldest.key);
  }
}

/** Mengembalikan koordinat rute dari cache, atau `null` bila tidak ada/kadaluarsa. */
export function readCachedRoute(key: string): [number, number][] | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CachedRoute>;
    if (
      typeof parsed.encoded !== "string" ||
      typeof parsed.savedAt !== "number"
    ) {
      storage.removeItem(key);
      return null;
    }

    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) {
      storage.removeItem(key);
      return null;
    }

    const coordinates = decodePolyline(parsed.encoded);
    return coordinates.length >= 2 ? coordinates : null;
  } catch {
    return null;
  }
}

/** Menyimpan geometri ter-encode; kegagalan kuota diabaikan agar peta tetap jalan. */
export function writeCachedRoute(key: string, encoded: string) {
  const storage = getStorage();
  if (!storage) return;

  try {
    pruneCache(storage);
    const entry: CachedRoute = { encoded, savedAt: Date.now() };
    storage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage penuh atau diblokir: cache bersifat opsional.
  }
}
