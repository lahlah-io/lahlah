import { Hono } from "hono";
import { zValidator } from "../../../shared/http/validator.js";
import { requireAuth, type AuthVariables } from "../../../shared/auth/middleware.js";
import { tripIdParamSchema } from "../schemas/trip.schema.js";
import type { TripService } from "../services/trip.service.js";

export function createTripApi(service: TripService) {
  const api = new Hono<{ Variables: AuthVariables }>();

  // Before `/:tripId/...` so "active" is not read as a uuid.
  api.get("/active", requireAuth, async (c) =>
    c.json(await service.getActive({ userId: c.get("auth").user.id })),
  );

  api.post(
    "/:tripId/active",
    requireAuth,
    zValidator("param", tripIdParamSchema),
    async (c) =>
      c.json(
        await service.activate({
          userId: c.get("auth").user.id,
          tripId: c.req.valid("param").tripId,
        }),
      ),
  );

  api.delete(
    "/:tripId/active",
    requireAuth,
    zValidator("param", tripIdParamSchema),
    async (c) =>
      c.json(
        await service.deactivate({
          userId: c.get("auth").user.id,
          tripId: c.req.valid("param").tripId,
        }),
      ),
  );

  return api;
}
