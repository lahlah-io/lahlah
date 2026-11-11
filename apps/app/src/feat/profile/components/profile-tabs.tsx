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

import { ItineraryGrid } from "./itinerary-grid";

type TabId = "itinerary" | "saved" | "tagged";

const TABS = [
  { id: "itinerary", icon: LayoutGrid, label: "Itinerary" },
  { id: "saved", icon: Bookmark, label: "Disimpan" },
  { id: "tagged", icon: SquareUser, label: "Ditandai" },
] as const;

const EMPTY_STATES: Record<Exclude<TabId, "itinerary">, string> = {
  saved: "Itinerary yang kamu simpan akan muncul di sini.",
  tagged: "Itinerary yang menandai kamu akan muncul di sini.",
};

export function ProfileTabs() {
  const [tab, setTab] = useState<TabId>("itinerary");

  return (
    <section aria-label="Itinerary" className="mt-5">
      <div
        role="tablist"
        aria-label="Tab profil"
        className="flex border-t border-border"
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
        {tab === "itinerary" ? (
          <ItineraryGrid />
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
                {tab === "saved" ? "Belum ada itinerary" : "Belum ditandai"}
              </EmptyTitle>
              <EmptyDescription>{EMPTY_STATES[tab]}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </section>
  );
}
