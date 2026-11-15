import { Navigate, useParams } from "react-router";

import { TripDetail } from "@/feat/trip/components/trip-detail";
import { useTripDetail } from "@/feat/trip/hooks/use-trip-detail";
import { PageLoader } from "@/shared/components/page-loader";
import { TRIPS } from "@/shared/data/itinerary";

/**
 * Detail trip di `/detail/:tripId`: halaman gulir read-only, tanpa checkpoint.
 *
 * Id contoh lama tetap dilayani `shared/data`; id API dibaca dari sesi. Peta
 * penuh layar tetap hanya di `/live/:tripId`.
 */
export function TripDetailPage() {
  const { tripId } = useParams();
  const placeholder = TRIPS.find((item) => item.id === tripId);
  const { status, trip } = useTripDetail(placeholder ? undefined : tripId);

  if (placeholder) return <TripDetail key={placeholder.id} trip={placeholder} />;
  if (status === "loading") return <PageLoader label="Memuat trip…" />;
  if (!trip) return <Navigate to="/home" replace />;

  return <TripDetail key={trip.id} trip={trip} />;
}

/** URL lama `/trips/:tripId` dialihkan ke `/detail/:tripId`. */
export function LegacyTripRedirect() {
  const { tripId } = useParams();
  return <Navigate to={`/detail/${tripId ?? ""}`} replace />;
}
