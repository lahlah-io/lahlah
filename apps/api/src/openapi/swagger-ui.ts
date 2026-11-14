/**
 * Swagger UI page served at `/docs`. Assets come from the jsDelivr CDN so the
 * API does not need a static-file dependency; the spec itself is served by the
 * API at `/openapi.json`.
 */
export const swaggerUiHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lahlah API — Swagger UI</title>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css"
    />
    <style>
      body { margin: 0; background: #fafafa; }
      .topbar { display: none; }
      .contract-note {
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
        padding: 14px 20px;
      }
      .contract-note h2 { margin: 0 0 8px; font-size: 14px; color: #fff; letter-spacing: 0.02em; }
      .contract-note ul { margin: 0; padding-left: 18px; }
      .contract-note li { margin: 2px 0; }
      .contract-note code { background: #1e293b; color: #7dd3fc; padding: 1px 5px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <section class="contract-note">
      <h2>Trip distance — read this before wiring the map</h2>
      <ul>
        <li><code>trip_destinations.distance</code> = road distance in <strong>meters</strong> from the previous stop (OSRM driving route, not a straight line).</li>
        <li>The first stop of a version is <code>null</code>. So is a stop without coordinates, or one whose routing fell back to a straight line. Never read <code>null</code> as <code>0</code>.</li>
        <li>A version = the <code>trip_destinations</code> rows sharing one <code>createdAt</code>. Its total is <code>totalDistanceM</code> (<code>SUM(distance)</code>) with <code>totalDistanceKm</code> as the one-decimal mirror.</li>
        <li>Distances are computed once when a version is written; reads never call OSRM. Old batches can be filled with <code>pnpm --filter api db:backfill-distances</code>.</li>
        <li><code>POST /api/v1/routes/driving</code> returns the same per-leg values as <code>legsDistanceKm</code> (km, in request order).</li>
      </ul>
    </section>
    <div id="swagger-ui"></div>
    <script
      src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"
      crossorigin
    ></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        displayRequestDuration: true,
        filter: true,
        persistAuthorization: true,
        tryItOutEnabled: true,
        withCredentials: true,
      });
    </script>
  </body>
</html>
`;
