import type { ItineraryDestination, Trip } from "@/shared/types/itinerary";

/** Radius check-in; di luar ini user dianggap belum sampai destinasi. */
export const CHECKPOINT_RADIUS_METERS = 200;

type Coordinates = { latitude: number; longitude: number };

/** Jarak haversine dalam meter antara `[longitude, latitude]` dan koordinat. */
export function distanceMeters(
  from: [number, number],
  to: Coordinates,
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(to.latitude - from[1]);
  const dLon = toRad(to.longitude - from[0]);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from[1])) *
      Math.cos(toRad(to.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

export function formatDistance(meters: number): string {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`;
}

/** Destinasi terdekat di trip ini, dipakai untuk mencocokkan hasil GPS. */
export function findNearestDestination(
  trip: Trip,
  coordinates: Coordinates,
): { destination: ItineraryDestination; distance: number } | null {
  let nearest: { destination: ItineraryDestination; distance: number } | null =
    null;

  for (const day of trip.days) {
    for (const destination of day.destinations) {
      const distance = distanceMeters(destination.coordinates, coordinates);
      if (!nearest || distance < nearest.distance) {
        nearest = { destination, distance };
      }
    }
  }

  return nearest;
}
