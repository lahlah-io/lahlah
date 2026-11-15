import { Navigate, useParams } from "react-router";

import { LiveTripDetail } from "@/feat/trip/components/live-trip-detail";
import { useTripDetail } from "@/feat/trip/hooks/use-trip-detail";
import { PageLoader } from "@/shared/components/page-loader";
import { TRIPS } from "@/shared/data/itinerary";

/**
 * Halaman live trip: peta penuh layar, hanya untuk trip yang sedang berjalan.
 *
 * Id contoh lama memakai data lokal; id API dibaca dari sesi. Trip yang sudah
 * selesai dialihkan ke halaman arsipnya supaya tautan live lama tidak
 * menampilkan peta yang sudah tidak bergerak.
 */
export function LiveTripDetailPage() {
  const { tripId } = useParams();
  const placeholder = TRIPS.find((item) => item.id === tripId);
  const { status, trip } = useTripDetail(placeholder ? undefined : tripId);

  if (placeholder) {
    if (!placeholder.isLive) {
      return <Navigate to={`/detail/${placeholder.id}`} replace />;
    }
    return <LiveTripDetail key={placeholder.id} trip={placeholder} />;
  }

  if (status === "loading") return <PageLoader label="Memuat trip…" />;
  if (!trip) return <Navigate to="/home" replace />;

  return <LiveTripDetail key={trip.id} trip={trip} />;
}
