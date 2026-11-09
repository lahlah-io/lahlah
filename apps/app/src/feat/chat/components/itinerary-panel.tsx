import { ItineraryActions } from "./itinerary-actions";
import { ItineraryHero } from "./itinerary-hero";
import { ItineraryStepper } from "./itinerary-stepper";
import { RouteMap } from "./route-map";

export function ItineraryPanel() {
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <h2 className="sr-only">Itinerary</h2>
      <div className="min-h-0 flex-1 overflow-x-clip overflow-y-auto">
        <div className="flex flex-col gap-6 pt-6 pb-8">
          <ItineraryHero />
          <RouteMap />
          <ItineraryStepper />
        </div>
      </div>
      <ItineraryActions />
    </div>
  );
}
