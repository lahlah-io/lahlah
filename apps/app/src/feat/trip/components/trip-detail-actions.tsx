import { ArrowLeft, Share2 } from "lucide-react";
import { useNavigate } from "react-router";

import { Button } from "@/shared/components/ui/button";
import type { Trip } from "@/shared/types/itinerary";

/** Aksi mengambang detail trip, gayanya mengikuti aksi panel Trip di chat. */
export function TripDetailActions({ trip }: { trip: Trip }) {
  const navigate = useNavigate();

  async function handleShare() {
    const url = `${window.location.origin}/detail/${trip.id}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: trip.summary.title, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // Pengguna membatalkan dialog bagikan.
    }
  }

  return (
    <div
      className="absolute right-6 bottom-[calc(4.5rem+env(safe-area-inset-bottom)+1.5rem)] z-10 flex flex-col gap-3 md:bottom-6"
      aria-label="Aksi detail trip"
    >
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label="Kembali"
        className="size-14 rounded-lg border border-border shadow-lg [&_svg:not([class*='size-'])]:size-6"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon"
        aria-label={`Bagikan trip ${trip.summary.title}`}
        className="size-14 rounded-lg shadow-lg [&_svg:not([class*='size-'])]:size-6"
        onClick={handleShare}
      >
        <Share2 aria-hidden="true" />
      </Button>
    </div>
  );
}
