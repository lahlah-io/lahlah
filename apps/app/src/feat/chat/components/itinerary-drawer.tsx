import { CalendarDays, MapPin } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Separator } from "@/shared/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";

interface ItineraryDay {
  activities: { place: string; time: string }[];
  date: string;
  title: string;
}

const ITINERARY: ItineraryDay[] = [
  {
    activities: [
      { place: "Tiba & check-in penginapan", time: "14:00" },
      { place: "Jalan sore & kuliner lokal", time: "17:00" },
    ],
    date: "Hari 1",
    title: "Kedatangan",
  },
  {
    activities: [
      { place: "Wisata utama kota", time: "09:00" },
      { place: "Museum & pusat budaya", time: "13:00" },
      { place: "Sunset point", time: "17:30" },
    ],
    date: "Hari 2",
    title: "Eksplorasi",
  },
  {
    activities: [
      { place: "Belanja oleh-oleh", time: "10:00" },
      { place: "Check-out & pulang", time: "13:00" },
    ],
    date: "Hari 3",
    title: "Kepulangan",
  },
];

interface ItineraryDrawerProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function ItineraryDrawer({ onOpenChange, open }: ItineraryDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[75vw]! max-w-none! sm:max-w-none">
        <SheetHeader>
          <SheetTitle>Itinerary</SheetTitle>
          <SheetDescription>Rencana perjalananmu, tersusun per hari.</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          {ITINERARY.map((day, index) => (
            <section key={day.date} aria-label={`${day.date}: ${day.title}`}>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  <CalendarDays data-icon="inline-start" />
                  {day.date}
                </Badge>
                <h3 className="text-sm font-semibold">{day.title}</h3>
              </div>
              <ol className="mt-3 flex flex-col gap-1">
                {day.activities.map((activity) => (
                  <li
                    key={`${day.date}-${activity.time}`}
                    className="flex items-start gap-2.5 py-1.5 text-sm"
                  >
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{activity.place}</span>
                    <time className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {activity.time}
                    </time>
                  </li>
                ))}
              </ol>
              {index < ITINERARY.length - 1 ? <Separator className="mt-4" /> : null}
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
