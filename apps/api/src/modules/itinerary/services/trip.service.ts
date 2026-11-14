import { HttpError } from "../../../shared/http/errors.js";
import type { ActiveTripRecord } from "../repositories/trip.repository.js";
import * as tripRepository from "../repositories/trip.repository.js";

/** Stops of the newest version (batch identity = identical `createdAt`). */
function currentDestinationIds(trip: ActiveTripRecord): string[] {
  const latest = trip.destinations.reduce<Date | null>(
    (max, row) => (!max || row.createdAt > max ? row.createdAt : max),
    null,
  );
  if (!latest) return [];
  return [
    ...new Set(
      trip.destinations
        .filter((row) => row.createdAt.getTime() === latest.getTime())
        .map((row) => row.destinationId),
    ),
  ];
}

async function toActiveTrip(userId: string, trip: ActiveTripRecord) {
  const destinationIds = currentDestinationIds(trip);
  const checked = await tripRepository.countUserCheckpoints(userId, trip.id, destinationIds);
  return {
    data: {
      tripId: trip.id,
      title: trip.title,
      isPublic: trip.isPublic,
      total: destinationIds.length,
      checked,
      updatedAt: trip.updatedAt,
    },
  };
}

export function createTripService() {
  return {
    async getActive(input: { userId: string }) {
      const trip = await tripRepository.findActiveTrip(input.userId);
      if (!trip) throw new HttpError(404, "NO_ACTIVE_TRIP", "No active trip");
      return toActiveTrip(input.userId, trip);
    },

    /** Idempotent: any other active trip of this user is cleared. */
    async activate(input: { userId: string; tripId: string }) {
      if (!(await tripRepository.findTripMembership(input.userId, input.tripId))) {
        throw new HttpError(403, "FORBIDDEN", "Trip membership required");
      }
      await tripRepository.setActiveTrip(input.userId, input.tripId);
      const trip = await tripRepository.findActiveTrip(input.userId);
      if (!trip) throw new HttpError(404, "TRIP_NOT_FOUND", "Trip not found");
      return toActiveTrip(input.userId, trip);
    },

    async deactivate(input: { userId: string; tripId: string }) {
      if (!(await tripRepository.findTripMembership(input.userId, input.tripId))) {
        throw new HttpError(403, "FORBIDDEN", "Trip membership required");
      }
      await tripRepository.clearActiveTrip(input.userId, input.tripId);
      return { data: { tripId: input.tripId, isActive: false } };
    },
  };
}

export type TripService = ReturnType<typeof createTripService>;
