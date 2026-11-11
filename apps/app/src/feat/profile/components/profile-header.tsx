import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/shared/components/ui/avatar";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { ITINERARY_DAYS, TRIP_SUMMARY } from "@/shared/data/itinerary";
import { CURRENT_USER, getUserInitials } from "@/shared/types/user";

const BIO = "Rencana perjalanan dan itinerary yang dibuat bareng Lahlah AI.";

export function ProfileHeader() {
  const { name, plan, avatarUrl } = CURRENT_USER;

  const stats = [
    {
      label: "Destinasi",
      value: ITINERARY_DAYS.reduce(
        (total, day) => total + day.destinations.length,
        0,
      ),
    },
    { label: "Hari", value: ITINERARY_DAYS.length },
    { label: "Jarak", value: TRIP_SUMMARY.distance.replace("±", "") },
  ];

  return (
    <header className="px-4 pt-6 sm:px-6">
      <div className="flex items-center gap-5 sm:gap-10">
        <Avatar className="size-20 shrink-0 sm:size-28">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
          <AvatarFallback className="text-xl font-medium">
            {getUserInitials(name)}
          </AvatarFallback>
        </Avatar>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {name}
            </h1>
            <Badge variant={plan === "Plus" ? "default" : "secondary"}>
              {plan}
            </Badge>
          </div>

          <ul className="flex items-center justify-around gap-4 sm:justify-start sm:gap-10">
            {stats.map((stat) => (
              <li key={stat.label} className="text-center sm:text-left">
                <p className="text-base font-semibold tabular-nums">
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1 text-sm">
        <p className="flex items-center gap-2 font-semibold sm:hidden">
          {name}
          <Badge variant={plan === "Plus" ? "default" : "secondary"}>
            {plan}
          </Badge>
        </p>
        <p className="leading-5">{BIO}</p>
        <p className="text-muted-foreground">Paket {plan}</p>
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="secondary" className="flex-1">
          Edit profil
        </Button>
        <Button variant="secondary" className="flex-1">
          Bagikan profil
        </Button>
      </div>
    </header>
  );
}
