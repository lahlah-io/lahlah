import { Hono } from "hono";
import { zValidator } from "../../../shared/http/validator.js";
import { getDestination, listDestinations } from "../services/destinations.service.js";
import { destinationIdSchema, listDestinationsQuerySchema } from "../schemas/destination.schema.js";

const destinationsApi = new Hono();

destinationsApi.get("/", zValidator("query", listDestinationsQuerySchema), async (c) =>
  c.json(await listDestinations(c.req.valid("query"))),
);

destinationsApi.get("/:id", zValidator("param", destinationIdSchema), async (c) =>
  c.json({ data: await getDestination(c.req.valid("param").id) }),
);

export { destinationsApi };
