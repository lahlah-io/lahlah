import { prisma } from "../db/client.js";
import { env } from "../env.js";
import { createRouteCache, createRoutingService } from "../modules/routing/index.js";
import { findDestinationCoords } from "../modules/itinerary/repositories/itinerary.repository.js";
import { tripLegDistancesM, type TripRouteFn } from "../shared/geo/trip-distance.js";

type BatchRow = { id: string; destinationId: string; distance: number | null };

/**
 * Fills `trip_destinations.distance` for batches written before road distance
 * existed. One routing call per batch; batches that already have a distance, or
 * whose stops lack coordinates, are left alone. Safe to run repeatedly.
 */
export async function backfillTripDistances(deps: { getRoute: TripRouteFn }) {
  const rows = await prisma.tripDestination.findMany({
    where: { distance: null },
    orderBy: [{ tripId: "asc" }, { createdAt: "asc" }, { visitAt: "asc" }],
    select: { id: true, tripId: true, destinationId: true, createdAt: true, distance: true },
  });

  const batches = new Map<string, BatchRow[]>();
  for (const row of rows) {
    const key = `${row.tripId}:${row.createdAt.getTime()}`;
    const batch = batches.get(key) ?? [];
    batch.push({ id: row.id, destinationId: row.destinationId, distance: row.distance });
    batches.set(key, batch);
  }

  let filledBatches = 0;
  let filledRows = 0;
  for (const batch of batches.values()) {
    // A single-stop batch has no leg, so it stays null forever.
    if (batch.length < 2) continue;
    const coords = await findDestinationCoords(batch.map((row) => row.destinationId));
    const legs = await tripLegDistancesM(
      batch.map((row) => coords.get(row.destinationId) ?? null),
      deps.getRoute,
    );
    if (!legs) continue;
    await prisma.$transaction(
      batch.slice(1).map((row, index) =>
        prisma.tripDestination.update({ where: { id: row.id }, data: { distance: legs[index] } }),
      ),
    );
    filledBatches += 1;
    filledRows += legs.length;
  }
  return { batches: filledBatches, rows: filledRows };
}

if (process.argv[1]?.endsWith("backfill-trip-distances.ts")) {
  const routing = createRoutingService({
    osrmBaseUrl: env.OSRM_BASE_URL,
    timeoutMs: env.OSRM_TIMEOUT_MS,
    cache: createRouteCache({ ttlMs: env.OSRM_CACHE_TTL_HOURS * 3_600_000 }),
  });
  const result = await backfillTripDistances({ getRoute: routing.getRoute });
  console.log(`Backfilled ${result.batches} batch(es), ${result.rows} row(s).`);
  await prisma.$disconnect();
}
