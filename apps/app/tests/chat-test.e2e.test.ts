import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { startStaticServer } from "./helpers/static-server.js";

const APP_URL_KEY = "lahlah.baseUrl";
const USER_KEY = "lahlah.userId";
const USER_ID = "11111111-1111-4111-8111-111111111111";

type BaseStop = {
  order: number;
  name: string;
  latitude: number;
  longitude: number;
  visitAt: string;
  durationMinutes: number;
};

type VersionStop = {
  id: string;
  position: number;
  name: string;
  latitude: number;
  longitude: number;
  arrivalTime: string;
  departureTime: string | null;
  visitDurationMin: number;
};

type RouteLeg = {
  fromPosition: number;
  toPosition: number;
  transportMode: string;
  distanceM: number | null;
  durationSec: number | null;
  geometry: { type: "LineString"; coordinates: Array<[number, number]> };
  provider: string;
  profile: string;
  fallback: boolean;
};

type VersionSnapshot = {
  id: string;
  itineraryId: string;
  version: number;
  basedOnVersion: number | null;
  changeInstruction: string | null;
  changeType: string;
  totalDistanceM: number | null;
  totalDurationMin: number | null;
  stops: VersionStop[];
  routeJson: { type: "LineString"; coordinates: Array<[number, number]>; legs: RouteLeg[] };
};

type VersionSummary = {
  version: number;
  basedOnVersion: number | null;
  changeType: string;
  changeInstruction: string | null;
  stopCount: number;
  routeCount: number;
  createdAt: string;
};

type ItineraryDetail = {
  id: string;
  sessionId: string;
  tripDate: string;
  currentVersion: number;
  metadata: { profile: string };
  version: VersionSnapshot;
};

type ItineraryEntry = {
  detail: ItineraryDetail;
  versions: VersionSummary[];
  snapshots: Map<number, VersionSnapshot>;
};

type Message = { id: string; sessionId: string; role: "user" | "assistant"; content: string };

type ApiState = {
  sessions: Array<{ id: string; title: string; userId: string }>;
  messages: Map<string, Message[]>;
  itineraries: Map<string, ItineraryEntry>;
  restoreCalls: number;
  messagePosts: number;
  osrmFails: boolean;
};

const stops: BaseStop[] = [
  { order: 1, name: "Pantai Padang", latitude: -0.95, longitude: 100.35, visitAt: "12:00", durationMinutes: 60 },
  { order: 2, name: "Museum Adityawarman", latitude: -0.94, longitude: 100.36, visitAt: "13:00", durationMinutes: 60 },
  { order: 3, name: "Pasar Raya", latitude: -0.93, longitude: 100.37, visitAt: "14:00", durationMinutes: 60 },
];

function snapshotFor(itineraryId: string, version: number, count: number, fallback: boolean): VersionSnapshot {
  const chosen = stops.slice(0, count);
  const versionStops: VersionStop[] = chosen.map((s) => ({
    id: `stop-v${version}-${s.order}`,
    position: s.order,
    name: s.name,
    latitude: s.latitude,
    longitude: s.longitude,
    arrivalTime: s.visitAt,
    departureTime: null,
    visitDurationMin: s.durationMinutes,
  }));
  const legs: RouteLeg[] = [];
  for (let i = 0; i + 1 < versionStops.length; i++) {
    const from = versionStops[i]!;
    const to = versionStops[i + 1]!;
    legs.push({
      fromPosition: from.position,
      toPosition: to.position,
      transportMode: "walk",
      distanceM: 1200,
      durationSec: null,
      geometry: { type: "LineString", coordinates: [[from.longitude, from.latitude], [to.longitude, to.latitude]] },
      provider: "straight_line",
      profile: "straight_line",
      fallback: true,
    });
  }
  return {
    id: `ver-${itineraryId}-v${version}`,
    itineraryId,
    version,
    basedOnVersion: version > 1 ? version - 1 : null,
    changeInstruction: null,
    changeType: version > 1 ? "regenerate" : "generate",
    totalDistanceM: 2400,
    totalDurationMin: null,
    stops: versionStops,
    routeJson: {
      type: "LineString",
      coordinates: versionStops.map((stop) => [stop.longitude, stop.latitude]),
      legs,
    },
  };
}

