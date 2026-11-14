type StopRef = { id: string; position: number };

export function deriveVersionRoutes(routeJson: unknown, stops: StopRef[]) {
  const legs = (routeJson as { legs?: unknown } | null)?.legs;
  if (!Array.isArray(legs)) return [];

  const stopIds = new Map(stops.map((stop) => [stop.position, stop.id]));
  return legs.flatMap((leg: Record<string, unknown>) => {
    const fromStopId = stopIds.get(leg.fromPosition as number);
    const toStopId = stopIds.get(leg.toPosition as number);
    if (!fromStopId || !toStopId || typeof leg.transportMode !== "string") return [];

    return [{
      fromStopId,
      toStopId,
      transportMode: leg.transportMode,
      geometryJson: leg.geometry ?? null,
      provider: typeof leg.provider === "string" ? leg.provider : null,
      providerProfile: typeof leg.profile === "string" ? leg.profile : null,
      fallback: leg.fallback === true,
    }];
  });
}
