import { Hono } from "hono";
import { zValidator } from "../../../shared/http/validator.js";
import type { ItineraryService } from "../services/itinerary.service.js";
import {
  confirmItinerarySchema,
  itineraryIdParamSchema,
  itineraryOwnerQuerySchema,
} from "../schemas/itinerary.schema.js";

export function createItineraryApi(service: ItineraryService) {
  const api = new Hono();

  api.post("/confirm", zValidator("json", confirmItinerarySchema), async (c) => {
    const result = await service.confirm(c.req.valid("json"));
    return c.json({ data: result.data }, result.created ? 201 : 200);
  });

  api.get("/:id", zValidator("param", itineraryIdParamSchema), zValidator("query", itineraryOwnerQuerySchema), async (c) =>
    c.json(await service.getById({ id: c.req.valid("param").id, userId: c.req.valid("query").userId })),
  );

  return api;
}
