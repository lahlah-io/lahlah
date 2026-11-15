import { Settings } from "lucide-react";
import { Link } from "react-router";

import { ProfileHeader } from "@/feat/profile/components/profile-header";
import { ProfileTabs } from "@/feat/profile/components/profile-tabs";
import { useMyTrips } from "@/feat/profile/hooks/use-my-trips";
import { AppTopBar } from "@/shared/components/app-nav/app-top-bar";
import { Button } from "@/shared/components/ui/button";
import { useCurrentUser } from "@/shared/hooks/use-current-user";
import { formatDistance } from "@/shared/utils/geo";

export function ProfilePage() {
  const user = useCurrentUser();
  const { data, error, loading } = useMyTrips();

  return (
    <div className="h-full w-full overflow-y-auto pb-24 md:pb-6">
      <div className="mx-auto w-full max-w-xl">
        <AppTopBar>
          <Button asChild variant="ghost" size="icon-sm">
            <Link to="/settings" aria-label="Pengaturan">
              <Settings aria-hidden="true" strokeWidth={1.75} />
            </Link>
          </Button>
        </AppTopBar>

        <ProfileHeader
          user={user}
          stats={
            data
              ? {
                  distance:
                    data.meta.totalDistanceM == null
                      ? "—"
                      : `±${formatDistance(data.meta.totalDistanceM)}`,
                  likes: data.meta.totalLikes.toLocaleString("id-ID"),
                  trips: data.meta.totalTrips.toLocaleString("id-ID"),
                }
              : null
          }
        />
        <ProfileTabs
          trips={data?.data ?? []}
          loading={loading}
          error={error}
        />
      </div>
    </div>
  );
}
