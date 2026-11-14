import type { MapStyleOption } from "@/shared/components/ui/map";

/** Warna garis rute yang dipakai peta chat maupun cover profil. */
export const ROUTE_COLOR = "#111827";

/**
 * Basemap OpenStreetMap standar sebagai raster tile.
 *
 * Tile `tile.openstreetmap.org` gratis untuk pemakaian ringan dan wajib
 * menampilkan atribusi. Untuk trafik produksi, ganti `tiles` ke penyedia
 * tile OSM (MapTiler, Stadia, Thunderforest) atau tile server sendiri.
 */
export const OSM_STYLE: MapStyleOption = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

/** Kotak pembatas `[barat-daya, timur-laut]` dari waypoint, `null` bila kosong. */
export function getWaypointBounds(
  waypoints: [number, number][],
): [[number, number], [number, number]] | null {
  if (waypoints.length === 0) return null;

  const longitudes = waypoints.map(([longitude]) => longitude);
  const latitudes = waypoints.map(([, latitude]) => latitude);

  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}
