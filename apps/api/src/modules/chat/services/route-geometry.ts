export type Coordinate = { latitude: number; longitude: number };

/** Straight-line (Haversine) distance in meters. No road/speed assumptions. */
export function haversineMeters(a: unknown, b: unknown): number | null {
  if (!isCoordinate(a) || !isCoordinate(b)) return null;
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function isCoordinate(v: unknown): v is Coordinate {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return isValidCoordinate(r.latitude, r.longitude);
}

/** GeoJSON LineString from valid points in order; coordinates are [longitude, latitude]. Null if < 2 valid points. */
export function routeLineString(
  points: unknown[],
): { type: "LineString"; coordinates: [number, number][] } | null {
  const coords: [number, number][] = [];
  for (const p of points) {
    if (isCoordinate(p)) coords.push([p.longitude, p.latitude]);
  }
  return coords.length >= 2 ? { type: "LineString", coordinates: coords } : null;
}
