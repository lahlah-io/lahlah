import { describe, expect, test } from "vitest";

import { resolveChatRoute } from "../src/feat/chat/utils/chat-route";

describe("resolveChatRoute", () => {
  test("/chat selalu menjadi draft baru, bukan redirect ke sesi lama", () => {
    expect(
      resolveChatRoute({ activeId: "sess-1", listLoading: false, threadExists: false }),
    ).toEqual({ type: "reset" });
  });

  test("/chat tanpa sesi aktif tidak melakukan apa pun", () => {
    expect(
      resolveChatRoute({ activeId: null, listLoading: false, threadExists: false }),
    ).toEqual({ type: "none" });
  });

  test("/chat/:id memilih sesi yang dituju", () => {
    expect(
      resolveChatRoute({
        threadId: "sess-2",
        activeId: "sess-1",
        listLoading: false,
        threadExists: true,
      }),
    ).toEqual({ type: "select", id: "sess-2" });
  });

  test("sesi yang sudah aktif tidak dipilih ulang", () => {
    expect(
      resolveChatRoute({
        threadId: "sess-1",
        activeId: "sess-1",
        listLoading: false,
        threadExists: true,
      }),
    ).toEqual({ type: "none" });
  });

  test("id yang tidak dikenal kembali ke draft", () => {
    expect(
      resolveChatRoute({
        threadId: "hilang",
        activeId: "sess-1",
        listLoading: false,
        threadExists: false,
      }),
    ).toEqual({ type: "fallback" });
  });

  test("selama daftar sesi dimuat, tidak ada aksi", () => {
    expect(
      resolveChatRoute({ activeId: "sess-1", listLoading: true, threadExists: false }),
    ).toEqual({ type: "none" });
  });
});
