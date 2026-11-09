import { z } from "zod";
import {
  createSessionSchema,
  listMessagesQuerySchema,
  listSessionsQuerySchema,
  sendMessageSchema,
  sessionIdParamSchema,
} from "./modules/chat/schemas/chat.schema.js";
import { destinationIdSchema, listDestinationsQuerySchema } from "./modules/destinations/schemas/destination.schema.js";
import {
  confirmItinerarySchema,
  itineraryIdParamSchema,
  itineraryOwnerQuerySchema,
} from "./modules/itinerary/schemas/itinerary.schema.js";
import { routeRequestSchema } from "./modules/routing/schemas/routing.schema.js";
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  userIdSchema,
} from "./modules/users/schemas/user.schema.js";

type JsonSchema = Record<string, unknown>;

/** Zod schema -> JSON Schema for OpenAPI 3.1 (draft 2020-12). */
function toJson(schema: z.ZodType, io: "input" | "output" = "input"): JsonSchema {
  const { $schema: _schema, ...rest } = z.toJSONSchema(schema, { io, unrepresentable: "any" });
  return rest as JsonSchema;
}

/** Turn an object schema into OpenAPI parameters. Path params are always required. */
function params(schema: z.ZodType, location: "path" | "query") {
  const json = toJson(schema);
  const properties = (json.properties ?? {}) as Record<string, JsonSchema>;
  const required = Array.isArray(json.required) ? (json.required as string[]) : [];
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: location,
    required: location === "path" || required.includes(name),
    schema: property,
  }));
}

const jsonBody = (schema: z.ZodType) => ({
  required: true,
  content: { "application/json": { schema: toJson(schema) } },
});

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const envelope = (name: string) => ({
  type: "object",
  required: ["data"],
  properties: { data: ref(name) },
});
const listEnvelope = (name: string) => ({
  type: "object",
  required: ["data", "meta"],
  properties: { data: { type: "array", items: ref(name) }, meta: ref("PaginationMeta") },
});
const response = (description: string, schema?: object) =>
  schema ? { description, content: { "application/json": { schema } } } : { description };
const errorResponse = (description: string) => response(description, ref("ErrorEnvelope"));

const jsonObject = z.record(z.string(), z.unknown());

const errorEnvelope = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

const paginationMeta = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
});

const user = z.object({
  id: z.uuid(),
  pid: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: z.enum(["user", "admin"]),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const category = z.object({ id: z.uuid(), name: z.string(), slug: z.string() });

const destination = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  isActive: z.boolean(),
  imageUrl: z.string().nullable(),
  details: jsonObject,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  categories: z.array(category),
});

const chatSession = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  modelId: z.uuid(),
  title: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const chatMessage = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  modelId: z.uuid().nullable(),
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  metadata: jsonObject,
  createdAt: z.iso.datetime(),
});

const lineString = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(z.tuple([z.number(), z.number()])),
});

const itineraryDraft = z.object({
  draftId: z.uuid(),
  status: z.literal("pending_confirmation"),
  travelDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  destinations: z.array(
    z.object({
      order: z.number().int(),
      destinationId: z.uuid(),
      name: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      visitAt: z.string(),
      durationMinutes: z.number().int(),
    }),
  ),
  route: lineString.nullable(),
});

const chatReply = z.object({
  message: z.string(),
  intent: z.enum([
    "general_chat",
    "generate_itinerary",
    "modify_itinerary",
    "regenerate_itinerary",
    "confirm_itinerary",
    "missing_information",
  ]),
  draft: itineraryDraft.nullable(),
  assistantMessageId: z.uuid(),
  sessionId: z.uuid(),
});

const itineraryDestination = z.object({
  id: z.uuid(),
  itineraryId: z.uuid(),
  destinationId: z.uuid(),
  visitAt: z.iso.datetime().nullable(),
  estimatedCost: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

const itinerary = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  sessionId: z.uuid().nullable(),
  title: z.string(),
  content: z.string(),
  status: z.enum(["draft", "final"]),
  isPublic: z.boolean(),
  shareSlug: z.string().nullable(),
  metadata: jsonObject,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  destinations: z.array(itineraryDestination),
});

const routeResult = z.object({
  source: z.enum(["osrm", "cache", "fallback"]),
  distanceKm: z.number().nullable(),
  durationMin: z.number().nullable(),
  estimated: z.boolean(),
  error: z.string().optional(),
  geometry: lineString,
});

const health = z.object({ status: z.literal("ok"), requestId: z.string() });

