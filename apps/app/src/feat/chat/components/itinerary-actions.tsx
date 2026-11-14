import { Save, Share2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { TRIP } from "@/shared/data/itinerary";

export function ItineraryActions() {
  async function handleShare() {
    const url = `${window.location.origin}/live/${TRIP.id}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: TRIP.summary.title, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // Pengguna membatalkan dialog bagikan.
    }
  }

  return (
    <div
      className="absolute right-6 bottom-6 z-10 flex flex-col gap-3"
      aria-label="Aksi itinerary"
    >
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label={`Bagikan trip ${TRIP.summary.title}`}
        className="size-14 rounded-lg border border-border shadow-lg [&_svg:not([class*='size-'])]:size-6"
        onClick={handleShare}
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