function summaryFor(snapshot: VersionSnapshot): VersionSummary {
  return {
    version: snapshot.version,
    basedOnVersion: snapshot.basedOnVersion,
    changeType: snapshot.changeType,
    changeInstruction: snapshot.changeInstruction,
    stopCount: snapshot.stops.length,
    routeCount: snapshot.routeJson.legs.length,
    createdAt: new Date().toISOString(),
  };
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

let browser: Browser;
let server: { url: string; close: () => Promise<void> };
let maplibreDir: string;
const contexts: BrowserContext[] = [];

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    headers: { "content-type": "application/json", ...corsHeaders() },
    body: JSON.stringify(body),
  });
}

function findEntryByItineraryId(state: ApiState, itineraryId: string): ItineraryEntry | undefined {
  for (const entry of state.itineraries.values()) {
    if (entry.detail.id === itineraryId) return entry;
  }
  return undefined;
}

async function handleApi(route: Route, state: ApiState) {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  if (method === "OPTIONS") {
    return route.fulfill({ status: 204, headers: corsHeaders() });
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (method === "GET" && url.pathname === "/api/v1/chat/sessions") {
    return json(route, 200, { data: state.sessions });
  }
  if (method === "POST" && url.pathname === "/api/v1/chat/sessions") {
    const body = request.postDataJSON() as { title?: string };
    const session = { id: `sess-${state.sessions.length + 1}`, title: body.title ?? "Chat", userId: USER_ID };
    state.sessions.unshift(session);
    state.messages.set(session.id, []);
    return json(route, 201, { data: session });
  }
  const messagesIndex = parts.indexOf("messages");
  if (parts[2] === "chat" && messagesIndex > 0) {
    const sessionId = parts[messagesIndex - 1]!;
    if (method === "GET") {
      return json(route, 200, { data: state.messages.get(sessionId) ?? [], meta: { nextAfterPosition: null } });
    }
    if (method === "POST") {
      state.messagePosts++;
      const body = request.postDataJSON() as { content: string };
      if (/error/i.test(body.content)) {
        return json(route, 500, { error: { code: "AI_UPSTREAM_ERROR", message: "boom" } });
      }
      const count = /satu/i.test(body.content) ? 1 : 3;
      const existing = state.itineraries.get(sessionId);
      const itineraryId = existing?.detail.id ?? `itin-${sessionId}`;
      const nextVersion = existing ? existing.detail.currentVersion + 1 : 1;
      const snapshot = snapshotFor(itineraryId, nextVersion, count, state.osrmFails);
      const detail: ItineraryDetail = {
        id: itineraryId,
        sessionId,
        tripDate: "2026-11-10",
        currentVersion: nextVersion,
        metadata: { profile: "car" },
        version: snapshot,
      };
      const versions = existing ? [...existing.versions, summaryFor(snapshot)] : [summaryFor(snapshot)];
      const snapshots = new Map(existing?.snapshots ?? []);
      snapshots.set(nextVersion, snapshot);
      state.itineraries.set(sessionId, { detail, versions, snapshots });
      const list = state.messages.get(sessionId) ?? [];
      list.push({ id: `m-user-${state.messagePosts}`, sessionId, role: "user", content: body.content });
      list.push({
        id: `m-assistant-${state.messagePosts}`,
        sessionId,
        role: "assistant",
        content: `Versi ${nextVersion} untuk ${count} destinasi di Padang sudah saya susun.`,
      });
      state.messages.set(sessionId, list);
      return json(route, 200, {
        data: {
          message: `Versi ${nextVersion} untuk ${count} destinasi di Padang sudah saya susun.`,
          intent: "generate_itinerary",
          version: {
            versionId: snapshot.id,
            versionNumber: nextVersion,
            itineraryId,
            travelDate: "2026-11-10",
            startTime: "12:00",
            endTime: "",
            stops: snapshot.stops,
          },
          assistantMessageId: `m-assistant-${state.messagePosts}`,
          sessionId,
          usage: { inputTokens: 100, outputTokens: 20 },
        },
      });
    }
  }
  if (parts[2] === "itineraries" && parts[3] === "by-session" && method === "GET") {
    const entry = state.itineraries.get(parts[4]!);
    if (!entry) return json(route, 404, { error: { code: "ITINERARY_NOT_FOUND", message: "Itinerary not found" } });
    return json(route, 200, { data: entry.detail });
  }
  if (parts[2] === "itineraries" && parts[4] === "versions" && parts.length === 5 && method === "GET") {
    const entry = findEntryByItineraryId(state, parts[3]!);
    if (!entry) return json(route, 404, { error: { code: "ITINERARY_NOT_FOUND", message: "Itinerary not found" } });
    return json(route, 200, { data: entry.versions });
  }
  if (parts[2] === "itineraries" && parts[4] === "versions" && parts.length === 6 && method === "GET") {
    const entry = findEntryByItineraryId(state, parts[3]!);
    const snapshot = entry?.snapshots.get(Number(parts[5]));
    if (!entry || !snapshot) {
      return json(route, 404, { error: { code: "VERSION_NOT_FOUND", message: "Itinerary version not found" } });
    }
    return json(route, 200, { data: snapshot });
  }
  if (parts[2] === "itineraries" && parts[4] === "restore" && method === "POST") {
    const entry = findEntryByItineraryId(state, parts[3]!);
    const target = entry?.snapshots.get(Number(parts[5]));
    if (!entry || !target) {
      return json(route, 404, { error: { code: "VERSION_NOT_FOUND", message: "Itinerary version not found" } });
    }
    const body = request.postDataJSON() as { expectedVersion?: number };
    if (body.expectedVersion !== entry.detail.currentVersion) {
      return json(route, 409, { error: { code: "VERSION_CONFLICT", message: "Version changed" } });
    }
    state.restoreCalls++;
    const nextVersion = entry.detail.currentVersion + 1;
    const snapshot: VersionSnapshot = {
      ...target,
      id: `ver-${entry.detail.id}-v${nextVersion}`,
      version: nextVersion,
      basedOnVersion: target.version,
      changeType: "restore",
    };
    entry.detail = { ...entry.detail, currentVersion: nextVersion, version: snapshot };
    entry.versions.push(summaryFor(snapshot));
    entry.snapshots.set(nextVersion, snapshot);
    return json(route, 200, { data: entry.detail });
  }
  return json(route, 404, { error: { code: "NOT_FOUND", message: "not found" } });
}

async function handleMaplibre(route: Route, fileName: string) {
  try {
    const body = await readFile(path.join(maplibreDir, fileName));
    const contentType = fileName.endsWith(".css") ? "text/css" : "text/javascript";
    return route.fulfill({
      status: 200,
      headers: { "content-type": contentType, "access-control-allow-origin": "*" },
      body,
    });
  } catch {
    return route.fulfill({ status: 404, body: "missing" });
  }
}

async function open(options: { viewport?: { width: number; height: number } } = {}) {
  const state: ApiState = {
    sessions: [],
    messages: new Map(),
    itineraries: new Map(),
    restoreCalls: 0,
    messagePosts: 0,
    osrmFails: false,
  };
  const context = await browser.newContext({ viewport: options.viewport ?? { width: 1280, height: 900 } });
  contexts.push(context);
  await context.addInitScript(
    (values: { baseUrl: string; userKey: string; userId: string }) => {
      if (!localStorage.getItem(values.baseUrl)) localStorage.setItem(values.baseUrl, "http://api.test");
      if (!localStorage.getItem(values.userKey)) localStorage.setItem(values.userKey, values.userId);
    },
    { baseUrl: APP_URL_KEY, userKey: USER_KEY, userId: USER_ID },
  );
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "api.test") return handleApi(route, state);
    if (url.hostname === "unpkg.com") return handleMaplibre(route, path.basename(url.pathname));
    if (url.hostname.endsWith("basemaps.cartocdn.com")) {
      return route.fulfill({ status: 200, headers: { "content-type": "image/png" }, body: PNG });
    }
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto(`${server.url}/chat-test.html`);
  await page.waitForSelector("#newChatBtn");
  return { page, state };
}

