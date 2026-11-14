import { LiveTripCarousel } from "@/feat/home/components/live-trip-carousel";
import { AppTopBar } from "@/shared/components/app-nav/app-top-bar";
import { TripFeed } from "@/shared/components/trip/trip-feed";
import { TRIPS } from "@/shared/data/itinerary";

export function HomePage() {
  return (
    <div className="h-full w-full overflow-y-auto pb-24 md:pb-6">
      <div className="mx-auto w-full max-w-xl">
        <AppTopBar>
          <span className="text-xs text-muted-foreground">
            {TRIPS.length} trip
          </span>
        </AppTopBar>

        <LiveTripCarousel />
        <TripFeed trips={TRIPS} />
      </div>
    </div>
  );
}
