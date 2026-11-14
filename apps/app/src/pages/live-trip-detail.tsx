import { Navigate, useParams } from "react-router";

import { LiveTripDetail } from "@/feat/trip/components/live-trip-detail";
import { TRIPS } from "@/shared/data/itinerary";

/**
 * Halaman live trip: peta penuh layar, hanya untuk trip yang sedang berjalan.
 *
 * Trip yang sudah selesai dialihkan ke halaman arsipnya supaya tautan live
 * lama tidak menampilkan peta yang sudah tidak bergerak.
 */
export function LiveTripDetailPage() {
  const { tripId } = useParams();
  const trip = TRIPS.find((item) => item.id === tripId);

  if (!trip) return <Navigate to="/home" replace />;
  if (!trip.isLive) return <Navigate to={`/detail/${trip.id}`} replace />;

  return <LiveTripDetail key={trip.id} trip={trip} />;
}
