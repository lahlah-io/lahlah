import { useEffect, useMemo } from "react";

import { CheckpointPin } from "@/shared/components/trip/checkpoint-pin";
import {
  Map as MapView,
  MapControls,
  MapMarker,
  MapRoute,
  MarkerContent,
  useMap,
} from "@/shared/components/ui/map";
import { getTripWaypoints } from "@/shared/data/itinerary";
import { useRoadRoute } from "@/shared/hooks/use-road-route";
import type { Checkpoint } from "@/shared/types/checkpoint";
import type { ItineraryDestination, Trip } from "@/shared/types/itinerary";
import {
  getWaypointBounds,
  OSM_STYLE,
  ROUTE_COLOR,
} from "@/shared/utils/map-style";

const FIT_PADDING = { top: 96, bottom: 48, left: 40, right: 40 };

/**
 * Kamera peta: seluruh rute saat tidak ada destinasi dipilih, lalu mendekat
 * ke destinasi yang dipilih. Menutup kartu mengembalikan peta ke seluruh rute.
 */
function MapCamera({
  bounds,
  focus,
}: {
  bounds: [[number, number], [number, number]];
  focus: ItineraryDestination | null;
}) {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!map || !isLoaded) return;

    if (!focus) {
      map.fitBounds(bounds, {
        padding: FIT_PADDING,
        maxZoom: 13,
        duration: 500,
      });
      return;
    }

    map.flyTo({
      center: focus.coordinates,
      zoom: 13,
      duration: 700,
      essential: true,
    });
  }, [map, isLoaded, focus, bounds]);

  return null;
}

/**
 * Peta interaktif trip dengan pin seluruh destinasi.
 *
 * Pin dengan checkpoint menampilkan foto; yang belum tampil sebagai ikon
 * kamera. Menekan pin memilih destinasi itu (peta mendekat + kartu terbuka).
 */
export function TripCheckpointMap({
  trip,
  checkpoints,
  selectedDestination,
  onSelectDestination,
}: {
  trip: Trip;
  checkpoints: Checkpoint[];
  /** Destinasi yang kartunya sedang terbuka; `null` = tampilan seluruh rute. */
  selectedDestination: ItineraryDestination | null;
  onSelectDestination: (destination: ItineraryDestination) => void;
}) {
  const waypoints = useMemo(() => getTripWaypoints(trip), [trip]);
  const { coordinates, isFallback } = useRoadRoute(waypoints, waypoints);
  const bounds = useMemo(
    () =>
      getWaypointBounds([
        ...waypoints,
        ...checkpoints.map(
          (checkpoint) =>
            [checkpoint.longitude, checkpoint.latitude] as [number, number],
        ),
      ]),
    [waypoints, checkpoints],
  );

  const checkpointByDestination = useMemo(
    () =>
      new Map(
        checkpoints.map((checkpoint) => [
          checkpoint.destinationId,
          checkpoint,
        ]),
      ),
    [checkpoints],
  );

  const destinations = useMemo(
    () => trip.days.flatMap((day) => day.destinations),
    [trip],
  );

  if (!bounds) return <div className="h-full w-full bg-muted" />;

  return (
    <div className="relative h-full w-full">
      <MapView
        bounds={bounds}
        fitBoundsOptions={{ padding: FIT_PADDING, maxZoom: 13 }}
        styles={{ light: OSM_STYLE, dark: OSM_STYLE }}
        scrollZoom={false}
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

        {destinations.map((destination) => {
          const checkpoint = checkpointByDestination.get(destination.id);
          const isSelected = selectedDestination?.id === destination.id;

          return (
            <MapMarker
              key={destination.id}
              longitude={checkpoint?.longitude ?? destination.coordinates[0]}
              latitude={checkpoint?.latitude ?? destination.coordinates[1]}
              anchor="bottom"
            >
              <MarkerContent className="group">
                <button
                  type="button"
                  aria-label={`Buka ${destination.name}`}
                  aria-pressed={isSelected}
                  onClick={() => onSelectDestination(destination)}
                  className="block cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <CheckpointPin
                    checkpoint={checkpoint}
                    alt={`Checkpoint ${destination.name}`}
                  />
                </button>
              </MarkerContent>
            </MapMarker>
          );
        })}

        <MapControls position="top-right" showZoom />
        <MapCamera bounds={bounds} focus={selectedDestination} />
      </MapView>

      <span className="absolute top-16 left-2 z-10 rounded bg-background/85 px-1 text-[10px] text-muted-foreground">
        © OpenStreetMap
      </span>
    </div>
  );
}
