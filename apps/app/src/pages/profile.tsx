import { Settings } from "lucide-react";
import { Link } from "react-router";

import { ProfileHeader } from "@/feat/profile/components/profile-header";
import { ProfileTabs } from "@/feat/profile/components/profile-tabs";
import { AppTopBar } from "@/shared/components/app-nav/app-top-bar";
import { Button } from "@/shared/components/ui/button";
import { TRIPS } from "@/shared/data/itinerary";
import { useCurrentUser } from "@/shared/hooks/use-current-user";

export function ProfilePage() {
  const user = useCurrentUser();

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

        <ProfileHeader user={user} />
        <ProfileTabs trips={TRIPS} />
      </div>
    </div>
  );
}
