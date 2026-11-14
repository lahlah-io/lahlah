import { z } from "zod";
import { intentLabels } from "../../src/modules/chat/services/classifier.js";

/**
 * Runtime response validators for the integration contract tests.
 *
 * These mirror the *actual* JSON the API returns (not `src/openapi/document.ts`,
 * which is the served document). Keep both in sync: the unit test
 * `tests/unit/openapi.test.ts` guards the document shape, this file guards payloads.
 */

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

const subscriptionSummary = z.object({
  id: z.uuid(),
  status: z.string(),
  startedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  plan: z.object({ id: z.uuid(), name: z.string() }),
});

const user = z.object({
  id: z.uuid(),
  // Legacy rows predate the uuid default, so the wire value is not always a uuid.
  pid: z.string(),
  name: z.string(),
  username: z.string(),
  email: z.string().nullable(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  role: z.enum(["user", "admin"]),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  subscriptions: z.array(subscriptionSummary),
});

const category = z.object({ id: z.uuid(), name: z.string(), slug: z.string() });

const destination = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  // Stored decimals are serialised with toFixed(7), so the wire value is a string.
  latitude: z.string().regex(/^-?\d+\.\d{7}$/).nullable(),
  longitude: z.string().regex(/^-?\d+\.\d{7}$/).nullable(),
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

const chatMapPoint = z.object({
  position: z.number().int(),
  destinationId: z.uuid(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
});

const itineraryVersionStopView = z.object({
  id: z.uuid().optional(),
  position: z.number().int(),
  destinationId: z.uuid().nullable(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  arrivalTime: z.string().nullable(),
  departureTime: z.string().nullable().optional(),
  visitDurationMin: z.number().int().nullable(),
  category: z.string().nullable(),
});

const itineraryVersionRouteView = z.object({
  fromStopId: z.uuid(),
  toStopId: z.uuid(),
  transportMode: z.string(),
  geometryJson: lineString.nullable(),
  provider: z.string().nullable(),
  providerProfile: z.string().nullable(),
  fallback: z.boolean(),
});

const itineraryVersionView = z.object({
  // First stop id, or an ISO timestamp when the batch is empty.
  versionId: z.string(),
  versionNumber: z.number().int(),
  itineraryId: z.string(),
  travelDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  stops: z.array(itineraryVersionStopView),
  routes: z.array(itineraryVersionRouteView).optional(),
  routeJson: z.unknown(),
});

const messageUsage = z.object({ inputTokens: z.number().int(), outputTokens: z.number().int() });

const chatReply = z.object({
  message: z.string(),
  intent: z.enum(intentLabels),
  version: itineraryVersionView.nullable(),
  map: z.object({ versionId: z.string(), points: z.array(chatMapPoint) }).nullable(),
  assistantMessageId: z.uuid(),
  sessionId: z.uuid(),
  usage: messageUsage,
});

const chatRegenerateResult = z.object({
  assistantMessageId: z.uuid(),
  sessionId: z.uuid(),
  message: z.string(),
  intent: z.enum(intentLabels),
  version: itineraryVersionView.nullable(),
  activeVersion: z.number().int(),
  usage: messageUsage,
});

const sessionDeleteResult = z.object({ deleted: z.literal(true) });

const itineraryDestination = z.object({
  id: z.uuid(),
  itineraryId: z.uuid(),
  destinationId: z.uuid(),
  visitAt: z.iso.datetime().nullable(),
  estimatedCost: z.number().nullable(),
  distance: z.number().nullable().optional(),
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
  travelDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
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
  isSaved: z.boolean(),
  isSelected: z.boolean(),
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

const asEnvelope = <T extends z.ZodType>(schema: T) => z.object({ data: schema });
const asList = <T extends z.ZodType>(schema: T) =>
  z.object({ data: z.array(schema), meta: paginationMeta });

export const responseShapes = {
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
