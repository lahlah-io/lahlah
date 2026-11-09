# Map Visualization and Road Routing (Future)

## MVP behavior
MVP returns ordered destinations with `latitude`/`longitude` and a GeoJSON `LineString` route with coordinates in `[longitude, latitude]` order. The route is a **straight-line** connection between valid points (Haversine/nearest-neighbor baseline), not a road, path, or navigation route. It must not be presented as driving/walking directions.

## Map visualization (planned)
Use an open-source map stack such as **Leaflet** with **OpenStreetMap**-compatible tiles. Choose a tile provider and attribution according to that provider's usage policy; do not hardcode a provider that violates rate/attribution terms.

## Road routing (planned)
Road/path routing requires a separate routing engine/service, e.g. **OSRM** (open source) or another provider with explicit terms. When added:
- Request route geometry from the routing engine using validated destination coordinates.
- Keep MVP straight-line `distanceType`/metadata distinct from road distance/duration.
- Cache and rate-limit routing requests; handle missing routes/fallbacks safely.
- Validate returned geometry before exposing it to clients.

## Data contract
Future responses can add `routeType`/`distanceType` (`straight_line` vs `road`) and road metrics, while preserving backward-compatible destination coordinates for the MVP client.
