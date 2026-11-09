import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";

import { ItineraryStepper } from "./itinerary-stepper";
import { RouteMap } from "./route-map";

interface ItineraryDrawerProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function ItineraryDrawer({ onOpenChange, open }: ItineraryDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[75vw]! max-w-none! gap-0! p-0! sm:max-w-none!"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Itinerary</SheetTitle>
          <SheetDescription>Rencana perjalananmu, tersusun per hari.</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pt-6 pb-8">
          <RouteMap />
          <ItineraryStepper />
        </div>
      </SheetContent>
    </Sheet>
  );
}
