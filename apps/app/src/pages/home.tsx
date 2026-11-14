import { useAuth } from "@/feat/auth/hooks/use-auth";
import { HomeFeed } from "@/feat/home/components/home-feed";
import { LiveTripCarousel } from "@/feat/home/components/live-trip-carousel";
import { useFeed } from "@/feat/home/hooks/use-feed";
import { useLiveTrip } from "@/feat/home/hooks/use-live-trip";
import { AppTopBar } from "@/shared/components/app-nav/app-top-bar";

export function HomePage() {
  const { user } = useAuth();
  const liveTrip = useLiveTrip(user?.id ?? null);
  const feed = useFeed();

  return (
    <div className="h-full w-full overflow-y-auto pb-24 md:pb-6">
      <div className="mx-auto w-full max-w-xl">
        <AppTopBar>
          <span className="text-xs text-muted-foreground">
            {user ? user.name : "Beranda"}
          </span>
        </AppTopBar>

        <LiveTripCarousel live={liveTrip.data} status={liveTrip.status} />
        <HomeFeed
          error={feed.error}
          hasMore={feed.hasMore}
          items={feed.items}
          loading={feed.loading}
          loadingMore={feed.loadingMore}
          loadMore={feed.loadMore}
          onRetry={feed.reload}
          onToggleLike={feed.toggleLike}
        />
      </div>
    </div>
  );
}
