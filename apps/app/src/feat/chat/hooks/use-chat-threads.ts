import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { ApiError } from "@/shared/api/client";
import type { Trip } from "@/shared/types/itinerary";

import * as chatApi from "../services/chat.api";
import * as itineraryApi from "../services/itinerary.api";
import type {
  ChatMessage,
  ChatMessageDto,
  ChatSessionDto,
  ChatThread,
} from "../types/chat";
import type {
  ItineraryDetailDto,
  ItineraryVersionSummaryDto,
} from "@/shared/types/itinerary-api";
import { toTrip } from "@/shared/utils/itinerary-trip";

/** Error dibedakan supaya kegagalan kirim bisa tampil sebagai status trip. */
export interface ChatError {
  kind: "load" | "send";
  message: string;
}

/** Pemakaian token percakapan aktif, dijumlah dari kolom pesan di DB. */
export interface ChatTokenUsage {
  input: number;
  output: number;
  total: number;
}

/** Itinerary aktif untuk panel Trip: ringkasan + `Trip` siap render. */
export interface ActiveItinerary {
  currentVersion: number;
  endTime: string;
  id: string;
  sessionId: string;
  startTime: string;
  stopCount: number;
  title: string;
  travelDate: string;
  trip: Trip;
}

function toMessage(dto: ChatMessageDto): ChatMessage | null {
  if (dto.role !== "user" && dto.role !== "assistant") return null;
  return {
    id: dto.id,
    inputTokens: dto.inputTokens ?? 0,
    outputTokens: dto.outputTokens ?? 0,
    role: dto.role,
    ...(dto.role === "assistant" ? { task: toTask(dto) } : {}),
    text: dto.content,
  };
}

/**
 * Status trip dibaca dari metadata pesan yang disimpan `appendMessage`:
 * ada `versionId` berarti trip tersimpan, intent `missing_information` berarti
 * asisten menunggu detail dari user.
 */
function toTask(dto: ChatMessageDto): ChatMessage["task"] {
  if (dto.metadata?.versionId) return { state: "created" };
  if (dto.metadata?.intent === "missing_information") {
    return { state: "skipped", detail: "Butuh detail tambahan dari kamu" };
  }
  return { state: "skipped" };
}

/** Status trip dari balasan API yang baru diterima. */
function taskFromResult(result: {
  intent: string;
  version: { versionNumber: number } | null;
}): ChatMessage["task"] {
  if (result.version) {
    return { state: "created", detail: `Tersimpan sebagai versi ${result.version.versionNumber}` };
  }
  return {
    state: "skipped",
    detail:
      result.intent === "missing_information"
        ? "Butuh detail tambahan dari kamu"
        : "Belum perlu trip baru",
  };
}

function toThread(dto: ChatSessionDto): ChatThread {
  const stamp = Date.parse(dto.lastMessageAt ?? dto.updatedAt);
  return {
    id: dto.id,
    messages: [],
    title: dto.title,
    updatedAt: Number.isNaN(stamp) ? Date.now() : stamp,
  };
}

function toActiveItinerary(
  detail: ItineraryDetailDto | null,
): ActiveItinerary | null {
  if (!detail?.version) return null;
  const trip = toTrip(detail);
  if (!trip) return null;
  return {
    currentVersion: detail.currentVersion,
    endTime: detail.version.endTime,
    id: detail.id,
    sessionId: detail.sessionId ?? "",
    startTime: detail.version.startTime,
    stopCount: detail.version.stops.length,
    title: detail.title,
    travelDate: detail.version.travelDate,
    trip,
  };
}

/**
 * Sumber tunggal percakapan: daftar sesi, pesan aktif, dan itinerary dari API.
 *
 * `userId` berasal dari sesi login (`/auth/me`). Tidak ada lagi salinan di
 * `localStorage`, jadi riwayat selalu sama di setiap perangkat.
 */