const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Lahlah API",
    version: "1.0.0",
    description:
      "API perencanaan perjalanan Padang. Semua endpoint fitur berada di bawah `/api/v1`. " +
      "Belum ada autentikasi: endpoint users, chat, dan itinerary mengembalikan 503 di production " +
      "sampai auth tersedia, dan `userId` dikirim langsung di body/query. Dokumentasi ini hanya " +
      "tersedia saat `NODE_ENV` bukan `production`.",
  },
  servers: [{ url: "http://localhost:8787", description: "Lokal" }],
  tags: [
    { name: "health", description: "Pemeriksaan proses dan database." },
    { name: "users", description: "CRUD user (nonaktif di production)." },
    { name: "destinations", description: "Destinasi wisata Padang." },
    { name: "chat", description: "Sesi chat dan generator itinerary (nonaktif di production)." },
    { name: "itineraries", description: "Konfirmasi dan pengambilan itinerary (nonaktif di production)." },
    { name: "routes", description: "Rute berkendara via OSRM dengan fallback garis lurus." },
  ],
  components: {
    schemas: {
      ErrorEnvelope: toJson(errorEnvelope),
      PaginationMeta: toJson(paginationMeta),
      User: toJson(user),
      Category: toJson(category),
      Destination: toJson(destination),
      ChatSession: toJson(chatSession),
      ChatMessage: toJson(chatMessage),
      ChatReply: toJson(chatReply),
      ItineraryDraft: toJson(itineraryDraft),
      ItineraryDestination: toJson(itineraryDestination),
      Itinerary: toJson(itinerary),
      RouteResult: toJson(routeResult),
      Health: toJson(health),
    },
  },
  paths: {
    "/": {
      get: {
        tags: ["health"],
        summary: "Identitas API",
        responses: { "200": response("OK", { type: "object", properties: { name: { type: "string" } } }) },
      },
    },
    "/health": {
      get: {
        tags: ["health"],
        summary: "Health check",
        responses: { "200": response("OK", ref("Health")) },
      },
    },
    "/health/live": {
      get: {
        tags: ["health"],
        summary: "Liveness",
        responses: { "200": response("Proses aktif", ref("Health")) },
      },
    },
    "/health/ready": {
      get: {
        tags: ["health"],
        summary: "Readiness",
        responses: {
          "200": response("Proses dan database siap", {
            type: "object",
            required: ["status", "dependencies"],
            properties: {
              status: { type: "string", const: "ok" },
              dependencies: { type: "object", properties: { database: { type: "string", const: "ok" } } },
              requestId: { type: "string" },
            },
          }),
          "503": response("Database tidak tersedia", {
            type: "object",
            properties: {
              status: { type: "string", const: "not_ready" },
              dependencies: { type: "object", properties: { database: { type: "string", const: "unavailable" } } },
              requestId: { type: "string" },
            },
          }),
        },
      },
    },
    "/api/v1/users": {
      get: {
        tags: ["users"],
        summary: "Daftar user",
        description: "Dibatasi 1-100 data per halaman. Dinonaktifkan (503) di production sampai auth tersedia.",
        parameters: params(listUsersQuerySchema, "query"),
        responses: {
          "200": response("OK", listEnvelope("User")),
          "400": errorResponse("Validasi query gagal"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
      post: {
        tags: ["users"],
        summary: "Buat user",
        parameters: [],
        requestBody: jsonBody(createUserSchema),
        responses: {
          "201": response("Dibuat", envelope("User")),
          "400": errorResponse("Validasi body gagal"),
          "409": errorResponse("Email sudah dipakai"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
    },
    "/api/v1/users/{id}": {
      get: {
        tags: ["users"],
        summary: "Detail user",
        parameters: params(userIdSchema, "path"),
        responses: {
          "200": response("OK", envelope("User")),
          "400": errorResponse("ID bukan UUID"),
          "404": errorResponse("User tidak ditemukan"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
      patch: {
        tags: ["users"],
        summary: "Ubah user",
        parameters: params(userIdSchema, "path"),
        requestBody: jsonBody(updateUserSchema),
        responses: {
          "200": response("OK", envelope("User")),
          "400": errorResponse("Validasi body gagal"),
          "404": errorResponse("User tidak ditemukan"),
          "409": errorResponse("Email sudah dipakai"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
      delete: {
        tags: ["users"],
        summary: "Nonaktifkan user (soft delete)",
        parameters: params(userIdSchema, "path"),
        responses: {
          "200": response("User dinonaktifkan", envelope("User")),
          "400": errorResponse("ID bukan UUID"),
          "404": errorResponse("User tidak ditemukan"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
    },
    "/api/v1/destinations": {
      get: {
        tags: ["destinations"],
        summary: "Daftar destinasi aktif",
        parameters: params(listDestinationsQuerySchema, "query"),
        responses: {
          "200": response("OK", listEnvelope("Destination")),
          "400": errorResponse("Validasi query gagal"),
        },
      },
    },
    "/api/v1/destinations/{id}": {
      get: {
        tags: ["destinations"],
        summary: "Detail destinasi",
        parameters: params(destinationIdSchema, "path"),
        responses: {
          "200": response("OK", envelope("Destination")),
          "400": errorResponse("ID bukan UUID"),
          "404": errorResponse("Destinasi tidak ditemukan"),
        },
      },
    },
    "/api/v1/chat/sessions": {
      post: {
        tags: ["chat"],
        summary: "Buat sesi chat",
        requestBody: jsonBody(createSessionSchema),
        responses: {
          "201": response("Dibuat", envelope("ChatSession")),
          "400": errorResponse("Validasi body gagal"),
          "401": errorResponse("User tidak aktif"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
      get: {
        tags: ["chat"],
        summary: "Daftar sesi chat milik user",
        parameters: params(listSessionsQuerySchema, "query"),
        responses: {
          "200": response("OK", listEnvelope("ChatSession")),
          "400": errorResponse("Validasi query gagal"),
          "401": errorResponse("User tidak aktif"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
    },
    "/api/v1/chat/sessions/{id}/messages": {
      get: {
        tags: ["chat"],
        summary: "Daftar pesan sesi",
        parameters: [...params(sessionIdParamSchema, "path"), ...params(listMessagesQuerySchema, "query")],
        responses: {
          "200": response("OK", listEnvelope("ChatMessage")),
          "400": errorResponse("Validasi parameter gagal"),
          "401": errorResponse("User tidak aktif"),
          "403": errorResponse("Sesi milik user lain"),
          "404": errorResponse("Sesi tidak ditemukan"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
      post: {
        tags: ["chat"],
        summary: "Kirim pesan ke sesi",
        description: "Mengembalikan balasan asisten, intent, dan draft itinerary bila pesan memenuhi syarat.",
        parameters: params(sessionIdParamSchema, "path"),
        requestBody: jsonBody(sendMessageSchema),
        responses: {
          "200": response("Balasan asisten", envelope("ChatReply")),
          "400": errorResponse("Validasi body gagal"),
          "401": errorResponse("User tidak aktif"),
          "403": errorResponse("Sesi milik user lain"),
          "404": errorResponse("Sesi tidak ditemukan"),
          "422": errorResponse("Tidak ada destinasi yang cocok untuk draft"),
          "502": errorResponse("Provider AI gagal"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
    },
    "/api/v1/itineraries/confirm": {
      post: {
        tags: ["itineraries"],
        summary: "Konfirmasi draft itinerary",
        description:
          "Menyimpan draft in-memory menjadi itinerary final. Idempoten per `sessionId`: konfirmasi ulang " +
          "mengembalikan 200 dengan data yang sudah ada.",
        requestBody: jsonBody(confirmItinerarySchema),
        responses: {
          "200": response("Itinerary sudah ada", envelope("Itinerary")),
          "201": response("Itinerary dibuat", envelope("Itinerary")),
          "400": errorResponse("Validasi body gagal"),
          "401": errorResponse("User tidak aktif"),
          "403": errorResponse("Sesi milik user lain atau draft bukan milik user"),
          "404": errorResponse("Draft tidak ditemukan atau kedaluwarsa"),
          "409": errorResponse("Konfirmasi bentrok"),
          "422": errorResponse("Destinasi draft tidak tersedia"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
    },
    "/api/v1/itineraries/{id}": {
      get: {
        tags: ["itineraries"],
        summary: "Detail itinerary milik user",
        parameters: [...params(itineraryIdParamSchema, "path"), ...params(itineraryOwnerQuerySchema, "query")],
        responses: {
          "200": response("OK", envelope("Itinerary")),
          "400": errorResponse("Validasi parameter gagal"),
          "401": errorResponse("User tidak aktif"),
          "404": errorResponse("Itinerary tidak ditemukan untuk user tersebut"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
    },
    "/api/v1/routes/driving": {
      post: {
        tags: ["routes"],
        summary: "Rute berkendara",
        description:
          "Meminta rute OSRM. Bila OSRM gagal, respons tetap 200 dengan `source: \"fallback\"` dan geometri garis lurus.",
        requestBody: jsonBody(routeRequestSchema),
        responses: {
          "200": response("Rute atau fallback", envelope("RouteResult")),
          "400": errorResponse("Validasi body gagal"),
        },
      },
    },
  },
} satisfies Record<string, unknown>;

const apiDocsHtml = `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lahlah API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({ url: "/openapi.json", dom_id: "#swagger-ui" });
    </script>
  </body>
</html>`;

const responseSchemas = {
  ErrorEnvelope: errorEnvelope,
  PaginationMeta: paginationMeta,
  User: user,
  Category: category,
  Destination: destination,
  ChatSession: chatSession,
  ChatMessage: chatMessage,
  ChatReply: chatReply,
  ItineraryDraft: itineraryDraft,
  ItineraryDestination: itineraryDestination,
  Itinerary: itinerary,
  RouteResult: routeResult,
  Health: health,
};

const asEnvelope = <T extends z.ZodType>(schema: T) => z.object({ data: schema });
const asList = <T extends z.ZodType>(schema: T) =>
  z.object({ data: z.array(schema), meta: paginationMeta });

/** Runtime response validators used by integration/shape tests to catch doc drift. */
const responseShapes = {
  health: health,
  error: errorEnvelope,
  user: asEnvelope(user),
  userList: asList(user),
  destination: asEnvelope(destination),
  destinationList: asList(destination),
  chatSession: asEnvelope(chatSession),
  chatSessionList: asList(chatSession),
  chatMessageList: asList(chatMessage),
  chatReply: asEnvelope(chatReply),
  itinerary: asEnvelope(itinerary),
  routeResult: asEnvelope(routeResult),
};

export { apiDocsHtml, openApiDocument, responseSchemas, responseShapes };
