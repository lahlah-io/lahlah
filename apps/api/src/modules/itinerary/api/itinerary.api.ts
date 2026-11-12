import { Hono } from "hono";
import { zValidator } from "../../../shared/http/validator.js";
import type { ItineraryService } from "../services/itinerary.service.js";
import {
  confirmItinerarySchema,
  itineraryIdParamSchema,
  itineraryOwnerQuerySchema,
  itinerarySessionParamSchema,
  itineraryVersionOwnerSchema,
  itineraryVersionParamSchema,
  publishItineraryVersionSchema,
  restoreItineraryVersionSchema,
} from "../schemas/itinerary.schema.js";

export function createItineraryApi(service: ItineraryService) {
  const api = new Hono();

  api.post("/confirm", zValidator("json", confirmItinerarySchema), async (c) => {
    const result = await service.confirm(c.req.valid("json"));
    return c.json({ data: result.data }, result.created ? 201 : 200);
  });

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
    "/:id/versions/:version/select",
    zValidator("param", itineraryVersionParamSchema),
    zValidator("json", itineraryVersionOwnerSchema),
    async (c) =>
      c.json(
        await service.selectVersionById({
          id: c.req.valid("param").id,
          version: c.req.valid("param").version,
          userId: c.req.valid("json").userId,
        }),
      ),
  );

  api.post(
    "/:id/versions/:version/save",
    zValidator("param", itineraryVersionParamSchema),
    zValidator("json", itineraryVersionOwnerSchema),
    async (c) =>
      c.json(
        await service.setVersionSaved({
          id: c.req.valid("param").id,
          version: c.req.valid("param").version,
          userId: c.req.valid("json").userId,
          isSaved: true,
        }),
      ),
  );

  api.delete(
    "/:id/versions/:version/save",
    zValidator("param", itineraryVersionParamSchema),
    zValidator("query", itineraryOwnerQuerySchema),
    async (c) =>
      c.json(
        await service.setVersionSaved({
          id: c.req.valid("param").id,
          version: c.req.valid("param").version,
          userId: c.req.valid("query").userId,
          isSaved: false,
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
    "/:id/publish/:version",
    zValidator("param", itineraryVersionParamSchema),
    zValidator("json", publishItineraryVersionSchema),
    async (c) =>
      c.json(
        await service.publishVersion({
          id: c.req.valid("param").id,
          version: c.req.valid("param").version,
          userId: c.req.valid("json").userId,
        }),
      ),
  );

  api.get("/:id", zValidator("param", itineraryIdParamSchema), zValidator("query", itineraryOwnerQuerySchema), async (c) =>
    c.json(await service.getById({ id: c.req.valid("param").id, userId: c.req.valid("query").userId })),
  );

  return api;
}
