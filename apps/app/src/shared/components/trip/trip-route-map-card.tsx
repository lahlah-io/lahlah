import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Map,
  MapControls,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerPopup,
  MarkerTooltip,
  useMap,
} from "@/shared/components/ui/map";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { useRoadRoute } from "@/shared/hooks/use-road-route";
import type { Trip } from "@/shared/types/itinerary";
import {
  getWaypointBounds,
  OSM_STYLE,
  ROUTE_COLOR,
} from "@/shared/utils/map-style";

type ItineraryMapProps = {
  coordinates: [number, number][];
  isFallback: boolean;
  stops: Array<{
    city: string;
    coordinates: [number, number];
    dayLabel: string;
    id: string;
    name: string;
    rating: string;
    timeRange: string;
  }>;
  bounds: [[number, number], [number, number]] | null;
  /** Diisi hanya pada peta kecil; klik latar peta akan memanggil ini. */
  onExpand?: () => void;
};

function ItineraryMap({
  coordinates,
  isFallback,
  stops,
  bounds,
  onExpand,
}: ItineraryMapProps) {
  return (
    <Map
      bounds={bounds ?? undefined}
      fitBoundsOptions={{ maxZoom: 12, padding: 40 }}
      styles={{ light: OSM_STYLE, dark: OSM_STYLE }}
      dragRotate={false}
      scrollZoom={!onExpand}
      className="h-full w-full"
    >
      <MapRoute
        coordinates={coordinates}
        color={ROUTE_COLOR}
        width={4}
        opacity={0.9}
        dashArray={isFallback ? [1.5, 1.5] : undefined}
      />

      {stops.map((stop, index) => (
        <MapMarker
          key={stop.id}
          longitude={stop.coordinates[0]}
          latitude={stop.coordinates[1]}
        >
          <MarkerContent>
            <span className="flex size-7 items-center justify-center rounded-full border-2 border-background bg-primary text-xs font-semibold text-primary-foreground shadow-md">
              {index + 1}
            </span>
          </MarkerContent>
          <MarkerTooltip>{stop.name}</MarkerTooltip>
          <MarkerPopup closeButton>
            <div className="flex flex-col gap-1 pr-4">
              <p className="text-sm font-medium">{stop.name}</p>
              <p className="text-xs text-muted-foreground">
                {stop.dayLabel} · {stop.timeRange}
              </p>
              <p className="text-xs text-muted-foreground">
                {stop.city} · {stop.rating}
              </p>
            </div>
          </MarkerPopup>
        </MapMarker>
      ))}

      <MapControls position="bottom-right" showZoom />
      {onExpand ? <ExpandOnClick onExpand={onExpand} /> : null}
    </Map>
  );
}

/** Membuka peta besar saat latar peta diketuk, bukan saat marker/zoom diklik. */
function ExpandOnClick({ onExpand }: { onExpand: () => void }) {
  const { map } = useMap();

  useEffect(() => {
    if (!map) return;

    const canvas = map.getCanvas();
    const previousCursor = canvas.style.cursor;

    canvas.style.cursor = "zoom-in";
    map.on("click", onExpand);

    return () => {
      map.off("click", onExpand);
      canvas.style.cursor = previousCursor;
    };
  }, [map, onExpand]);

  return null;
}

/**
 * Kartu peta rute trip dengan dialog perbesar.
 *
 * Panel Trip di chat dan arsip trip memakai komponen yang sama supaya
 * tampilannya identik; datanya datang dari `trip`.
 */
export function TripRouteMapCard({ trip }: { trip: Trip }) {
  const [expanded, setExpanded] = useState(false);
  const openExpanded = useCallback(() => setExpanded(true), []);

  const stops = useMemo(
    () =>
      trip.days.flatMap((day) =>
        day.destinations.map((destination) => ({
          ...destination,
          city: day.city,
          dayLabel: day.dayLabel,
        })),
      ),
    [trip],
  );

  const waypoints = useMemo(
    () => stops.map((stop) => stop.coordinates),
    [stops],
  );
  const bounds = useMemo(() => getWaypointBounds(waypoints), [waypoints]);
  const { coordinates, isFallback } = useRoadRoute(waypoints, waypoints);

  return (
    <section
      aria-label="Peta rute"
      className="mx-auto w-full max-w-4xl px-4 sm:px-6"
    >
      <p className="sr-only">
        Peta rute perjalanan dari {stops[0]?.name} sampai {stops.at(-1)?.name}.
        Ketuk penanda untuk melihat detail tiap destinasi.
      </p>
      <div className="relative h-56 w-full overflow-hidden rounded-xl border sm:h-72">
        <ItineraryMap
          coordinates={coordinates}
          isFallback={isFallback}
          stops={stops}
          bounds={bounds}
          onExpand={openExpanded}
        />
        <p className="pointer-events-none absolute top-2 left-2 rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
          Ketuk peta untuk memperbesar
        </p>
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          aria-describedby={undefined}
          className="w-[min(56rem,calc(100%-2rem))] gap-0 overflow-hidden p-0 sm:max-w-none"
        >
          <DialogHeader className="border-b px-4 py-3 pr-12">
            <DialogTitle>Peta rute</DialogTitle>
          </DialogHeader>
          <div className="h-[min(70svh,34rem)] w-full">
            <ItineraryMap
              coordinates={coordinates}
              isFallback={isFallback}
              stops={stops}
              bounds={bounds}
            />
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
