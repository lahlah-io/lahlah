import { Hono } from "hono";
import { prisma } from "./db/client.js";
import { createChatApi, createChatService } from "./modules/chat/index.js";
import { destinationsApi } from "./modules/destinations/index.js";
import { createItineraryApi, createItineraryService } from "./modules/itinerary/index.js";
import { usersApi } from "./modules/users/index.js";
import { getDraft } from "./modules/chat/services/draft-store.js";
import * as usersRepository from "./modules/users/repositories/users.repository.js";

function toToolRow(row: {
  id: string; name: string; description: string | null; address: string | null;
  latitude: { toNumber(): number } | null; longitude: { toNumber(): number } | null;
  details: unknown; city: string | null; isActive: boolean;
  categories: Array<{ category: { id: string; name: string; slug: string } }>;
}) {
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

const toolSelect = {
  id: true, name: true, description: true, address: true, latitude: true, longitude: true,
  details: true, city: true, isActive: true,
  categories: { select: { category: { select: { id: true, name: true, slug: true } } } },
} as const;

const chatService = createChatService({
  findUserById: (id) => usersRepository.findUserById(id).then((u) => (u ? { id: u.id, isActive: u.isActive } : null)),
  searchDestinations: async (input) => {
    const q = input.keywords?.trim();
    const cats = input.categories?.filter(Boolean) ?? [];
    const rows = await prisma.destination.findMany({
      where: {
        city: "Padang",
        isActive: true,
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
        ...(cats.length ? { categories: { some: { category: { slug: { in: cats } } } } } : {}),
      },
      take: 10,
      select: toolSelect,
    });
    return rows.map(toToolRow);
  },
  getDestinationDetails: async (input) => {
    const rows = await prisma.destination.findMany({
      where: { id: { in: input.destinationIds }, city: "Padang", isActive: true },
      select: toolSelect,
    });
    return rows.map(toToolRow);
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
