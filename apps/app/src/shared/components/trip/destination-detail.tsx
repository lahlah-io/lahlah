import { Clock, MapPin, Star } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import type {
  ItineraryDay,
  ItineraryDestination,
} from "@/shared/types/itinerary";

type DestinationDetailProps = {
  day: ItineraryDay | null;
  destination: ItineraryDestination | null;
  onClose: () => void;
  /** Status arsip; hanya diisi halaman arsip trip. */
  status?: "done" | "missed";
};

export function DestinationDetail({
  day,
  destination,
  onClose,
  status,
}: DestinationDetailProps) {
  const [longitude, latitude] = destination?.coordinates ?? [0, 0];
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

  return (
    <Sheet
      open={destination !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="sm:max-w-md">
        {destination && day ? (
          <>
            <img
              src={destination.photo}
              alt=""
              className="h-44 w-full shrink-0 object-cover"
            />
            <SheetHeader className="gap-1 border-b px-4 py-4 pr-12">
              <SheetTitle className="text-lg">{destination.name}</SheetTitle>
              <SheetDescription>
                {day.dayLabel} · {day.date} · {day.city}
              </SheetDescription>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  <Star data-icon="inline-start" />
                  {destination.rating}
                </Badge>
                <Badge variant="outline">
                  <Clock data-icon="inline-start" />
                  {destination.timeRange}
                </Badge>
                {status ? (
                  <Badge variant={status === "done" ? "secondary" : "outline"}>
                    {status === "done" ? "Selesai" : "Terlewat"}
                  </Badge>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <h3 className="text-sm font-medium">Ringkasan hari</h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  {day.summary}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <h3 className="text-sm font-medium">Lokasi</h3>
                <p className="text-sm text-muted-foreground">
                  {latitude.toFixed(4)}, {longitude.toFixed(4)}
                </p>
              </div>

              <Button asChild variant="outline" className="mt-auto">
                <a href={mapsUrl} target="_blank" rel="noreferrer">
                  <MapPin data-icon="inline-start" />
                  Buka di Google Maps
                </a>
              </Button>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
