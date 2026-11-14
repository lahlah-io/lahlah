import { ArrowLeft } from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router";

import { TripFeed } from "@/shared/components/trip/trip-feed";
import { Button } from "@/shared/components/ui/button";
import { TRIPS } from "@/shared/data/itinerary";

export function ProfileDetailPage() {
  const { tripId } = useParams();
  const navigate = useNavigate();

  const selectedIndex = TRIPS.findIndex((trip) => trip.id === tripId);

  if (selectedIndex === -1) {
    return <Navigate to="/profile" replace />;
  }


  return (
    <div className="h-full w-full overflow-y-auto pb-24 md:pb-6">
      <div className="mx-auto w-full max-w-xl">
        <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-2 backdrop-blur">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Kembali ke profil"
            onClick={() => navigate("/profile")}
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
          <p className="text-sm font-semibold">Trip</p>
          <span className="ml-auto pr-2 text-xs text-muted-foreground">
            {TRIPS.length} trip
          </span>
        </div>

        <TripFeed trips={TRIPS} activeTripId={tripId} />
      </div>
    </div>
  );
}
