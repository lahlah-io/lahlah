import type { RoutePoint, RouteProfile, RouteResult } from "../schemas/routing.schema.js";
import type { RouteCache } from "../repositories/route-cache.repository.js";

type FetchFn = typeof fetch;

type RoutingServiceDeps = {
  osrmBaseUrl: string;
  timeoutMs: number;
  userAgent?: string;
  fetchFn?: FetchFn;
  cache: RouteCache;
};

/** Motorcycle durations are scaled from car routing until a motor profile is self-hosted. */
export const MOTORCYCLE_DURATION_FACTOR = 1.2;

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

export function routeCacheKey(profile: RouteProfile, points: RoutePoint[]): string {
  return `${profile}:` + points.map((p) => `${round5(p.longitude)},${round5(p.latitude)}`).join(";");
}

function osrmProfileName(profile: RouteProfile): string {
  return profile === "foot" ? "foot" : "driving";
}

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Straight-line distance in km between two points (Haversine). */
function haversineKm(a: RoutePoint, b: RoutePoint): number {
  const R = 6371;
  const h =
    Math.sin(toRad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(toRad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Total straight-line distance in km (Haversine); only for fallback metadata. */
export function fallbackKm(points: RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineKm(points[i - 1]!, points[i]!);
  return Math.round(total * 10) / 10;
}

/** Straight-line distance per consecutive pair in km. */
function fallbackLegsKm(points: RoutePoint[]): number[] {
  const legs: number[] = [];
  for (let i = 1; i < points.length; i++) legs.push(Math.round(haversineKm(points[i - 1]!, points[i]!) * 1000) / 1000);
  return legs;
}

async function fetchWithTimeout(fetchFn: FetchFn, url: string, timeoutMs: number, userAgent: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { signal: controller.signal, headers: { "user-agent": userAgent } });
  } finally {
    clearTimeout(timer);
  }
}

export type RoutingService = {
  getRoute: (input: { points: RoutePoint[]; profile: RouteProfile }) => Promise<RouteResult>;
};

export function createRoutingService(deps: RoutingServiceDeps): RoutingService {
  const userAgent = deps.userAgent ?? "Lahlah/1.0";
  const fetchFn = deps.fetchFn ?? fetch;

  async function fetchOsrm(
    osrmProfile: string,
    path: string,
  ): Promise<{ distanceKm: number; durationMin: number; coordinates: Array<[number, number]>; legsDistanceKm: number[] }> {
    const url = `${deps.osrmBaseUrl.replace(/\/+$/, "")}/route/v1/${osrmProfile}/${path}?overview=full&geometries=geojson`;
    let res: Response;
    try {
      res = await fetchWithTimeout(fetchFn, url, deps.timeoutMs, userAgent);
    } catch (err) {
      throw new Error(err instanceof Error && err.name === "AbortError" ? `OSRM timeout ${deps.timeoutMs / 1000} dtk` : "OSRM tidak terjangkau");
    }
    if (res.status === 429 || res.status >= 500) {
      // Single retry for rate-limit/transient failures.
      await new Promise((r) => setTimeout(r, 400));
      try {
        res = await fetchWithTimeout(fetchFn, url, deps.timeoutMs, userAgent);
      } catch (err) {
        throw new Error(err instanceof Error && err.name === "AbortError" ? `OSRM timeout ${deps.timeoutMs / 1000} dtk` : "OSRM tidak terjangkau");
      }
    }
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const body = (await res.json()) as {
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: unknown };
        legs?: Array<{ distance?: number }>;
      }>;
    };
    const route = body.routes?.[0];
    const coordinates = route?.geometry?.coordinates;
    if (!route || !Array.isArray(coordinates) || typeof route.distance !== "number" || typeof route.duration !== "number") {
      throw new Error("OSRM tidak mengembalikan rute");
    }
    return {
      distanceKm: Math.round((route.distance / 1000) * 10) / 10,
      durationMin: Math.round(route.duration / 60),
      coordinates: coordinates as Array<[number, number]>,
      legsDistanceKm: (route.legs ?? [])
        .filter((leg): leg is { distance: number } => typeof leg.distance === "number")
        .map((leg) => Math.round((leg.distance / 1000) * 1000) / 1000),
    };
  }

  async function getRoute(input: { points: RoutePoint[]; profile: RouteProfile }): Promise<RouteResult> {
    const key = routeCacheKey(input.profile, input.points);
    const cached = deps.cache.get(key);
    if (cached) return cached;

    const path = input.points.map((p) => `${round5(p.longitude)},${round5(p.latitude)}`).join(";");

    try {
      const osrm = await fetchOsrm(osrmProfileName(input.profile), path);
      const estimated = input.profile === "motorcycle";
      const result: RouteResult = {
        source: "osrm",
        distanceKm: osrm.distanceKm,
        durationMin: estimated ? Math.max(1, Math.round(osrm.durationMin * MOTORCYCLE_DURATION_FACTOR)) : osrm.durationMin,
        estimated,
        legsDistanceKm: osrm.legsDistanceKm,
        geometry: { type: "LineString", coordinates: osrm.coordinates },
      };
      deps.cache.set(key, result);
      return result;
    } catch (err) {
      return {
        source: "fallback",
        distanceKm: fallbackKm(input.points),
        durationMin: null,
        estimated: input.profile === "motorcycle",
        error: err instanceof Error ? err.message : "gagal",
        legsDistanceKm: fallbackLegsKm(input.points),
        geometry: { type: "LineString", coordinates: input.points.map((p) => [p.longitude, p.latitude]) },
      };
    }
  }

  return { getRoute };
}
