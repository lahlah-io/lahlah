export type TripRoutePoint = { latitude: number; longitude: number };

/** Minimal routing surface the trip distance needs; matches the routing service result. */
export type TripRouteFn = (input: { points: TripRoutePoint[]; profile: "car" }) => Promise<{
  source: string;
  legsDistanceKm: number[];
}>;

/**
 * Road distance per leg in whole meters, aligned with the stop order.
 * Returns null when routing is unavailable, any stop lacks coordinates, or the
 * engine only produced a straight line: a fake road distance is worse than none,
 * and a backfill can fill it later.
 */
export async function tripLegDistancesM(
  points: Array<TripRoutePoint | null>,
  getRoute?: TripRouteFn,
): Promise<number[] | null> {
  if (!getRoute || points.length < 2 || points.some((point) => point == null)) return null;
  const route = await getRoute({ points: points as TripRoutePoint[], profile: "car" });
  if (route.source === "fallback" || route.legsDistanceKm.length !== points.length - 1) return null;
  return route.legsDistanceKm.map((km) => Math.round(km * 1000));
}
