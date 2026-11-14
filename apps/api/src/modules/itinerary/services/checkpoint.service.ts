import { HttpError } from "../../../shared/http/errors.js";
import { haversineMeters } from "../../../shared/geo/distance.js";
import * as checkpointRepository from "../repositories/checkpoint.repository.js";
import { checkUserTripAccess } from "../repositories/trip.repository.js";
import * as tripRepository from "../repositories/itinerary.repository.js";

/** Device must be within this distance of the destination. */
export const CHECKPOINT_RADIUS_M = 100;
/** Readings worse than this are rejected instead of trusted. */
export const MAX_ACCURACY_M = 100;

function coords(row: { latitude: unknown; longitude: unknown }) {
  if (row.latitude == null || row.longitude == null) return null;
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function toPayload(row: checkpointRepository.CheckpointRow, destinationId: string, destinationName: string) {
  return {
    id: row.id,
    tripDestinationId: row.tripDestinationId,
    destinationId,
    destinationName,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracyMeters: row.accuracyMeters,
    distanceMeters: row.distanceMeters,
    note: row.note,
    imageUrl: row.imageUrl,
    checkedAt: row.createdAt,
  };
}

export function createCheckpointService() {
  return {
    async checkIn(input: {
      tripId: string;
      userId: string;
      tripDestinationId: string;
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      note?: string;
      imageUrl?: string;
    }) {
      if (!(await checkUserTripAccess(input.userId, input.tripId))) {
        throw new HttpError(403, "FORBIDDEN", "Trip membership required");
      }

      const target = await checkpointRepository.findCheckpointTarget(
        input.tripId,
        input.tripDestinationId,
      );
      if (!target) {
        throw new HttpError(404, "TRIP_DESTINATION_NOT_FOUND", "Trip destination not found");
      }

      const destinationCoords = coords(target.destination);
      if (!destinationCoords) {
        throw new HttpError(422, "DESTINATION_NO_COORDS", "Destination has no coordinates");
      }

      if (input.accuracyMeters != null && input.accuracyMeters > MAX_ACCURACY_M) {
        throw new HttpError(
          422,
          "LOCATION_INACCURATE",
          `Location accuracy is ${Math.round(input.accuracyMeters)} m; maximum is ${MAX_ACCURACY_M} m`,
        );
      }

      const distanceMeters = Math.round(
        haversineMeters(
          { latitude: input.latitude, longitude: input.longitude },
          destinationCoords,
        ),
      );
      if (distanceMeters > CHECKPOINT_RADIUS_M) {
        throw new HttpError(
          422,
          "CHECKPOINT_TOO_FAR",
          `You are ${distanceMeters} m from ${target.destination.name}; must be within ${CHECKPOINT_RADIUS_M} m`,
        );
      }

      const payloadFor = (row: checkpointRepository.CheckpointRow) =>
        toPayload(row, target.destinationId, target.destination.name);

      const existing = await checkpointRepository.findCheckpoint(input.tripDestinationId, input.userId);
      if (existing) return { created: false, data: payloadFor(existing) };

      try {
        const created = await checkpointRepository.createCheckpoint({ ...input, distanceMeters });
        return { created: true, data: payloadFor(created) };
      } catch (error) {
        // Unique constraint: another request won the race.
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
          const row = await checkpointRepository.findCheckpoint(
            input.tripDestinationId,
            input.userId,
          );
          if (row) return { created: false, data: payloadFor(row) };
        }
        throw error;
      }
    },

    async list(input: { tripId: string; userId: string }) {
      const trip = await tripRepository.findById(input.tripId);
      if (!trip) throw new HttpError(404, "TRIP_NOT_FOUND", "Trip not found");
      if (!(await checkUserTripAccess(input.userId, input.tripId))) {
        throw new HttpError(403, "FORBIDDEN", "Trip membership required");
      }

      const batches = tripRepository.groupBatches(trip.destinations);
      const current = batches[batches.length - 1]?.rows ?? [];
      const rows = await checkpointRepository.listTripCheckpoints(input.tripId);
      const checkedIds = new Set(rows.map((row) => row.tripDestination.destinationId));

      return {
        data: {
          tripId: input.tripId,
          total: current.length,
          checked: current.filter((row) => checkedIds.has(row.destinationId)).length,
          items: rows.map((row) =>
            toPayload(row, row.tripDestination.destinationId, row.tripDestination.destination.name),
          ),
        },
      };
    },
  };
}

export type CheckpointService = ReturnType<typeof createCheckpointService>;