async function newChat(page: Page) {
  const before = await page.locator("#tabs .tab").count();
  await page.locator("#newChatBtn").dispatchEvent("click");
  await page.waitForFunction((count) => document.querySelectorAll("#tabs .tab").length === count + 1, before);
}

async function send(page: Page, text: string) {
  await page.fill("#message", text);
  await page.click("#sendBtn");
}

async function waitForDraft(page: Page, count = 3) {
  await page.waitForFunction((n) => document.querySelectorAll("#stops li").length === n, count);
}

async function waitForMarkers(page: Page, count = 3) {
  await page.waitForFunction((n) => document.querySelectorAll(".stop-marker").length === n, count);
}

async function textOf(page: Page, selector: string) {
  return (await page.locator(selector).textContent()) ?? "";
}

beforeAll(async () => {
  server = await startStaticServer(fileURLToPath(new URL("../public", import.meta.url)));
  maplibreDir = fileURLToPath(new URL("../node_modules/maplibre-gl/dist", import.meta.url));
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--enable-unsafe-swiftshader"],
  });
});

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

describe("chat test HTML client matrix", () => {
  test("HTML-001: two new chats create two independent tabs", async () => {
    const { page } = await open();
    await newChat(page);
    await newChat(page);
    expect(await page.locator("#tabs .tab").count()).toBe(2);
    expect(await page.locator("#tabs .tab[aria-selected='true']").count()).toBe(1);
    await page.locator("#tabs .tab").nth(1).click();
    await page.waitForFunction(() => !(document.querySelector("#message") as HTMLTextAreaElement).disabled);
  });

  test("HTML-002: switching tabs shows the matching history", async () => {
    const { page } = await open();
    await newChat(page);
    await send(page, "pantai untuk besok");
    await page.waitForSelector(".msg.assistant");
    await newChat(page);
    await send(page, "kuliner untuk besok");
    await page.waitForSelector(".msg.assistant");

    await page.locator("#tabs .tab").nth(1).dispatchEvent("click");
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("#messages .msg")).some((el) => el.textContent === "pantai untuk besok"),
    );
    expect(await page.locator("#messages .msg").count()).toBe(2);
    expect(await textOf(page, "#messages .msg-row:first-child .msg")).toBe("pantai untuk besok");
  });

  test("HTML-003: reload restores active session, history, draft, and route", async () => {
    const { page } = await open();
    await newChat(page);
    await send(page, "pantai dan kuliner");
    await waitForDraft(page);
    await waitForMarkers(page);

    await page.reload();
    await page.waitForSelector("#newChatBtn");
    await page.waitForFunction(() => document.querySelectorAll("#tabs .tab").length === 1);
    await page.waitForSelector(".msg.assistant");
    await waitForDraft(page);
    expect(await page.locator("#messages .msg").count()).toBe(2);
    expect(await textOf(page, "#draftMeta")).toContain("2026-11-10");
  });

  test("HTML-004: a valid itinerary message renders user + assistant bubbles and a draft", async () => {
    const { page } = await open();
    await newChat(page);
    await send(page, "buat itinerary 2026-11-10 12:00 17:00 pantai");
    await page.waitForSelector(".msg.assistant");
    expect(await page.locator("#messages .msg").count()).toBe(2);
    expect(await page.locator("#messages .msg").first().getAttribute("class")).toMatch(/user/);
    expect(await page.locator("#messages .msg").nth(1).getAttribute("class")).toMatch(/assistant/);
    expect(await textOf(page, "#chatStatus")).toContain("Versi 1 dibuat");
    expect(await textOf(page, ".msg-tokens")).toContain("total 120");
    expect(await textOf(page, "#sessionTokens")).toContain("total 120");
  });

  test("HTML-005: empty messages are rejected before any API call", async () => {
    const { page, state } = await open();
    await newChat(page);
    await page.click("#sendBtn");
    expect(await textOf(page, "#chatStatus")).toContain("tidak boleh kosong");
    expect(state.messagePosts).toBe(0);
  });

  test("HTML-006: API failure keeps the text and marks the bubble failed", async () => {
    const { page } = await open();
    await newChat(page);
    await send(page, "error please");
    await page.waitForSelector(".msg.user.failed");
    expect(await textOf(page, "#chatStatus")).toContain("AI_UPSTREAM_ERROR");
    expect(await page.locator("#message").inputValue()).toBe("error please");
  });

  test("HTML-007: draft panel lists ordered stops with the active version", async () => {
    const { page } = await open();
    await newChat(page);
    await send(page, "pantai dan kuliner");
    await waitForDraft(page);
    expect(await textOf(page, "#draftMeta")).toContain("2026-11-10 · mulai 12:00 · 3 destinasi");
    expect(await page.locator("#stops li").count()).toBe(3);
    expect(await textOf(page, "#stops li:first-child")).toContain("Pantai Padang");
    expect(await textOf(page, "#stops li:first-child")).toContain("Kunjungan 12:00");
    expect(await textOf(page, "#stops li:first-child")).toContain("60 menit");
    expect(await textOf(page, "#versionMeta")).toContain("aktif v1");
    expect(await textOf(page, "#draftStatus")).toContain("Trip tersimpan");
  });

  test("HTML-008: restore creates a new version, then preview leaves the active version unchanged", async () => {
    const { page, state } = await open();
    await newChat(page);
    await send(page, "pantai dan kuliner");
    await waitForDraft(page);
    await send(page, "pantai dan kuliner lagi");
    await page.waitForFunction(() => document.querySelector("#versionMeta")?.textContent?.includes("aktif v2"));

    await page.locator('#versionList li:has-text("v1 ·") button:has-text("Pulihkan")').click();
    await page.waitForFunction(() =>
      document.querySelector("#draftStatus")?.textContent?.includes("dipulihkan sebagai v3"),
    );
    expect(await textOf(page, "#versionMeta")).toContain("aktif v3");
    expect(await page.locator("#versionList li").count()).toBe(3);
    expect(state.restoreCalls).toBe(1);

    await page.locator('#versionList li:has-text("v1 ·") button:has-text("Lihat")').click();
    await page.waitForFunction(() => document.querySelector("#versionMeta")?.textContent?.includes("pratinjau v1"));
    expect(await textOf(page, "#versionMeta")).toContain("aktif v3");
  });

  test("HTML-009: persisted fallback route shows straight-line labeling and numbered markers", async () => {
    const { page } = await open();
    await newChat(page);
    await send(page, "pantai dan kuliner");
    await waitForMarkers(page);
    const note = await textOf(page, "#routeNote");
    expect(note).toContain("Rute garis lurus");
    expect(note).toContain("Bukan rute jalan");
    expect(await page.locator(".stop-marker").allTextContents()).toEqual(["1", "2", "3"]);
    // Markers live inside the MapLibre canvas container: this only exists if the real library initialized.
    expect(await page.locator("#map canvas.maplibregl-canvas").count()).toBe(1);
    const canvas = await page.evaluate(() => {
      const el = document.querySelector("#map canvas.maplibregl-canvas") as HTMLCanvasElement | null;
      return el ? { width: el.width, height: el.height } : null;
    });
    expect(canvas).not.toBeNull();
    expect(canvas!.width).toBeGreaterThan(0);
    expect(canvas!.height).toBeGreaterThan(0);
  });

  test("HTML-010: persisted fallback route is labeled as a straight line, never road routing", async () => {
    const { page, state } = await open();
    state.osrmFails = true;
    await newChat(page);
    await send(page, "pantai dan kuliner");
    await waitForMarkers(page);
    expect(await textOf(page, "#routeNote")).toContain("Rute garis lurus");
    expect(await textOf(page, "#routeNote")).toContain("Bukan rute jalan");
    expect(await page.locator("#routeNote").getAttribute("class")).toMatch(/error/);
    expect(await page.locator("#stops li").count()).toBe(3);
  });

  test("HTML-011: fewer than two points skips route rendering", async () => {
    const { page } = await open();
    await newChat(page);
    await send(page, "satu destinasi saja");
    await waitForDraft(page, 1);
    expect(await textOf(page, "#routeNote")).toContain("Kurang dari 2 titik");
    expect(await page.locator(".stop-marker").count()).toBe(0);
  });

  test("HTML-012: base URL and user id persist in localStorage", async () => {
    const { page } = await open();
    await page.evaluate(() => {
      (document.querySelector("#settings") as HTMLDetailsElement).open = true;
    });
    await page.fill("#baseUrl", "http://localhost:8989");
    await page.locator("#baseUrl").blur();
    await page.reload();
    await page.waitForSelector("#newChatBtn");
    expect(await page.locator("#baseUrl").inputValue()).toBe("http://localhost:8989");
    const stored = await page.evaluate(
      (keys: { base: string; user: string }) => ({
        base: localStorage.getItem(keys.base),
        user: localStorage.getItem(keys.user),
      }),
      { base: APP_URL_KEY, user: USER_KEY },
    );
    expect(stored).toEqual({ base: "http://localhost:8989", user: USER_ID });
  });

  test("HTML-013: 390px mobile layout stacks chat over itinerary without overflow", async () => {
    const { page } = await open({ viewport: { width: 390, height: 844 } });
    await newChat(page);
    await send(page, "pantai dan kuliner");
    await waitForDraft(page);
    const layout = await page.evaluate(() => {
      const map = document.querySelector("#map") as HTMLElement | null;
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        mapHeight: map ? getComputedStyle(map).height : "",
        columns: getComputedStyle(document.querySelector(".layout") as HTMLElement).gridTemplateColumns,
      };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(layout.mapHeight).toBe("260px");
    expect(layout.columns.split(" ")).toHaveLength(1);
  });

  test("HTML-014: tabs and live regions expose accessible state, and new chat focuses the composer", async () => {
    const { page } = await open();
    await newChat(page);
    expect(await page.locator("#tabs").getAttribute("role")).toBe("tablist");
    expect(await page.locator("#tabs .tab").first().getAttribute("role")).toBe("tab");
    expect(await page.locator("#tabs .tab").first().getAttribute("aria-selected")).toBe("true");
    expect(await page.locator("#messages").getAttribute("aria-live")).toBe("polite");
    expect(await page.locator("#chatStatus").getAttribute("aria-live")).toBe("polite");
    await page.waitForFunction(() => document.activeElement?.id === "message");
  });
});
