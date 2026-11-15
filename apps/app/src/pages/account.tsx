import { ArrowLeft } from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router";

import { ProfileHeader } from "@/feat/profile/components/profile-header";
import { ProfileTabs } from "@/feat/profile/components/profile-tabs";
import { Button } from "@/shared/components/ui/button";
import { getAccount } from "@/shared/data/accounts";
import { getTripWaypoints, TRIPS, TRIP_SUMMARY } from "@/shared/data/itinerary";

/** Profil akun publik; layout sama dengan /profile. */
export function AccountPage() {
  const { accountId } = useParams();
  const navigate = useNavigate();
  const account = accountId ? getAccount(accountId) : null;

  if (!account) return <Navigate to="/home" replace />;

  // ponytail: akun publik masih data contoh; pindahkan ke endpoint profil publik saat ada.
  const trips = TRIPS.map((trip) => ({
    id: trip.id,
    title: trip.summary.title,
    viewCount: trip.views ?? 0,
    waypoints: getTripWaypoints(trip),
  }));

  const stats = {
    distance: TRIP_SUMMARY.distance.replace("±", ""),
    likes: trips
      .reduce((total, trip, index) => total + (TRIPS[index]?.likes ?? 0), 0)
      .toLocaleString("id-ID"),
    trips: trips.length.toLocaleString("id-ID"),
  };

  return (
    <div className="h-full w-full overflow-y-auto pb-24 md:pb-6">
      <div className="mx-auto w-full max-w-xl">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur sm:px-4">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Kembali"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
          <h1 className="truncate text-sm font-semibold">@{account.username}</h1>
        </header>

        <ProfileHeader user={account} stats={stats} editable={false} />
        <ProfileTabs trips={trips} loading={false} error={null} />
      </div>
    </div>
  );
}
