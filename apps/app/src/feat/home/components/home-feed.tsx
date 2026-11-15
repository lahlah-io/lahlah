import { Heart, MapPin, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { TripRouteMap } from "@/shared/components/trip/trip-route-map";
import { UserAvatar } from "@/shared/components/user-avatar";
import { formatRelativeTime } from "@/shared/utils/time";

import { recordItineraryView, type FeedCardDto } from "../services/home.api";

function FeedCoverPlaceholder() {
  return (
    <div className="flex size-full items-center justify-center bg-muted">
      <MapPin aria-hidden="true" className="size-8 text-muted-foreground" />
    </div>
  );
}

/**
 * Cover kartu: peta rute trip.
 *
 * Peta MapLibre mahal (satu konteks WebGL per kartu), jadi baru dipasang saat
 * kartu mendekati viewport dan dilepas lagi saat jauh — feed bisa panjang.
 * Trip tanpa koordinat jatuh ke foto destinasi, lalu ke placeholder.
 */
function FeedCardCover({ card }: { card: FeedCardDto }) {
  const ref = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const hasRoute = card.waypoints.length > 0;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => setNearViewport(entries[0]?.isIntersecting ?? false),
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="size-full">
      {hasRoute && nearViewport ? (
        <TripRouteMap
          waypoints={card.waypoints}
          label={`Peta rute ${card.title}`}
        />
      ) : card.coverImageUrl && !hasRoute ? (
        <img
          src={card.coverImageUrl}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        <FeedCoverPlaceholder />
      )}
    </div>
  );
}

function FeedPostCard({
  card,
  onToggleLike,
}: {
  card: FeedCardDto;
  onToggleLike: (tripId: string, liked: boolean) => void;
}) {
  const tripPath = `/detail/${card.id}`;
  const author = card.author?.name ?? "Trip Lahlah";
  const stops =
    card.stopCount > 0
      ? `${card.stopCount} destinasi · ${card.destinationNames.slice(0, 3).join(", ")}`
      : "Trip publik";

  async function handleShare() {
    const url = `${window.location.origin}${tripPath}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: card.title, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // Pengguna membatalkan dialog bagikan; tidak ada yang berubah.
    }
  }

  const body = (
    <>
      <p className="text-sm font-semibold">{card.title}</p>
      <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{stops}</p>

      <div className="relative mt-3 aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted">
        <FeedCardCover card={card} />
      </div>
    </>
  );

  return (
    <article className="relative pb-5">
      <header className="relative z-10 flex items-center gap-3 px-4 py-3">
        <UserAvatar
          name={author}
          seed={card.author?.username ?? card.id}
          className="size-8"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{author}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatRelativeTime(card.updatedAt)}
          </p>
        </div>
      </header>

      <Link
        to={tripPath}
        aria-label={`Buka detail trip ${card.title}`}
        onClick={() => {
          // Satu tayangan per user per trip; API mengabaikan pengulangan.
          void recordItineraryView(card.id).catch(() => undefined);
        }}
        className="block px-4 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        {body}
      </Link>

      <div className="relative z-10 mt-3 flex items-center gap-1 px-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={card.likedByMe}
          aria-label={`Suka trip ${card.title}`}
          onClick={() => onToggleLike(card.id, !card.likedByMe)}
          className={card.likedByMe ? "text-red-500" : undefined}
        >
          <Heart
            aria-hidden="true"
            className={card.likedByMe ? "fill-current" : undefined}
          />
          <span className="tabular-nums">
            {card.likeCount.toLocaleString("id-ID")}
          </span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Bagikan trip ${card.title}`}
          onClick={handleShare}
          className="ml-auto"
        >
          <Share2 aria-hidden="true" />
          <span className="tabular-nums">
            {card.viewCount.toLocaleString("id-ID")}
          </span>
        </Button>
      </div>
    </article>
  );
}

function FeedSkeleton() {
  return (
    <div aria-hidden="true" className="px-4 pt-3 pb-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
      <Skeleton className="mt-3 aspect-[4/3] w-full rounded-xl" />
    </div>
  );
}

export function HomeFeed({
  error,
  hasMore,
  items,
  loading,
  loadingMore,
  loadMore,
  onRetry,
  onToggleLike,
}: {
  error: string | null;
  hasMore: boolean;
  items: FeedCardDto[] | null;
  loading: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  onRetry: () => void;
  onToggleLike: (tripId: string, liked: boolean) => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "640px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  if (loading) {
    return (
      <div className="flex flex-col" aria-label="Memuat feed">
        <FeedSkeleton />
        <FeedSkeleton />
      </div>
    );
  }

  if ((items?.length ?? 0) === 0 && error) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <p className="text-sm font-semibold">Feed belum bisa dimuat</p>
        <p className="text-xs break-all text-muted-foreground">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Coba lagi
        </Button>
      </div>
    );
  }

  if ((items?.length ?? 0) === 0) {
    return (
      <p className="px-4 py-12 text-center text-sm text-muted-foreground">
        Belum ada trip publik. Buat trip di chat lalu publikasikan.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {error ? (
        <p
          role="status"
          className="mx-4 mb-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs break-all text-muted-foreground"
        >
          {error}
        </p>
      ) : null}
      {(items ?? []).map((card) => (
        <FeedPostCard
          key={card.id}
          card={card}
          onToggleLike={onToggleLike}
        />
      ))}
      {loadingMore ? <FeedSkeleton /> : null}
      {hasMore ? <div ref={sentinelRef} aria-hidden="true" className="h-1" /> : null}
    </div>
  );
}
