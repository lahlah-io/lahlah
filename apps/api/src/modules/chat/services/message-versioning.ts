import type { Prisma } from "../../../generated/prisma/client.js";

export type MessageVersion = {
  version: number;
  content: string;
  status: string;
  createdAt: string;
  model?: string;
  latencyMs?: number;
  toolCalls?: unknown[];
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  editInstruction?: string;
  errorJson?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  metadata?: unknown;
  [key: string]: unknown;
};

type VersionedState = {
  versionsJson: unknown;
  activeVersion: number;
  content?: string;
  status?: string;
  model?: string | null;
  latencyMs?: number | null;
  errorJson?: unknown;
  toolCallsJson?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  metadata?: unknown;
  [key: string]: unknown;
};

type AppendedState = {
  versionsJson: MessageVersion[];
  activeVersion: number;
  content: string;
  status: string;
  model?: string | null;
  latencyMs?: number | null;
  errorJson?: unknown;
  toolCallsJson?: unknown;
  inputTokens: number;
  outputTokens: number;
  metadata?: unknown;
};

function asVersions(raw: unknown): MessageVersion[] {
  return Array.isArray(raw) ? (raw as MessageVersion[]) : [];
}

function usageTokens(v: MessageVersion): { input: number; output: number } {
  const input = v.usage?.promptTokens ?? v.inputTokens ?? 0;
  const output = v.usage?.completionTokens ?? v.outputTokens ?? 0;
  return {
    input: Number.isFinite(input) ? Number(input) : 0,
    output: Number.isFinite(output) ? Number(output) : 0,
  };
}

function mirror(v: MessageVersion): Pick<AppendedState, "content" | "status" | "model" | "latencyMs" | "errorJson" | "toolCallsJson" | "metadata"> {
  return {
    content: v.content,
    status: v.status,
    model: v.model ?? null,
    latencyMs: v.latencyMs ?? null,
    errorJson: v.errorJson ?? null,
    toolCallsJson: v.toolCalls ?? null,
    metadata: v.metadata,
  };
}

export function appendVersion(current: VersionedState, next: MessageVersion): AppendedState {
  const versions = asVersions(current.versionsJson);
  const version = versions.length + 1;
  const normalized: MessageVersion = { ...next, version };
  const versionsJson = [...versions, normalized];
  const added = usageTokens(normalized);
  const prevInput = Number.isFinite(current.inputTokens) ? Number(current.inputTokens) : 0;
  const prevOutput = Number.isFinite(current.outputTokens) ? Number(current.outputTokens) : 0;
  return {
    versionsJson,
    activeVersion: version,
    ...mirror(normalized),
    inputTokens: prevInput + added.input,
    outputTokens: prevOutput + added.output,
  };
}

export function activateVersion(current: VersionedState, version: number): AppendedState {
  const versions = asVersions(current.versionsJson);
  const target = versions.find((v) => v.version === version) ?? versions[versions.length - 1];
  const activeVersion = target?.version ?? Math.max(1, Number(current.activeVersion) || 1);
  const prevInput = Number.isFinite(current.inputTokens) ? Number(current.inputTokens) : 0;
  const prevOutput = Number.isFinite(current.outputTokens) ? Number(current.outputTokens) : 0;
  return {
    versionsJson: versions,
    activeVersion,
    ...(target ? mirror(target) : {
      content: String(current.content ?? ""),
      status: String(current.status ?? "completed"),
      model: (current.model as string | null | undefined) ?? null,
      latencyMs: (current.latencyMs as number | null | undefined) ?? null,
      errorJson: current.errorJson ?? null,
      toolCallsJson: current.toolCallsJson ?? null,
      metadata: current.metadata,
    }),
    // cumulative totals preserved on switch
    inputTokens: prevInput,
    outputTokens: prevOutput,
  };
}

export function seedVersion(input: {
  content: string;
  status?: string;
  createdAt?: string;
  model?: string | null;
  latencyMs?: number | null;
  toolCalls?: unknown[] | null;
  errorJson?: unknown;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  metadata?: unknown;
}): { version: MessageVersion; state: AppendedState } {
  const promptTokens = input.usage?.promptTokens ?? input.inputTokens ?? 0;
  const completionTokens = input.usage?.completionTokens ?? input.outputTokens ?? 0;
  const totalTokens = input.usage?.totalTokens ?? (promptTokens + completionTokens);
  const version: MessageVersion = {
    version: 1,
    content: input.content,
    status: input.status ?? "completed",
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.model ? { model: input.model } : {}),
    ...(input.latencyMs != null ? { latencyMs: input.latencyMs } : {}),
    ...(input.toolCalls != null ? { toolCalls: input.toolCalls } : {}),
    ...(input.errorJson != null ? { errorJson: input.errorJson } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    usage: { promptTokens, completionTokens, totalTokens },
    inputTokens: promptTokens,
    outputTokens: completionTokens,
  };
  const state = appendVersion({ versionsJson: [], activeVersion: 0, content: "", status: "pending", inputTokens: 0, outputTokens: 0 }, version);
  return { version: state.versionsJson[0]!, state };
}

export type VersionsJson = Prisma.InputJsonValue;
