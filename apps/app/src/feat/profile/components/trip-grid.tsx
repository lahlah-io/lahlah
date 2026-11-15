import { Eye } from "lucide-react";
import { Link } from "react-router";

import { TripRouteMap } from "@/shared/components/trip/trip-route-map";
import { useCheckpoints } from "@/shared/hooks/use-checkpoints";

import type { ProfileTripCard } from "../types/index";

function TripGridItem({ trip }: { trip: ProfileTripCard }) {
  const { checkpoints } = useCheckpoints(trip.id);
  const views = trip.viewCount;

  return (
    <li className="relative aspect-[4/5]">
      <Link
        to={`/profile/${trip.id}`}
        aria-label={`Buka trip ${trip.title}, ${views.toLocaleString("id-ID")} tayangan`}
        className="group absolute inset-0 block overflow-hidden rounded-2xl border border-border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset"
      >
        <TripRouteMap
          waypoints={trip.waypoints}
          label={`Peta rute ${trip.title}`}
          checkpoints={checkpoints}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-background/85 via-background/40 to-transparent px-2.5 pt-2 pb-10">
          <p className="line-clamp-2 font-sans text-sm leading-snug font-semibold text-balance text-white">
            {trip.title}
          </p>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-background/85 via-background/40 to-transparent px-2.5 pt-8 pb-2.5 text-[0.7rem] text-white/80">
          <Eye aria-hidden="true" className="size-3 shrink-0" />
          <span className="tabular-nums">{views.toLocaleString("id-ID")}</span>
        </div>
      </Link>
    </li>
  );
}

/** Grid trip profil: satu tile = satu trip milik user, covernya peta rute. */
export function TripGrid({ trips }: { trips: ProfileTripCard[] }) {
  return (
    <ul
      aria-label="Grid trip"
      className="grid grid-cols-3 gap-2 px-4 pt-1 pb-5"
    >
      {trips.map((trip) => (
        <TripGridItem key={trip.id} trip={trip} />
      ))}
    </ul>
  );
}
