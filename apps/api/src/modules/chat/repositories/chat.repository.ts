import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";

const sessionSelect = {
  id: true,
  userId: true,
  modelId: true,
  title: true,
  status: true,
  summary: true,
  contextJson: true,
  metadata: true,
  promptTokens: true,
  completionTokens: true,
  totalTokens: true,
  lastMessageAt: true,
  schemaVersion: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ChatSessionSelect;

const messageSelect = {
  id: true,
  sessionId: true,
  modelId: true,
  role: true,
  content: true,
  position: true,
  inputTokens: true,
  outputTokens: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.ChatMessageSelect;

const messageKeysetSelect = {
  id: true,
  sessionId: true,
  modelId: true,
  role: true,
  content: true,
  position: true,
  inputTokens: true,
  outputTokens: true,
  metadata: true,
  toolCallsJson: true,
  toolCallId: true,
  mode: true,
  model: true,
  latencyMs: true,
  status: true,
  errorJson: true,
  versionsJson: true,
  activeVersion: true,
  schemaVersion: true,
  createdAt: true,
} satisfies Prisma.ChatMessageSelect;

const messageWithSessionSelect = {
  ...messageKeysetSelect,
  session: { select: { id: true, userId: true, modelId: true } },
} satisfies Prisma.ChatMessageSelect;

type DbClient = typeof prisma | Prisma.TransactionClient;

export async function findOrCreateSystemModel(input: { provider: string; modelIdentifier: string; name: string }) {
  return prisma.model.upsert({
    where: { provider_modelIdentifier: { provider: input.provider, modelIdentifier: input.modelIdentifier } },
    update: { name: input.name, isActive: true },
    create: { provider: input.provider, modelIdentifier: input.modelIdentifier, name: input.name, isActive: true },
    select: { id: true },
  });
}

export async function createSession(input: { userId: string; modelId: string; title: string }) {
  return prisma.chatSession.create({ data: input, select: sessionSelect });
}

export async function listSessions(input: { userId: string; page: number; limit: number }) {
  const where: Prisma.ChatSessionWhereInput = { userId: input.userId, deletedAt: null };
  const [data, total] = await prisma.$transaction([
    prisma.chatSession.findMany({ where, skip: (input.page - 1) * input.limit, take: input.limit, orderBy: { createdAt: "desc" }, select: sessionSelect }),
    prisma.chatSession.count({ where }),
  ]);
  return { data, meta: { page: input.page, limit: input.limit, total } };
}

export const findSessionById = (id: string) =>
  prisma.chatSession.findFirst({ where: { id, deletedAt: null }, select: sessionSelect });

export const findSessionByIdRaw = (id: string) =>
  prisma.chatSession.findUnique({ where: { id }, select: { id: true, userId: true, deletedAt: true } });

export async function updateSession(input: { id: string; title?: string; summary?: string | null; status?: string }) {
  const data: Prisma.ChatSessionUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.summary !== undefined) data.summary = input.summary;
  if (input.status !== undefined) data.status = input.status;
  return prisma.chatSession.update({ where: { id: input.id }, data, select: sessionSelect });
}

/** Soft delete: baris tetap ada, hanya disembunyikan dari daftar & akses. */
export async function deleteSession(id: string) {
  await prisma.chatSession.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listMessages(input: { sessionId: string; page: number; limit: number }) {
  const where: Prisma.ChatMessageWhereInput = { sessionId: input.sessionId };
  const [data, total] = await prisma.$transaction([
    prisma.chatMessage.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: { position: "asc" },
      select: messageSelect,
    }),
    prisma.chatMessage.count({ where }),
  ]);
  return { data, meta: { page: input.page, limit: input.limit, total } };
}

export async function findRecentMessages(sessionId: string, limit: number) {
  const rows = await prisma.chatMessage.findMany({ where: { sessionId }, orderBy: { createdAt: "desc" }, take: limit, select: messageSelect });
  return rows.reverse();
}

type AppendMessageInput = {
  sessionId: string;
  modelId?: string | null;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  metadata?: Prisma.InputJsonValue;
  toolCallsJson?: Prisma.InputJsonValue | null;
  toolCallId?: string | null;
  mode?: string | null;
  model?: string | null;
  latencyMs?: number | null;
  status?: string;
  errorJson?: Prisma.InputJsonValue | null;
  versionsJson?: Prisma.InputJsonValue;
  activeVersion?: number;
  schemaVersion?: number;
};

