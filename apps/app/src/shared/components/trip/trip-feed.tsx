import {
  Bookmark,
  Ellipsis,
  ExternalLink,
  Heart,
  Info,
  Route,
  Share2,
} from "lucide-react";
import { useEffect, useRef, useState, type Ref } from "react";
import { Link, useNavigate } from "react-router";

import { UserAvatar } from "@/shared/components/user-avatar";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { ACCOUNT } from "@/shared/data/accounts";
import { getTripWaypoints } from "@/shared/data/itinerary";
import { useCheckpoints } from "@/shared/hooks/use-checkpoints";
import type { Trip } from "@/shared/types/itinerary";

import { TripRouteMap } from "./trip-route-map";

function TripPostCard({
  trip,
  scrollRef,
}: {
  trip: Trip;
  scrollRef?: Ref<HTMLElement>;
}) {
  const { summary } = trip;
  const { checkpoints } = useCheckpoints(trip.id);
  const navigate = useNavigate();
  const tripPath = `/detail/${trip.id}`;
  const accountPath = `/accounts/${ACCOUNT.id}`;
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shares, setShares] = useState(trip.shares ?? 0);
  const likes = (trip.likes ?? 0) + (liked ? 1 : 0);

  async function handleShare() {
    const url = `${window.location.origin}${tripPath}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: summary.title, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
      setShares((count) => count + 1);
    } catch {
      // Pengguna membatalkan dialog bagikan; counter tidak bertambah.
    }
  }

  return (
    <article ref={scrollRef} className="relative pb-5">
      <header className="relative z-10 flex items-center gap-3 px-4 py-3">
        <Link
          to={accountPath}
          aria-label={`Buka profil ${ACCOUNT.name}`}
          className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <UserAvatar
            name={ACCOUNT.name}
            seed={ACCOUNT.username}
            src={ACCOUNT.avatarUrl}
            className="size-8"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <Link
            to={accountPath}
            className="inline-block max-w-full truncate text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            {ACCOUNT.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {summary.title}
          </p>
        </div>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Opsi untuk ${summary.title}`}
            >
              <Ellipsis aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem onSelect={() => navigate(tripPath)}>
              <Route aria-hidden="true" />
              Gunakan trip ini
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate(accountPath)}>
              <Info aria-hidden="true" />
              Tentang akun ini
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate(tripPath)}>
              <ExternalLink aria-hidden="true" />
              Tentang trip ini
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <Link
        to={tripPath}
        aria-label={`Buka detail trip ${summary.title}`}
        className="block px-4 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <p className="text-sm leading-6">{summary.description}</p>

        <div className="relative mt-3 aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted">
          <TripRouteMap
            waypoints={getTripWaypoints(trip)}
            label={`Peta rute ${summary.title}`}
            checkpoints={checkpoints}
          />
        </div>
      </Link>

      <div className="relative z-10 mt-3 flex items-center gap-1 px-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={liked}
          aria-label={`Suka trip ${summary.title}`}
          onClick={() => setLiked((value) => !value)}
          className={liked ? "text-red-500" : undefined}
        >
          <Heart
            aria-hidden="true"
            className={liked ? "fill-current" : undefined}
          />
          <span className="tabular-nums">{likes.toLocaleString("id-ID")}</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Bagikan trip ${summary.title}`}
          onClick={handleShare}
        >
          <Share2 aria-hidden="true" />
          <span className="tabular-nums">{shares.toLocaleString("id-ID")}</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-pressed={saved}
          aria-label={`Simpan trip ${summary.title}`}
          title={saved ? "Tersimpan" : "Simpan trip"}
          onClick={() => setSaved((value) => !value)}
          className="ml-auto"
        >
          <Bookmark
            aria-hidden="true"
            className={saved ? "fill-current" : undefined}
          />
        </Button>
      </div>
    </article>
  );
}

export function TripFeed({
  trips,
  activeTripId,
}: {
  trips: Trip[];
  /** Trip yang discroll ke tengah layar saat feed pertama dibuka. */
  activeTripId?: string;
}) {
  const activeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center" });
  }, [activeTripId]);

  return (
    <div className="flex flex-col">
      {trips.map((trip) => (
        <TripPostCard
          key={trip.id}
          trip={trip}
          scrollRef={trip.id === activeTripId ? activeRef : undefined}
        />
      ))}
    </div>
  );
}
