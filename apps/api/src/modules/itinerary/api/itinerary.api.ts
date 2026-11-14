import { Hono } from "hono";
import { zValidator } from "../../../shared/http/validator.js";
import type { ItineraryService } from "../services/itinerary.service.js";
import {
  itineraryIdParamSchema,
  itineraryOwnerQuerySchema,
  itinerarySessionParamSchema,
  itineraryVersionParamSchema,
  restoreItineraryVersionSchema,
} from "../schemas/itinerary.schema.js";

export function createItineraryApi(service: ItineraryService) {
  const api = new Hono();

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

  api.get("/:id", zValidator("param", itineraryIdParamSchema), zValidator("query", itineraryOwnerQuerySchema), async (c) =>
    c.json(await service.getById({ id: c.req.valid("param").id, userId: c.req.valid("query").userId })),
  );

  return api;
}
