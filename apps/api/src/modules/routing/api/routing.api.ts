import { Hono } from "hono";
import { zValidator } from "../../../shared/http/validator.js";
import { routeRequestSchema } from "../schemas/routing.schema.js";
import type { RoutingService } from "../services/routing.service.js";

export function createRoutingApi(routingService: RoutingService) {
  const api = new Hono();

  api.post("/driving", zValidator("json", routeRequestSchema), async (c) => {
    const result = await routingService.getRoute(c.req.valid("json"));
    return c.json({ data: result });
  });

  return api;
}
