import { Hono } from "hono";
import { zValidator } from "../../../shared/http/validator.js";
import { requireAuth, type AuthVariables } from "../../../shared/auth/middleware.js";
import type { ItineraryService } from "../services/itinerary.service.js";
import {
  itineraryIdParamSchema,
  itineraryOwnerQuerySchema,
  itinerarySessionParamSchema,
  itineraryVersionParamSchema,
  restoreItineraryVersionSchema,
  trendingQuerySchema,
} from "../schemas/itinerary.schema.js";

export function createItineraryApi(service: ItineraryService) {
  const api = new Hono<{ Variables: AuthVariables }>();

  // Registered before `/:id`, otherwise "trending" is parsed as a uuid param.
  api.get(
    "/trending",
    zValidator("query", trendingQuerySchema),
    async (c) => c.json(await service.listTrending({ limit: c.req.valid("query").limit })),
  );

  api.get(
    "/by-session/:sessionId",
    zValidator("param", itinerarySessionParamSchema),
    zValidator("query", itineraryOwnerQuerySchema),
    async (c) =>
      c.json(
        await service.getBySession({
          sessionId: c.req.valid("param").sessionId,
          userId: c.req.valid("query").userId,
        }),
      ),
  );

  api.get(
    "/:id/versions",
    zValidator("param", itineraryIdParamSchema),
    zValidator("query", itineraryOwnerQuerySchema),
    async (c) =>
      c.json(
        await service.listVersions({ id: c.req.valid("param").id, userId: c.req.valid("query").userId }),
      ),
  );

  api.get(
    "/:id/versions/:version",
    zValidator("param", itineraryVersionParamSchema),
    zValidator("query", itineraryOwnerQuerySchema),
    async (c) =>
      c.json(
        await service.getVersion({
          id: c.req.valid("param").id,
          version: c.req.valid("param").version,
          userId: c.req.valid("query").userId,
        }),
      ),
  );

  api.post(
    "/:id/restore/:version",
    zValidator("param", itineraryVersionParamSchema),
    zValidator("json", restoreItineraryVersionSchema),
    async (c) =>
      c.json(
        await service.restoreVersion({
          id: c.req.valid("param").id,
          version: c.req.valid("param").version,
          ...c.req.valid("json"),
        }),
      ),
  );

  api.post(
    "/:id/publish",
    requireAuth,
    zValidator("param", itineraryIdParamSchema),
    async (c) =>
      c.json(
        await service.publish({ id: c.req.valid("param").id, userId: c.get("auth").user.id }),
      ),
  );

  api.delete(
    "/:id/publish",
    requireAuth,
    zValidator("param", itineraryIdParamSchema),
    async (c) =>
      c.json(
        await service.unpublish({ id: c.req.valid("param").id, userId: c.get("auth").user.id }),
      ),
  );

  api.post(
    "/:id/like",
    requireAuth,
    zValidator("param", itineraryIdParamSchema),
    async (c) =>
      c.json(await service.like({ id: c.req.valid("param").id, userId: c.get("auth").user.id })),
  );

  api.delete(
    "/:id/like",
    requireAuth,
    zValidator("param", itineraryIdParamSchema),
    async (c) =>
      c.json(await service.unlike({ id: c.req.valid("param").id, userId: c.get("auth").user.id })),
  );

  api.post(
    "/:id/view",
    requireAuth,
    zValidator("param", itineraryIdParamSchema),
    async (c) =>
      c.json(await service.view({ id: c.req.valid("param").id, userId: c.get("auth").user.id })),
  );

  api.get("/:id", zValidator("param", itineraryIdParamSchema), zValidator("query", itineraryOwnerQuerySchema), async (c) =>
    c.json(await service.getById({ id: c.req.valid("param").id, userId: c.req.valid("query").userId })),
  );

  return api;
}
