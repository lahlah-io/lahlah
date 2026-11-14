import { LogOut } from "lucide-react";

import { LiveTripCarousel } from "@/feat/home/components/live-trip-carousel";
import { useAuth } from "@/feat/auth/hooks/use-auth";
import { AppTopBar } from "@/shared/components/app-nav/app-top-bar";
import { Button } from "@/shared/components/ui/button";
import { TripFeed } from "@/shared/components/trip/trip-feed";
import { TRIPS } from "@/shared/data/itinerary";

export function HomePage() {
  const { user, logout } = useAuth();

  return (
    <div className="h-full w-full overflow-y-auto pb-24 md:pb-6">
      <div className="mx-auto w-full max-w-xl">
        <AppTopBar>
          <span className="text-xs text-muted-foreground">
            {user ? user.name : `${TRIPS.length} trip`}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void logout()}
          >
            <LogOut />
            Keluar
          </Button>
        </AppTopBar>

        <LiveTripCarousel />
        <TripFeed trips={TRIPS} />
      </div>
    </div>
  );
}
