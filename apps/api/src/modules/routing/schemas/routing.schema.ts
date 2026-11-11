import { z } from "zod";

const pointSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

export const routeRequestSchema = z.object({
  points: z.array(pointSchema).min(2).max(50),
  profile: z.enum(["car", "motorcycle", "foot"]).default("car"),
});

export type RouteRequest = z.infer<typeof routeRequestSchema>;
export type RoutePoint = { latitude: number; longitude: number };
export type RouteProfile = "car" | "motorcycle" | "foot";
export type RouteSource = "osrm" | "cache" | "fallback";

export type RouteResult = {
  source: RouteSource;
  distanceKm: number | null;
  durationMin: number | null;
  estimated: boolean;
  error?: string;
  geometry: { type: "LineString"; coordinates: Array<[number, number]> };
};
