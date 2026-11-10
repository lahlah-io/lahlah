import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../db/client.js";

const sessionSelect = {
  id: true,
  userId: true,
  modelId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ChatSessionSelect;

const messageSelect = {
  id: true,
  sessionId: true,
  modelId: true,
  role: true,
  content: true,
  inputTokens: true,
  outputTokens: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.ChatMessageSelect;

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
  const where: Prisma.ChatSessionWhereInput = { userId: input.userId };
  const [data, total] = await prisma.$transaction([
    prisma.chatSession.findMany({ where, skip: (input.page - 1) * input.limit, take: input.limit, orderBy: { createdAt: "desc" }, select: sessionSelect }),
    prisma.chatSession.count({ where }),
  ]);
  return { data, meta: { page: input.page, limit: input.limit, total } };
}

export const findSessionById = (id: string) => prisma.chatSession.findUnique({ where: { id }, select: sessionSelect });

export async function listMessages(input: { sessionId: string; page: number; limit: number }) {
  const where: Prisma.ChatMessageWhereInput = { sessionId: input.sessionId };
  const [data, total] = await prisma.$transaction([
    prisma.chatMessage.findMany({ where, skip: (input.page - 1) * input.limit, take: input.limit, orderBy: { createdAt: "asc" }, select: messageSelect }),
    prisma.chatMessage.count({ where }),
  ]);
  return { data, meta: { page: input.page, limit: input.limit, total } };
}

export async function findRecentMessages(sessionId: string, limit: number) {
  const rows = await prisma.chatMessage.findMany({ where: { sessionId }, orderBy: { createdAt: "desc" }, take: limit, select: messageSelect });
  return rows.reverse();
}

export async function insertMessage(input: {
  sessionId: string;
  modelId?: string | null;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.$transaction(async (tx) => {
    const last = await tx.chatMessage.findFirst({
      where: { sessionId: input.sessionId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = (last?.position ?? 0) + 1;
    const inputTokens = input.inputTokens ?? 0;
    const outputTokens = input.outputTokens ?? 0;
    const metadata = input.metadata ?? {};
    return tx.chatMessage.create({
      data: {
        sessionId: input.sessionId,
        modelId: input.modelId ?? null,
        role: input.role,
        content: input.content,
        position,
        inputTokens,
        outputTokens,
        metadata,
        versionsJson: [
          {
            version: 1,
            content: input.content,
            inputTokens,
            outputTokens,
            metadata,
          },
        ],
        activeVersion: 1,
        status: "completed",
        schemaVersion: 1,
      },
      select: messageSelect,
    });
  });
}
