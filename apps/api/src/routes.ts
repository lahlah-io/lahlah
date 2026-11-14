import { Hono } from "hono";
import { authApi } from "./modules/auth/index.js";
import { prisma } from "./db/client.js";
import {
  createChatApi,
  createChatService,
  detectRejectedCategories,
  detectRejectedDestinationNames,
  extractCategories,
} from "./modules/chat/index.js";
import { makeRagContextProvider } from "./modules/chat/services/rag.js";
import {
  categoriesApi,
  destinationsApi,
  listKnowledgeBaseDestinations,
} from "./modules/destinations/index.js";
import { createItineraryApi, createItineraryService } from "./modules/itinerary/index.js";
import { modelsApi } from "./modules/models/index.js";
import { subscriptionPlansApi } from "./modules/subscription-plans/index.js";
import { subscriptionsApi } from "./modules/subscriptions/index.js";
import { usersApi } from "./modules/users/index.js";
import { createRouteCache, createRoutingApi, createRoutingService } from "./modules/routing/index.js";
import { env } from "./env.js";
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

// Uncategorized rows are unvetted scraper output; never offer them to the chat.
export function searchDestinationsWhere(input: { keywords?: string; categories?: string[] }) {
  const q = input.keywords?.trim();
  const cats = input.categories?.filter(Boolean) ?? [];
  const catSlugs = [...new Set(cats.flatMap((c) => (c.startsWith("seed-") ? [c.slice(5)] : [c])))];
  return {
    city: "Padang",
    isActive: true,
    source: { not: "admin" as const },
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }] } : {}),
    categories: { some: catSlugs.length ? { category: { slug: { in: catSlugs } } } : {} },
  };
}

const routeCache = createRouteCache({ ttlMs: env.OSRM_CACHE_TTL_HOURS * 3_600_000 });
const routingService = createRoutingService({
  osrmBaseUrl: env.OSRM_BASE_URL,
  timeoutMs: env.OSRM_TIMEOUT_MS,
  cache: routeCache,
});

const itineraryService = createItineraryService({
  findUserById: (id) => usersRepository.findUserById(id).then((u) => (u ? { id: u.id, isActive: u.isActive } : null)),
});

const knowledgeBaseRows = async () => listKnowledgeBaseDestinations();

const chatService = createChatService({
  itinerary: itineraryService,
  findUserById: (id) => usersRepository.findUserById(id).then((u) => (u ? { id: u.id, isActive: u.isActive } : null)),
  retrieveRagContext: makeRagContextProvider(
    knowledgeBaseRows,
    extractCategories,
    detectRejectedCategories,
    detectRejectedDestinationNames,
  ),
  searchDestinations: async (input) => {
    const rows = await prisma.destination.findMany({ where: searchDestinationsWhere(input), take: 10, select: toolSelect });
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

const apiV1 = new Hono();
apiV1.route("/auth", authApi);
apiV1.route("/users", usersApi);
apiV1.route("/models", modelsApi);
apiV1.route("/subscription-plans", subscriptionPlansApi);
apiV1.route("/subscriptions", subscriptionsApi);
apiV1.route("/categories", categoriesApi);
apiV1.route("/destinations", destinationsApi);
apiV1.route("/chat", createChatApi(chatService));
apiV1.route("/itineraries", createItineraryApi(itineraryService));
apiV1.route("/routes", createRoutingApi(routingService));

const routes = new Hono();
routes.route("/api/v1", apiV1);

export { routes };
