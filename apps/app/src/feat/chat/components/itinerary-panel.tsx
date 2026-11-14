import { TripHero } from "@/shared/components/trip/trip-hero";
import { TripRouteMapCard } from "@/shared/components/trip/trip-route-map-card";
import { TripStepper } from "@/shared/components/trip/trip-stepper";
import { TRIP } from "@/shared/data/itinerary";

import { ItineraryActions } from "./itinerary-actions";

export function ItineraryPanel() {
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <h2 className="sr-only">Trip</h2>
      <div className="min-h-0 flex-1 overflow-x-clip overflow-y-auto">
        <div className="flex flex-col gap-6 pt-6 pb-8">
          <TripHero trip={TRIP} />
          <TripRouteMapCard trip={TRIP} />
          <TripStepper days={TRIP.days} />
        </div>
      </div>
      <ItineraryActions />
    </div>
  );
}
