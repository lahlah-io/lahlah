import { Hono } from "hono";
import { createChatApi, createChatService } from "./modules/chat/index.js";
import { destinationsApi } from "./modules/destinations/index.js";
import { createItineraryApi, createItineraryService } from "./modules/itinerary/index.js";
import { usersApi } from "./modules/users/index.js";
import { getDraft } from "./modules/chat/services/draft-store.js";
import * as usersRepository from "./modules/users/repositories/users.repository.js";
import * as destinationsRepository from "./modules/destinations/repositories/destinations.repository.js";

function toDestinationToolRow(row: NonNullable<Awaited<ReturnType<typeof destinationsRepository.findDestinationById>>>) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    address: row.address,
    latitude: row.latitude == null ? null : row.latitude.toNumber(),
    longitude: row.longitude == null ? null : row.longitude.toNumber(),
    details: row.details,
    categories: row.categories.map((c) => c.category),
    city: row.city,
    isActive: row.isActive,
  };
}

const chatService = createChatService({
  findUserById: (id) => usersRepository.findUserById(id).then((u) => (u ? { id: u.id, isActive: u.isActive } : null)),
  searchDestinations: async (input) => {
    const result = await destinationsRepository.findDestinations({
      city: "Padang",
      page: 1,
      limit: 10,
      ...(input.categories?.[0] ? { category: input.categories[0] } : {}),
    });
    const q = input.keywords?.trim().toLowerCase();
    return result.data
      .filter((r) => !q || `${r.name} ${r.description ?? ""}`.toLowerCase().includes(q))
      .map(toDestinationToolRow);
  },
  getDestinationDetails: async (input) => {
    const rows = await Promise.all(input.destinationIds.map((id) => destinationsRepository.findDestinationById(id)));
    return rows.filter((r): r is NonNullable<typeof r> => r != null).map(toDestinationToolRow);
  },
});

const itineraryService = createItineraryService({
  getDraft,
  findUserById: (id) => usersRepository.findUserById(id).then((u) => (u ? { id: u.id, isActive: u.isActive } : null)),
});

const apiV1 = new Hono();
apiV1.route("/users", usersApi);
apiV1.route("/destinations", destinationsApi);
apiV1.route("/chat", createChatApi(chatService));
apiV1.route("/itineraries", createItineraryApi(itineraryService));

const routes = new Hono();
routes.route("/api/v1", apiV1);

export { routes };
