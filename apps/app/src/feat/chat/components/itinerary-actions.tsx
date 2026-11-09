import { Save, Share2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

export function ItineraryActions() {
  return (
    <div
      className="absolute right-6 bottom-6 z-10 flex flex-col gap-3"
      aria-label="Aksi itinerary"
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Bagikan rencana"
        className="size-14 rounded-lg shadow-lg [&_svg:not([class*='size-'])]:size-6"
      >
        <Share2 aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon"
        aria-label="Simpan rencana"
        className="size-14 rounded-lg shadow-lg [&_svg:not([class*='size-'])]:size-6"
      >
        <Save aria-hidden="true" />
      </Button>
    </div>
  );
}
