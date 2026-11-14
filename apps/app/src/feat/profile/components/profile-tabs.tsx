import { useState } from "react";
import { Bookmark, LayoutGrid, SquareUser } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/components/ui/empty";
import { cn } from "@/shared/utils/cn";

import type { Trip } from "@/shared/types/itinerary";

import { TripGrid } from "./trip-grid";

type TabId = "trip" | "saved" | "tagged";

const TABS = [
  { id: "trip", icon: LayoutGrid, label: "Trip" },
  { id: "saved", icon: Bookmark, label: "Disimpan" },
  { id: "tagged", icon: SquareUser, label: "Ditandai" },
] as const;

const EMPTY_STATES: Record<Exclude<TabId, "trip">, string> = {
  saved: "Trip yang kamu simpan akan muncul di sini.",
  tagged: "Trip yang menandai kamu akan muncul di sini.",
};

export function ProfileTabs({ trips }: { trips: Trip[] }) {
  const [tab, setTab] = useState<TabId>("trip");

  return (
    <section aria-label="Trip" className="mt-5">
      <div
        role="tablist"
        aria-label="Tab profil"
        className="mx-4 flex border-t border-border"
      >
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = item.id === tab;

          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={item.label}
              title={item.label}
              onClick={() => setTab(item.id)}
              className={cn(
                "-mt-px flex flex-1 items-center justify-center border-t-2 py-3 text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset [&_svg]:block [&_svg]:shrink-0",
                active
                  ? "border-foreground text-foreground"
                  : "border-transparent hover:text-foreground",
              )}
            >
              <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="mt-0">
        {tab === "trip" ? (
          <TripGrid trips={trips} />
        ) : (
          <Empty className="border-0 py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {tab === "saved" ? (
                  <Bookmark aria-hidden="true" />
                ) : (
                  <SquareUser aria-hidden="true" />
                )}
              </EmptyMedia>
              <EmptyTitle>
                {tab === "saved" ? "Belum ada trip" : "Belum ditandai"}
              </EmptyTitle>
              <EmptyDescription>{EMPTY_STATES[tab]}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </section>
  );
}
