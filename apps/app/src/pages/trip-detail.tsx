import { Navigate, useParams } from "react-router";

import { PastTripDetail } from "@/feat/trip/components/past-trip-detail";
import { TRIPS } from "@/shared/data/itinerary";

/**
 * Arsip trip di `/trips/:tripId`: halaman gulir read-only, tanpa checkpoint.
 *
 * Trip yang masih live dialihkan ke halaman live-nya agar desain arsip tidak
 * pernah dipakai untuk peta yang sedang berjalan.
 */
export function TripDetailPage() {
  const { tripId } = useParams();
  const trip = TRIPS.find((item) => item.id === tripId);

  if (!trip) return <Navigate to="/home" replace />;
  if (trip.isLive) return <Navigate to={`/live/${trip.id}`} replace />;

  return <PastTripDetail key={trip.id} trip={trip} />;
}