export function useChatThreads(userId: string | null) {
  /** `null` = daftar sesi belum pernah termuat; dipakai sebagai status loading. */
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [itinerary, setItinerary] = useState<ActiveItinerary | null>(null);
  const [versions, setVersions] = useState<ItineraryVersionSummaryDto[]>([]);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [error, setError] = useState<ChatError | null>(null);
  /** Menandai permintaan terbaru supaya respons lambat tidak menimpa sesi baru. */
  const requestRef = useRef(0);
  const navigate = useNavigate();

  const fail = useCallback((cause: unknown, kind: ChatError["kind"] = "load") => {
    setError({
      kind,
      message:
        cause instanceof ApiError
          ? `${cause.code}: ${cause.message}`
          : cause instanceof Error
            ? cause.message
            : "Terjadi kesalahan.",
    });
  }, []);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    chatApi
      .listSessions(userId)
      .then((page) => {
        if (cancelled) return;
        const next = page.data.map(toThread);
        setThreads(next);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        // Daftar kosong supaya UI keluar dari status loading meski gagal.
        setThreads((current) => current ?? []);
        fail(cause);
      });

    return () => {
      cancelled = true;
    };
  }, [fail, userId]);

  const loadSession = useCallback(
    async (sessionId: string, options?: { silent?: boolean }) => {
      if (!userId) return;
      const token = requestRef.current + 1;
      requestRef.current = token;
      if (options?.silent) {
        // Permintaan ini mengambil alih; spinner milik permintaan lama berhenti.
        setSessionLoading(false);
      } else {
        setSessionLoading(true);
        setItinerary(null);
        setVersions([]);
      }

      try {
        const [messages, detail] = await Promise.all([
          chatApi.listMessages(userId, sessionId),
          itineraryApi.getItineraryBySession(userId, sessionId),
        ]);
        if (token !== requestRef.current) return;

        const parsed = messages.data
          .map(toMessage)
          .filter((message): message is ChatMessage => message !== null);
        setThreads((current) =>
          (current ?? []).map((thread) =>
            thread.id === sessionId ? { ...thread, messages: parsed } : thread,
          ),
        );
        setItinerary(toActiveItinerary(detail));

        const summaries = detail
          ? (await itineraryApi.listItineraryVersions(userId, detail.id)).data
          : [];
        if (token !== requestRef.current) return;
        setVersions(summaries);
      } catch (cause) {
        if (token === requestRef.current) fail(cause);
      } finally {
        if (token === requestRef.current) setSessionLoading(false);
      }
    },
    [fail, userId],
  );

  useEffect(() => {
    if (!activeId) return;
    // Memuat sesi terpilih adalah sinkronisasi dengan server, bukan derived
    // state; `loadSession` menyalakan spinner sebelum `await` pertama.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- memuat sesi dari API saat seleksi berubah
    void loadSession(activeId);
  }, [activeId, loadSession]);

  const listLoading = threads === null;
  const isDraft = activeId === null;
  const activeThread = activeId
    ? threads?.find((thread) => thread.id === activeId)
    : undefined;

  // Dijumlah dari DB supaya angkanya persis yang dicatat provider, bukan
  // estimasi kata di client. Pesan user tidak membawa token.
  const usage: ChatTokenUsage = useMemo(() => {
    let input = 0;
    let output = 0;
    for (const message of activeThread?.messages ?? []) {
      input += message.inputTokens ?? 0;
      output += message.outputTokens ?? 0;
    }
    return { input, output, total: input + output };
  }, [activeThread?.messages]);

  const startDraft = useCallback(() => {
    setError(null);
    setItinerary(null);
    setVersions([]);
    setActiveId(null);
  }, []);

  const selectThread = useCallback((id: string) => {
    setError(null);
    setActiveId(id);
  }, []);

  /**
   * Kirim satu pesan. `firstTrip` = versi trip pertama kali tersimpan di sesi
   * ini, supaya pemanggil bisa membuka halaman trip tanpa merebut fokus saat
   * user sedang mengubah trip yang sudah ada.
   */
  const send = useCallback(
    async (
      text: string,
    ): Promise<{ firstTrip: boolean; sessionId: string } | null> => {
      const clean = text.trim();
      if (!clean || !userId || sending) return null;

      setSending(true);
      setError(null);

      try {
        let sessionId = activeId;
        if (!sessionId) {
          const created = (await chatApi.createSession(userId, clean.slice(0, 60)))
            .data;
          sessionId = created.id;
          setThreads((current) => [toThread(created), ...(current ?? [])]);
          setActiveId(created.id);
          // Pindahkan URL ke sesi baru supaya rute `/chat` (draft) tidak
          // menganggapnya sebagai percakapan lama dan mengosongkannya lagi.
          navigate(`/chat/${created.id}`, { replace: true });
        }

        const optimistic: ChatMessage = {
          id: `lokal-${Date.now()}`,
          role: "user",
          text: clean,
        };
        setThreads((current) =>
          (current ?? []).map((thread) =>
            thread.id === sessionId
              ? {
                  ...thread,
                  messages: [...thread.messages, optimistic],
                  updatedAt: Date.now(),
                }
              : thread,
          ),
        );

        const result = (await chatApi.sendMessage(userId, sessionId, clean)).data;
        setThreads((current) =>
          (current ?? []).map((thread) =>
            thread.id === sessionId
              ? {
                  ...thread,
                  messages: [
                    ...thread.messages,
                    {
                      id: result.assistantMessageId,
                      inputTokens: result.usage?.inputTokens ?? 0,
                      outputTokens: result.usage?.outputTokens ?? 0,
                      role: "assistant",
                      task: taskFromResult(result),
                      text: result.message,
                    },
                  ],
                  updatedAt: Date.now(),
                }
              : thread,
          ),
        );

        await loadSession(sessionId, { silent: true });
        // `itinerary` di closure adalah state sebelum kirim, jadi ini menandai
        // trip pertama untuk sesi ini (dipakai untuk membuka halaman Trip).
        return { firstTrip: result.version !== null && itinerary === null, sessionId };
      } catch (cause) {
        fail(cause, "send");
        return null;
      } finally {
        setSending(false);
      }
    },
    [activeId, fail, itinerary, loadSession, navigate, sending, userId],
  );

  const renameThread = useCallback(
    async (id: string, title: string) => {
      const clean = title.trim();
      if (!clean || !userId) return;

      setThreads((current) =>
        (current ?? []).map((thread) =>
          thread.id === id ? { ...thread, title: clean } : thread,
        ),
      );
      try {
        await chatApi.renameSession(userId, id, clean);
      } catch (cause) {
        fail(cause);
      }
    },
    [fail, userId],
  );

  const deleteThread = useCallback(
    async (id: string) => {
      if (!userId) return;
      try {
        await chatApi.deleteSession(userId, id);
        const remaining = (threads ?? []).filter((thread) => thread.id !== id);
        setThreads(remaining);
        if (activeId === id) setActiveId(remaining[0]?.id ?? null);
      } catch (cause) {
        fail(cause);
      }
    },
    [activeId, fail, threads, userId],
  );

  const restoreVersion = useCallback(
    async (version: number) => {
      if (!userId || !itinerary) return;
      setRestoring(version);
      setError(null);
      try {
        const detail = (
          await itineraryApi.restoreItineraryVersion(
            userId,
            itinerary.id,
            version,
            itinerary.currentVersion,
          )
        ).data;
        setItinerary(toActiveItinerary(detail));
        setVersions(
          (await itineraryApi.listItineraryVersions(userId, detail.id)).data,
        );
      } catch (cause) {
        fail(cause);
      } finally {
        setRestoring(null);
      }
    },
    [fail, itinerary, userId],
  );

  return {
    activeId,
    activeThread,
    deleteThread,
    error,
    isDraft,
    itinerary,
    itineraryLoading: sessionLoading || listLoading,
    listLoading,
    renameThread,
    restoring,
    restoreVersion,
    selectThread,
    send,
    sending,
    sessionLoading,
    startDraft,
    threads: threads ?? [],
    usage,
    versions,
  };
}