async function appendMessageTx(tx: DbClient, input: AppendMessageInput) {
  const last = await tx.chatMessage.findFirst({
    where: { sessionId: input.sessionId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? 0) + 1;
  const inputTokens = input.inputTokens ?? 0;
  const outputTokens = input.outputTokens ?? 0;
  const metadata = input.metadata ?? {};
  const status = input.status ?? "completed";
  const activeVersion = input.activeVersion ?? 1;
  const schemaVersion = input.schemaVersion ?? 1;
  const createdAtIso = new Date().toISOString();
  const versionsJson =
    input.versionsJson ??
    ([
      {
        version: activeVersion,
        content: input.content,
        status,
        createdAt: createdAtIso,
        ...(input.model ? { model: input.model } : {}),
        ...(input.latencyMs != null ? { latencyMs: input.latencyMs } : {}),
        ...(input.toolCallsJson != null ? { toolCalls: input.toolCallsJson } : {}),
        ...(input.errorJson != null ? { errorJson: input.errorJson } : {}),
        metadata,
        usage: { promptTokens: inputTokens, completionTokens: outputTokens, totalTokens: inputTokens + outputTokens },
        inputTokens,
        outputTokens,
      },
    ] as Prisma.InputJsonValue);

  const row = await tx.chatMessage.create({
    data: {
      sessionId: input.sessionId,
      modelId: input.modelId ?? null,
      role: input.role,
      content: input.content,
      position,
      inputTokens,
      outputTokens,
      metadata,
      toolCallsJson: input.toolCallsJson ?? undefined,
      toolCallId: input.toolCallId ?? undefined,
      mode: input.mode ?? undefined,
      model: input.model ?? undefined,
      latencyMs: input.latencyMs ?? undefined,
      status,
      errorJson: input.errorJson ?? undefined,
      versionsJson,
      activeVersion,
      schemaVersion,
    },
    select: messageKeysetSelect,
  });

  await tx.chatSession.update({
    where: { id: input.sessionId },
    data: {
      lastMessageAt: row.createdAt,
      promptTokens: { increment: inputTokens },
      completionTokens: { increment: outputTokens },
      totalTokens: { increment: inputTokens + outputTokens },
    },
  });

  return row;
}

export async function appendMessage(input: AppendMessageInput) {
  return prisma.$transaction((tx) => appendMessageTx(tx, input));
}

export async function insertMessage(input: AppendMessageInput) {
  const row = await appendMessage(input);
  const {
    position: _position,
    toolCallsJson: _tc,
    toolCallId: _tci,
    mode: _mode,
    model: _model,
    latencyMs: _lm,
    status: _status,
    errorJson: _ej,
    versionsJson: _vj,
    activeVersion: _av,
    schemaVersion: _sv,
    ...compat
  } = row as any;
  return compat as {
    id: string;
    sessionId: string;
    modelId: string | null;
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    inputTokens: number;
    outputTokens: number;
    metadata: unknown;
    createdAt: Date;
  };
}

export async function listMessagesKeyset(input: { sessionId: string; afterPosition?: number; limit: number }) {
  const limit = input.limit;
  const where: Prisma.ChatMessageWhereInput = {
    sessionId: input.sessionId,
    ...(input.afterPosition != null ? { position: { gt: input.afterPosition } } : {}),
  };
  const rows = await prisma.chatMessage.findMany({
    where,
    orderBy: { position: "asc" },
    take: limit + 1,
    select: messageKeysetSelect,
  });
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextAfterPosition = hasMore ? (data[data.length - 1]?.position ?? null) : null;
  return { data, meta: { limit, nextAfterPosition } };
}

export async function findMessageById(id: string) {
  return prisma.chatMessage.findUnique({ where: { id }, select: messageWithSessionSelect });
}

export async function listMessagesUpToPosition(sessionId: string, maxPositionExclusive: number) {
  return prisma.chatMessage.findMany({
    where: { sessionId, position: { lt: maxPositionExclusive } },
    orderBy: { position: "asc" },
    select: messageSelect,
  });
}

export async function updateMessageVersionState(input: {
  messageId: string;
  sessionId: string;
  content: string;
  status: string;
  model?: string | null;
  latencyMs?: number | null;
  errorJson?: Prisma.InputJsonValue | null;
  toolCallsJson?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue;
  versionsJson: Prisma.InputJsonValue;
  activeVersion: number;
  inputTokens: number;
  outputTokens: number;
  deltaInputTokens: number;
  deltaOutputTokens: number;
}) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.chatMessage.update({
      where: { id: input.messageId },
      data: {
        content: input.content,
        status: input.status,
        model: input.model ?? null,
        latencyMs: input.latencyMs ?? null,
        errorJson: input.errorJson ?? undefined,
        toolCallsJson: input.toolCallsJson ?? undefined,
        metadata: input.metadata ?? {},
        versionsJson: input.versionsJson,
        activeVersion: input.activeVersion,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
      },
      select: messageKeysetSelect,
    });
    if (input.deltaInputTokens !== 0 || input.deltaOutputTokens !== 0) {
      await tx.chatSession.update({
        where: { id: input.sessionId },
        data: {
          lastMessageAt: new Date(),
          promptTokens: { increment: input.deltaInputTokens },
          completionTokens: { increment: input.deltaOutputTokens },
          totalTokens: { increment: input.deltaInputTokens + input.deltaOutputTokens },
        },
      });
    }
    return row;
  });
}
