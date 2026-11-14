import { Navigate, useParams } from "react-router";

import { TripDetail } from "@/feat/trip/components/trip-detail";
import { TRIPS } from "@/shared/data/itinerary";

/**
 * Detail trip di `/detail/:tripId`: halaman gulir read-only, tanpa checkpoint.
 *
 * Dipakai dari section feed Beranda dan grid profil. Peta penuh layar tetap
 * hanya di `/live/:tripId`.
 */
export function TripDetailPage() {
  const { tripId } = useParams();
  const trip = TRIPS.find((item) => item.id === tripId);

  if (!trip) return <Navigate to="/home" replace />;

  return <TripDetail key={trip.id} trip={trip} />;
}

/** URL lama `/trips/:tripId` dialihkan ke `/detail/:tripId`. */
export function LegacyTripRedirect() {
  const { tripId } = useParams();
  return <Navigate to={`/detail/${tripId ?? ""}`} replace />;
}
