import { z } from "zod";
import { intentLabels } from "./modules/chat/services/classifier.js";
import {
  activateVersionSchema,
  createSessionSchema,
  deleteSessionQuerySchema,
  getSessionQuerySchema,
  listMessagesQuerySchema,
  listSessionsQuerySchema,
  listVersionsQuerySchema,
  messageIdParamSchema,
  messageVersionParamSchema,
  regenerateMessageSchema,
  sendMessageSchema,
  sessionIdParamSchema,
  updateSessionSchema,
} from "./modules/chat/schemas/chat.schema.js";
import { destinationIdSchema, listDestinationsQuerySchema } from "./modules/destinations/schemas/destination.schema.js";
import {
  confirmItinerarySchema,
  itineraryIdParamSchema,
  itineraryOwnerQuerySchema,
  itinerarySessionParamSchema,
  itineraryVersionParamSchema,
  restoreItineraryVersionSchema,
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
const keysetEnvelope = (name: string) => ({
  type: "object",
  required: ["data", "meta"],
  properties: { data: { type: "array", items: ref(name) }, meta: ref("KeysetMeta") },
});
const dataArrayEnvelope = (name: string) => ({
  type: "object",
  required: ["data"],
  properties: { data: { type: "array", items: ref(name) } },
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

const keysetMeta = z.object({
  limit: z.number().int(),
  nextAfterPosition: z.number().int().nullable(),
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
  status: z.string(),
  summary: z.string().nullable(),
  contextJson: jsonObject,
  metadata: jsonObject,
  promptTokens: z.number().int(),
  completionTokens: z.number().int(),
  totalTokens: z.number().int(),
  lastMessageAt: z.iso.datetime().nullable(),
  schemaVersion: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const chatMessage = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  modelId: z.uuid().nullable(),
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
  position: z.number().int(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  metadata: jsonObject,
  createdAt: z.iso.datetime(),
});

const messageVersion = z.object({
  version: z.number().int(),
  content: z.string(),
  status: z.string(),
  createdAt: z.iso.datetime(),
  model: z.string().optional(),
  latencyMs: z.number().int().optional(),
  toolCalls: z.array(z.unknown()).optional(),
  usage: z
    .object({
      promptTokens: z.number().int(),
      completionTokens: z.number().int(),
      totalTokens: z.number().int(),
    })
    .optional(),
  editInstruction: z.string().optional(),
  errorJson: z.unknown().optional(),
  inputTokens: z.number().int().optional(),
  outputTokens: z.number().int().optional(),
  metadata: z.unknown().optional(),
});

const chatMessageDetailed = chatMessage.extend({
  toolCallsJson: z.unknown().nullable(),
  toolCallId: z.string().nullable(),
  mode: z.string().nullable(),
  model: z.string().nullable(),
  latencyMs: z.number().int().nullable(),
  status: z.string(),
  errorJson: z.unknown().nullable(),
  versionsJson: z.array(messageVersion),
  activeVersion: z.number().int(),
  schemaVersion: z.number().int(),
});

const messageVersionList = z.object({
  messageId: z.uuid(),
  sessionId: z.uuid(),
  activeVersion: z.number().int(),
  versions: z.array(messageVersion),
  versionsJson: z.array(messageVersion),
});

const chatVersionActivation = z.object({
  messageId: z.uuid(),
  sessionId: z.uuid(),
  activeVersion: z.number().int(),
  content: z.string(),
  status: z.string(),
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
  intent: z.enum(intentLabels),
  draft: itineraryDraft.nullable(),
  assistantMessageId: z.uuid(),
  sessionId: z.uuid(),
});

const chatRegenerateResult = z.object({
  assistantMessageId: z.uuid(),
  sessionId: z.uuid(),
  message: z.string(),
  intent: z.enum(intentLabels),
  draft: itineraryDraft.nullable(),
  activeVersion: z.number().int(),
});

const sessionDeleteResult = z.object({ deleted: z.literal(true) });

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
  currentVersion: z.number().int(),
  tripDate: z.iso.datetime().nullable(),
  durationDays: z.number().int(),
  city: z.string(),
  transportMode: z.string().nullable(),
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

const itineraryStop = z.object({
  id: z.uuid(),
  itineraryVersionId: z.uuid(),
  destinationId: z.uuid().nullable(),
  position: z.number().int(),
  name: z.string(),
  latitude: z.union([z.number(), z.string()]),
  longitude: z.union([z.number(), z.string()]),
  arrivalTime: z.string().nullable(),
  departureTime: z.string().nullable(),
  visitDurationMin: z.number().int().nullable(),
  travelDurationMin: z.number().int().nullable(),
  notes: z.string().nullable(),
  category: z.string().nullable(),
  snapshotJson: jsonObject.nullable(),
});

const routeLeg = z.object({
  fromPosition: z.number().int(),
  toPosition: z.number().int(),
  transportMode: z.string(),
  distanceM: z.number().int().nullable(),
  durationSec: z.number().int().nullable(),
  geometry: lineString.nullable(),
  provider: z.string().nullable(),
  profile: z.string().nullable(),
  fallback: z.boolean(),
});

const itineraryVersion = z.object({
  id: z.uuid(),
  itineraryId: z.uuid(),
  version: z.number().int(),
  basedOnVersion: z.number().int().nullable(),
  changeInstruction: z.string().nullable(),
  changeType: z.string(),
  totalDistanceM: z.number().int().nullable(),
  totalDurationMin: z.number().int().nullable(),
  totalEstimatedMin: z.number().int().nullable(),
  status: z.string(),
  sourceMessageId: z.uuid().nullable(),
  routeJson: lineString.extend({ legs: z.array(routeLeg) }).nullable(),
  expiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  stops: z.array(itineraryStop),
});

const itineraryVersionSummary = z.object({
  version: z.number().int(),
  basedOnVersion: z.number().int().nullable(),
  changeType: z.string(),
  changeInstruction: z.string().nullable(),
  status: z.string(),
  totalDistanceM: z.number().int().nullable(),
  totalDurationMin: z.number().int().nullable(),
  totalEstimatedMin: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
  stopCount: z.number().int(),
  routeCount: z.number().int(),
});

const itineraryDetail = itinerary.extend({
  version: itineraryVersion.nullable(),
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
  servers: [
    { url: "http://localhost:8787", description: "Lokal (default env)" },
    { url: "http://localhost:8989", description: "Lokal (contoh PORT di apps/api/.env)" },
  ],
  tags: [
    { name: "health", description: "Pemeriksaan proses dan database." },
    { name: "users", description: "CRUD user (nonaktif di production)." },
    { name: "destinations", description: "Destinasi wisata Padang." },
    { name: "chat", description: "Sesi chat, versioning pesan, dan generator itinerary (nonaktif di production)." },
    { name: "itineraries", description: "Konfirmasi, versi, restore, dan pengambilan itinerary (nonaktif di production)." },
    { name: "routes", description: "Rute perjalanan via OSRM dengan fallback garis lurus." },
  ],
  components: {
    schemas: {
      ErrorEnvelope: toJson(errorEnvelope),
      PaginationMeta: toJson(paginationMeta),
      KeysetMeta: toJson(keysetMeta),
      User: toJson(user),
      Category: toJson(category),
      Destination: toJson(destination),
      ChatSession: toJson(chatSession),
      ChatMessage: toJson(chatMessage),
      ChatMessageDetailed: toJson(chatMessageDetailed),
      MessageVersion: toJson(messageVersion),
      MessageVersionList: toJson(messageVersionList),
      ChatReply: toJson(chatReply),
      ChatRegenerateResult: toJson(chatRegenerateResult),
      ChatVersionActivation: toJson(chatVersionActivation),
      SessionDeleteResult: toJson(sessionDeleteResult),
      ItineraryDraft: toJson(itineraryDraft),
      ItineraryDestination: toJson(itineraryDestination),
      Itinerary: toJson(itinerary),
      ItineraryStop: toJson(itineraryStop),
      ItineraryRouteJson: toJson(itineraryVersion.shape.routeJson.unwrap()),
      ItineraryVersion: toJson(itineraryVersion),
      ItineraryVersionSummary: toJson(itineraryVersionSummary),
      ItineraryDetail: toJson(itineraryDetail),
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
    "/api/v1/chat/sessions/{id}": {
      get: {
        tags: ["chat"],
        summary: "Detail sesi chat",
        parameters: [...params(sessionIdParamSchema, "path"), ...params(getSessionQuerySchema, "query")],
        responses: {
          "200": response("OK", envelope("ChatSession")),
          "400": errorResponse("Validasi parameter gagal"),
          "401": errorResponse("User tidak aktif"),
          "404": errorResponse("Sesi tidak ditemukan untuk user tersebut"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
      patch: {
        tags: ["chat"],
        summary: "Ubah sesi chat",
        description: "Minimal satu dari `title`, `summary`, atau `status` harus dikirim.",
        parameters: params(sessionIdParamSchema, "path"),
        requestBody: jsonBody(updateSessionSchema),
        responses: {
          "200": response("OK", envelope("ChatSession")),
          "400": errorResponse("Validasi body gagal"),
          "401": errorResponse("User tidak aktif"),
          "404": errorResponse("Sesi tidak ditemukan untuk user tersebut"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
      delete: {
        tags: ["chat"],
        summary: "Hapus sesi chat",
        parameters: [...params(sessionIdParamSchema, "path"), ...params(deleteSessionQuerySchema, "query")],
        responses: {
          "200": response("Sesi dihapus", envelope("SessionDeleteResult")),
          "400": errorResponse("Validasi parameter gagal"),
          "401": errorResponse("User tidak aktif"),
          "404": errorResponse("Sesi tidak ditemukan untuk user tersebut"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
    },
    "/api/v1/chat/sessions/{id}/messages": {
      get: {
        tags: ["chat"],
        summary: "Daftar pesan sesi",
        description:
          "Tanpa `after_position`/`afterPosition`, respons memakai `page`/`limit` dan meta `PaginationMeta`. " +
          "Dengan `after_position`/`afterPosition`, respons memakai keyset: item memuat field versioning dan meta `KeysetMeta`.",
        parameters: [...params(sessionIdParamSchema, "path"), ...params(listMessagesQuerySchema, "query")],
        responses: {
          "200": response("OK", {
            oneOf: [listEnvelope("ChatMessage"), keysetEnvelope("ChatMessageDetailed")],
          }),
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
    "/api/v1/chat/messages/{id}/regenerate": {
      post: {
        tags: ["chat"],
        summary: "Regenerate pesan asisten",
        description:
          "Membuat versi baru pada pesan asisten yang sama. Bila provider gagal, versi gagal dicatat dan versi sukses sebelumnya tetap aktif.",
        parameters: params(messageIdParamSchema, "path"),
        requestBody: jsonBody(regenerateMessageSchema),
        responses: {
          "200": response("Versi baru dibuat", envelope("ChatRegenerateResult")),
          "400": errorResponse("Validasi body gagal"),
          "401": errorResponse("User tidak aktif"),
          "403": errorResponse("Pesan milik user lain"),
          "404": errorResponse("Pesan tidak ditemukan"),
          "422": errorResponse("Pesan bukan assistant atau konteks user tidak ada"),
          "502": errorResponse("Provider AI gagal"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
    },
    "/api/v1/chat/messages/{id}/versions": {
      get: {
        tags: ["chat"],
        summary: "Daftar versi pesan",
        parameters: [...params(messageIdParamSchema, "path"), ...params(listVersionsQuerySchema, "query")],
        responses: {
          "200": response("OK", envelope("MessageVersionList")),
          "400": errorResponse("Validasi parameter gagal"),
          "401": errorResponse("User tidak aktif"),
          "403": errorResponse("Pesan milik user lain"),
          "404": errorResponse("Pesan tidak ditemukan"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
    },
    "/api/v1/chat/messages/{id}/versions/{version}/activate": {
      patch: {
        tags: ["chat"],
        summary: "Aktifkan versi pesan",
        description: "Mengganti isi aktif pesan ke versi yang dipilih tanpa menghapus versi lain.",
        parameters: params(messageVersionParamSchema, "path"),
        requestBody: jsonBody(activateVersionSchema),
        responses: {
          "200": response("Versi diaktifkan", envelope("ChatVersionActivation")),
          "400": errorResponse("Validasi parameter atau body gagal"),
          "401": errorResponse("User tidak aktif"),
          "403": errorResponse("Pesan milik user lain"),
          "404": errorResponse("Pesan atau versi tidak ditemukan"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
    },
    "/api/v1/itineraries/confirm": {
      post: {
        tags: ["itineraries"],
        summary: "Konfirmasi draft itinerary",
        description:
          "Menyimpan draft dari database menjadi itinerary berstatus `confirmed` dengan snapshot versi pertama " +
          "(stops dan route legs). Dapat mengirim `profile` (`car|motorcycle|foot`, default `car`) untuk menghitung rute jalan per leg saat konfirmasi; " +
          "hasil rute persisten per leg (geometry/totals/provider/mode/profile) dengan `fallback` per leg jika tidak tersedia. " +
          "Idempoten per `sessionId`: konfirmasi ulang mengembalikan 200 dengan data yang sudah ada. Field `status` di respons memakai alias legacy `final`.",
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
    "/api/v1/itineraries/by-session/{sessionId}": {
      get: {
        tags: ["itineraries"],
        summary: "Detail itinerary berdasarkan sesi",
        description: "Mengembalikan itinerary dan snapshot versi aktif milik sesi tersebut.",
        parameters: [...params(itinerarySessionParamSchema, "path"), ...params(itineraryOwnerQuerySchema, "query")],
        responses: {
          "200": response("OK", envelope("ItineraryDetail")),
          "400": errorResponse("Validasi parameter gagal"),
          "401": errorResponse("User tidak aktif"),
          "404": errorResponse("Itinerary tidak ditemukan untuk user tersebut"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
    },
    "/api/v1/itineraries/{id}/versions": {
      get: {
        tags: ["itineraries"],
        summary: "Riwayat versi itinerary",
        parameters: [...params(itineraryIdParamSchema, "path"), ...params(itineraryOwnerQuerySchema, "query")],
        responses: {
          "200": response("OK", dataArrayEnvelope("ItineraryVersionSummary")),
          "400": errorResponse("Validasi parameter gagal"),
          "401": errorResponse("User tidak aktif"),
          "404": errorResponse("Itinerary tidak ditemukan untuk user tersebut"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
    },
    "/api/v1/itineraries/{id}/versions/{version}": {
      get: {
        tags: ["itineraries"],
        summary: "Detail satu versi itinerary",
        parameters: [...params(itineraryVersionParamSchema, "path"), ...params(itineraryOwnerQuerySchema, "query")],
        responses: {
          "200": response("OK", envelope("ItineraryVersion")),
          "400": errorResponse("Validasi parameter gagal"),
          "401": errorResponse("User tidak aktif"),
          "404": errorResponse("Itinerary atau versi tidak ditemukan"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
    },
    "/api/v1/itineraries/{id}/restore/{version}": {
      post: {
        tags: ["itineraries"],
        summary: "Pulihkan versi itinerary",
        description:
          "Menyalin snapshot versi lama menjadi versi baru yang immutable. Versi lama tidak diubah. " +
          "Kirim `expectedVersion` untuk optimistic concurrency; bila tidak cocok, respons 409 `VERSION_CONFLICT`.",
        parameters: params(itineraryVersionParamSchema, "path"),
        requestBody: jsonBody(restoreItineraryVersionSchema),
        responses: {
          "200": response("Versi baru dibuat dari snapshot", envelope("ItineraryDetail")),
          "400": errorResponse("Validasi parameter atau body gagal"),
          "401": errorResponse("User tidak aktif"),
          "403": errorResponse("Itinerary milik user lain"),
          "404": errorResponse("Itinerary atau versi tidak ditemukan"),
          "409": errorResponse("Versi berubah (VERSION_CONFLICT)"),
          "503": errorResponse("Auth belum dikonfigurasi"),
        },
      },
    },
    "/api/v1/itineraries/{id}": {
      get: {
        tags: ["itineraries"],
        summary: "Detail itinerary milik user",
        description: "Mengembalikan itinerary beserta snapshot versi aktif (stops dan route legs).",
        parameters: [...params(itineraryIdParamSchema, "path"), ...params(itineraryOwnerQuerySchema, "query")],
        responses: {
          "200": response("OK", envelope("ItineraryDetail")),
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
        summary: "Hitung rute perjalanan",
        description:
          "Meminta rute OSRM untuk profil `car`, `motorcycle`, atau `foot`. `motorcycle` dipetakan ke rute driving dengan estimasi durasi. Bila OSRM gagal/timeout, respons tetap 200 dengan `source: \"fallback\"` dan geometri garis lurus (gambar sebagai garis putus-putus).",
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
  KeysetMeta: keysetMeta,
  User: user,
  Category: category,
  Destination: destination,
  ChatSession: chatSession,
  ChatMessage: chatMessage,
  ChatMessageDetailed: chatMessageDetailed,
  MessageVersion: messageVersion,
  MessageVersionList: messageVersionList,
  ChatReply: chatReply,
  ChatRegenerateResult: chatRegenerateResult,
  ChatVersionActivation: chatVersionActivation,
  SessionDeleteResult: sessionDeleteResult,
  ItineraryDraft: itineraryDraft,
  ItineraryDestination: itineraryDestination,
  Itinerary: itinerary,
  ItineraryStop: itineraryStop,
  ItineraryRouteJson: itineraryVersion.shape.routeJson.unwrap(),
  ItineraryVersion: itineraryVersion,
  ItineraryVersionSummary: itineraryVersionSummary,
  ItineraryDetail: itineraryDetail,
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
  chatMessageKeysetList: z.object({ data: z.array(chatMessageDetailed), meta: keysetMeta }),
  chatReply: asEnvelope(chatReply),
  chatRegenerate: asEnvelope(chatRegenerateResult),
  chatVersionList: asEnvelope(messageVersionList),
  chatVersionActivation: asEnvelope(chatVersionActivation),
  sessionDelete: asEnvelope(sessionDeleteResult),
  itinerary: asEnvelope(itinerary),
  itineraryDetail: asEnvelope(itineraryDetail),
  itineraryVersion: asEnvelope(itineraryVersion),
  itineraryVersionList: z.object({ data: z.array(itineraryVersionSummary) }),
  routeResult: asEnvelope(routeResult),
};

export { apiDocsHtml, openApiDocument, responseSchemas, responseShapes };
