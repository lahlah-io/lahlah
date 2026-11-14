import {
  Map,
  MapMarker,
  MapRoute,
  MarkerContent,
} from "@/shared/components/ui/map";
import { useRoadRoute } from "@/shared/hooks/use-road-route";
import type { Checkpoint } from "@/shared/types/checkpoint";
import {
  getWaypointBounds,
  OSM_STYLE,
  ROUTE_COLOR,
} from "@/shared/utils/map-style";

import { CheckpointPin } from "./checkpoint-pin";

type TripRouteMapProps = {
  /** Waypoint `[longitude, latitude]`, urut sesuai hari. */
  waypoints: [number, number][];
  /** Judul trip untuk pembaca layar. */
  label: string;
  /** Pin foto checkpoint; ikut masuk bounds supaya tidak terpotong. */
  checkpoints?: Checkpoint[];
};

/**
 * Cover peta statis untuk postingan trip.
 *
 * Peta tidak bisa di-pan/zoom/diubah: `interactive={false}` mematikan semua
 * handler MapLibre dan `pointer-events-none` meneruskan klik ke tautan induk.
 * `bounds` + `fitBoundsOptions` membuat rute selalu pas di dalam kontainer,
 * berapa pun aspect ratio-nya (MapLibre memantau ukuran kontainer sendiri).
 */
export function TripRouteMap({
  waypoints,
  label,
  checkpoints = [],
}: TripRouteMapProps) {
  const { coordinates, isFallback } = useRoadRoute(waypoints, waypoints);
  const bounds = getWaypointBounds([
    ...waypoints,
    ...checkpoints.map(
      (checkpoint) =>
        [checkpoint.longitude, checkpoint.latitude] as [number, number],
    ),
  ]);

  if (!bounds) return <div className="h-full w-full bg-muted" />;

  return (
    <div className="pointer-events-none relative h-full w-full" aria-hidden="true">
      <Map
        bounds={bounds}
        fitBoundsOptions={{ padding: 24, maxZoom: 14 }}
        styles={{ light: OSM_STYLE, dark: OSM_STYLE }}
        interactive={false}
        attributionControl={false}
        className="h-full w-full"
      >
        <MapRoute
          coordinates={coordinates}
          color={ROUTE_COLOR}
          width={3}
          opacity={0.95}
          dashArray={isFallback ? [1.5, 1.5] : undefined}
        />

        {checkpoints.map((checkpoint) => (
          <MapMarker
            key={checkpoint.destinationId}
            longitude={checkpoint.longitude}
            latitude={checkpoint.latitude}
            anchor="bottom"
          >
            <MarkerContent className="group">
              <CheckpointPin checkpoint={checkpoint} size="sm" />
            </MarkerContent>
          </MapMarker>
        ))}
      </Map>
      <span className="sr-only">{label}</span>
      <span className="absolute right-1 bottom-1 rounded bg-background/80 px-1 text-[10px] text-muted-foreground">
        © OpenStreetMap
      </span>
    </div>
  );
}
