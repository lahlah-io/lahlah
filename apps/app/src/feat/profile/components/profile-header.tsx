import { useNavigate } from "react-router";

import { UserAvatar } from "@/shared/components/user-avatar";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { type CurrentUser } from "@/shared/types/user";

import type { ProfileStats } from "../types/index";

export function ProfileHeader({
  user,
  stats,
  editable = true,
}: {
  user: CurrentUser;
  /** `null` selama trip belum termuat: statistik tampil sebagai `—`. */
  stats: ProfileStats | null;
  editable?: boolean;
}) {
  const navigate = useNavigate();
  const { name, plan, username, avatarUrl } = user;

  const rows = [
    { label: "Trip", value: stats?.trips ?? "—" },
    { label: "Likes", value: stats?.likes ?? "—" },
    { label: "Jarak", value: stats?.distance ?? "—" },
  ];

  return (
    <header className="flex flex-col gap-4 px-4 pt-5">
      <div className="flex items-center gap-6">
        <UserAvatar
          name={name}
          seed={username}
          src={avatarUrl}
          className="size-20 shrink-0"
        />

        <ul className="flex min-w-0 flex-1 items-center justify-around">
          {rows.map((stat) => (
            <li
              key={stat.label}
              className="flex min-w-0 flex-col items-center gap-0.5 text-center"
            >
              <p className="text-base font-semibold tabular-nums">
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {name}
          </h1>
          <Badge variant={plan === "Plus" ? "default" : "secondary"}>
            {plan}
          </Badge>
        </div>
        <p className="truncate text-sm leading-5 text-muted-foreground">
          @{username}
        </p>
      </div>

      {user.bio ? (
        <p className="text-sm leading-5 text-balance">{user.bio}</p>
      ) : null}

      {editable ? (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => navigate("/profile/edit")}
          >
            Edit profil
          </Button>
          <Button variant="secondary" className="flex-1">
            Bagikan profil
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Akun trip publik</p>
      )}
    </header>
  );
}
