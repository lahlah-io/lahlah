import { HttpError } from "../../../shared/http/errors.js";
import { haversineMeters, isCoordinate, routeLineString } from "./route-geometry.js";

export type TripRequest = {
  city: "Padang";
  travelDate: string;
  startTime: string;
  endTime: string;
  categories: string[];
  transportMode: "walk" | "car" | "motorcycle";
  destinationCount?: number;
};

export type CandidateDestination = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  details: unknown;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const DEFAULT_DURATION_MINUTES = 60;

function parseMinutes(hhmm: string): number | null {
  if (!TIME_RE.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (h == null || m == null || h > 23 || m > 59) return null;
  return h * 60 + m;
}

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function isValidDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const [y, mo, d] = date.split("-").map(Number);
  if (y == null || mo == null || d == null) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function invalid(): never {
  throw new HttpError(422, "ITINERARY_REQUEST_INVALID", "Invalid itinerary request");
}

function parseRequest(req: unknown): TripRequest {
  if (!req || typeof req !== "object") invalid();
  const r = req as Record<string, unknown>;
  if (typeof r.travelDate !== "string" || !isValidDate(r.travelDate)) invalid();
  if (typeof r.startTime !== "string" || typeof r.endTime !== "string") invalid();
  const start = parseMinutes(r.startTime);
  const end = parseMinutes(r.endTime);
  if (start == null || end == null || end <= start) invalid();
  if (r.destinationCount !== undefined && (typeof r.destinationCount !== "number" || !Number.isInteger(r.destinationCount) || r.destinationCount <= 0)) invalid();
  return r as TripRequest;
}

function durationMinutes(details: unknown): number {
  if (details && typeof details === "object") {
    const v = (details as Record<string, unknown>).estimated_duration_minutes;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.floor(v);
  }
  return DEFAULT_DURATION_MINUTES;
}

function asCandidates(candidates: unknown): CandidateDestination[] {
  if (!Array.isArray(candidates)) return [];
  return candidates.filter((c): c is CandidateDestination => {
    if (!c || typeof c !== "object") return false;
    const r = c as Record<string, unknown>;
    return typeof r.id === "string" && typeof r.name === "string";
  });
}

/** Greedy nearest-neighbor, deterministic. Start: smallest id. Tie-break: shortest distance, then id. */
function orderByNearest(candidates: CandidateDestination[]): CandidateDestination[] {
  const remaining = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  if (remaining.length === 0) return [];
  const ordered: CandidateDestination[] = [remaining.shift()!];
  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1]!;
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    let bestId = "";
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i]!;
      const d = haversineMeters(current, cand);
      const dist = d == null ? Number.POSITIVE_INFINITY : d;
      if (dist < bestDist || (dist === bestDist && cand.id.localeCompare(bestId) < 0)) {
        bestDist = dist;
        bestIdx = i;
        bestId = cand.id;
      }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]!);
  }
  return ordered;
}

export function generateItinerary(req: unknown, candidatesInput: unknown) {
  const request = parseRequest(req);
  const start = parseMinutes(request.startTime)!;
  const end = parseMinutes(request.endTime)!;
  const requested = request.destinationCount;
  const orderedAll = orderByNearest(asCandidates(candidatesInput));
  const ordered = requested != null ? orderedAll.slice(0, requested) : orderedAll;

  // Schedule from details.estimated_duration_minutes (fallback DEFAULT_DURATION_MINUTES). No road/speed/opening-hours assumptions.
  const destinations: Array<{
    id: string;
    name: string;
    order: number;
    startTime: string;
    endTime: string;
    latitude: number | null;
    longitude: number | null;
  }> = [];
  let cursor = start;
  for (const c of ordered) {
    const dur = durationMinutes(c.details);
    const stopEnd = cursor + dur;
    if (stopEnd > end) break;
    destinations.push({
      id: c.id,
      name: c.name,
      order: destinations.length + 1,
      startTime: formatMinutes(cursor),
      endTime: formatMinutes(stopEnd),
      latitude: isCoordinate(c) ? c.latitude : null,
      longitude: isCoordinate(c) ? c.longitude : null,
    });
    cursor = stopEnd;
  }

  return {
    travelDate: request.travelDate,
    destinations,
    route: routeLineString(destinations),
  };
}
