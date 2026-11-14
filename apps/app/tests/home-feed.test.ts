import { describe, expect, test, vi } from "vitest";

import { formatRelativeTime } from "../src/shared/utils/time";

describe("formatRelativeTime", () => {
  test("meringkas waktu berjalan dalam bahasa Indonesia", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T12:00:00.000Z"));

    expect(formatRelativeTime("2026-11-15T11:59:30.000Z")).toBe("baru saja");
    expect(formatRelativeTime("2026-11-15T11:30:00.000Z")).toBe("30 mnt");
    expect(formatRelativeTime("2026-11-15T09:00:00.000Z")).toBe("3 jam");
    expect(formatRelativeTime("2026-11-10T12:00:00.000Z")).toBe("5 hari");
    expect(formatRelativeTime("2026-11-16T12:00:00.000Z")).toBe("baru saja");

    vi.useRealTimers();
  });

  test("memakai tanggal untuk kabar lama, dan membiarkan nilai tidak valid", () => {
    expect(formatRelativeTime("2026-10-01T12:00:00.000Z")).toMatch(/2026/);
    expect(formatRelativeTime("bukan tanggal")).toBe("bukan tanggal");
  });
});
