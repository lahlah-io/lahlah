import { Hono } from "hono";
import { requireAdmin, type AuthVariables } from "../../../shared/auth/middleware.js";
import { zValidator } from "../../../shared/http/validator.js";
import {
  createDestination,
  deleteDestination,
  getDestination,
  listDestinations,
  updateDestination,
} from "../services/destinations.service.js";
import {
  createDestinationSchema,
  destinationIdSchema,
  listDestinationsQuerySchema,
  updateDestinationSchema,
} from "../schemas/destination.schema.js";

const destinationsApi = new Hono<{ Variables: AuthVariables }>();

// GET publik: chat/RAG butuh katalog tanpa sesi admin. Tulis tetap requireAdmin.
destinationsApi.get("/", zValidator("query", listDestinationsQuerySchema), async (c) =>
  c.json(await listDestinations(c.req.valid("query"))),
);

destinationsApi.get("/:id", zValidator("param", destinationIdSchema), async (c) =>
  c.json({ data: await getDestination(c.req.valid("param").id) }),
);

destinationsApi.post("/", requireAdmin, zValidator("json", createDestinationSchema), async (c) =>
  c.json({ data: await createDestination(c.req.valid("json"), c.get("auth").user) }, 201),
);

destinationsApi.patch(
  "/:id",
  requireAdmin,
  zValidator("param", destinationIdSchema),
  zValidator("json", updateDestinationSchema),
  async (c) =>
    c.json({
      data: await updateDestination(
        c.req.valid("param").id,
        c.req.valid("json"),
        c.get("auth").user,
      ),
    }),
);

destinationsApi.delete("/:id", requireAdmin, zValidator("param", destinationIdSchema), async (c) =>
  c.json({ data: await deleteDestination(c.req.valid("param").id, c.get("auth").user) }),
);

export { destinationsApi };
