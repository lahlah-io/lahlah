import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { startStaticServer } from "./helpers/static-server.js";

const APP_URL_KEY = "lahlah.baseUrl";
const USER_KEY = "lahlah.userId";
const USER_ID = "11111111-1111-4111-8111-111111111111";

type Stop = {
  order: number;
  destinationId: string;
  name: string;
  latitude: number;
  longitude: number;
  visitAt: string;
  durationMinutes: number;
};

type Draft = {
  draftId: string;
  status: "pending_confirmation";
  travelDate: string;
  startTime: string;
  endTime: string;
  destinations: Stop[];
  route: { type: "LineString"; coordinates: Array<[number, number]> } | null;
};

type Message = { id: string; role: "user" | "assistant"; content: string };

type ApiState = {
  sessions: Array<{ id: string; title: string; userId: string }>;
  messages: Map<string, Message[]>;
  confirmCalls: number;
  messagePosts: number;
  osrmFails: boolean;
};

const stops: Stop[] = [
  { order: 1, destinationId: "d-1", name: "Pantai Padang", latitude: -0.95, longitude: 100.35, visitAt: "12:00", durationMinutes: 60 },
  { order: 2, destinationId: "d-2", name: "Museum Adityawarman", latitude: -0.94, longitude: 100.36, visitAt: "13:00", durationMinutes: 60 },
  { order: 3, destinationId: "d-3", name: "Pasar Raya", latitude: -0.93, longitude: 100.37, visitAt: "14:00", durationMinutes: 60 },
];

function draftFor(count: number): Draft {
  const chosen = stops.slice(0, count);
  return {
    draftId: `2222222${count}-1111-4111-8111-111111111111`,
    status: "pending_confirmation",
    travelDate: "2026-11-10",
    startTime: "12:00",
    endTime: "17:00",
    destinations: chosen,
    route: chosen.length >= 2 ? { type: "LineString", coordinates: chosen.map((s) => [s.longitude, s.latitude]) } : null,
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
      return json(route, 200, { data: state.messages.get(sessionId) ?? [] });
    }
    if (method === "POST") {
      state.messagePosts++;
      const body = request.postDataJSON() as { content: string };
      if (/error/i.test(body.content)) {
        return json(route, 500, { error: { code: "AI_UPSTREAM_ERROR", message: "boom" } });
      }
      const list = state.messages.get(sessionId) ?? [];
      list.push({ id: `m-user-${state.messagePosts}`, role: "user", content: body.content });
      const draft = draftFor(/satu/i.test(body.content) ? 1 : 3);
      list.push({ id: `m-assistant-${state.messagePosts}`, role: "assistant", content: "Draft itinerary siap dikonfirmasi." });
      state.messages.set(sessionId, list);
      return json(route, 200, {
        data: {
          message: "Draft itinerary siap dikonfirmasi.",
          intent: "generate_itinerary",
          draft,
          assistantMessageId: `m-assistant-${state.messagePosts}`,
          sessionId,
        },
      });
    }
  }
  if (method === "POST" && url.pathname === "/api/v1/itineraries/confirm") {
    state.confirmCalls++;
    return json(route, 201, { data: { id: "itin-1" } });
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
  const state: ApiState = { sessions: [], messages: new Map(), confirmCalls: 0, messagePosts: 0, osrmFails: false };
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
    const method = route.request().method();
    if (url.hostname === "api.test" && url.pathname === "/api/v1/routes/driving") {
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers: corsHeaders() });
      if (state.osrmFails) {
        return json(route, 200, {
          data: {
            source: "fallback",
            distanceKm: 3.4,
            durationMin: null,
            estimated: false,
            error: "OSRM HTTP 503",
            geometry: { type: "LineString", coordinates: stops.map((s) => [s.longitude, s.latitude]) },
          },
        });
      }
      return json(route, 200, {
        data: {
          source: "osrm",
          distanceKm: 8.4,
          durationMin: 16,
          estimated: false,
          geometry: { type: "LineString", coordinates: stops.map((s) => [s.longitude, s.latitude]) },
        },
      });
    }
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
  await page.click("#newChatBtn");
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

    await page.locator("#tabs .tab").nth(1).click();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("#messages .msg")).some((el) => el.textContent === "pantai untuk besok"),
    );
    expect(await page.locator("#messages .msg").count()).toBe(2);
    expect(await textOf(page, "#messages .msg:first-child")).toBe("pantai untuk besok");
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
    expect(await textOf(page, "#chatStatus")).toContain("Draft siap");
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

  test("HTML-007: draft panel lists ordered stops and offers save", async () => {
    const { page } = await open();
    await newChat(page);
    await send(page, "pantai dan kuliner");
    await waitForDraft(page);
    expect(await textOf(page, "#draftMeta")).toContain("2026-11-10 · 12:00–17:00 · 3 destinasi");
    expect(await page.locator("#stops li").count()).toBe(3);
    expect(await textOf(page, "#stops li:first-child")).toContain("Pantai Padang");
    expect(await textOf(page, "#stops li:first-child")).toContain("12:00 · 60 menit");
    expect(await page.locator("#confirmBtn").isVisible()).toBe(true);
  });

  test("HTML-008: saving hides the button, shows the saved id, and does not repeat", async () => {
    const { page, state } = await open();
    await newChat(page);
    await send(page, "pantai dan kuliner");
    await waitForDraft(page);
    await page.click("#confirmBtn");
    await page.waitForFunction(() => document.querySelector("#draftStatus")?.textContent?.includes("Itinerary tersimpan"));
    expect(await textOf(page, "#draftStatus")).toContain("itin-1");
    expect(await page.locator("#confirmBtn").isHidden()).toBe(true);
    expect(state.confirmCalls).toBe(1);
  });

  test("HTML-009: successful OSRM route shows distance, duration, and numbered markers", async () => {
    const { page } = await open();
    await newChat(page);
    await send(page, "pantai dan kuliner");
    await waitForMarkers(page);
    const note = await textOf(page, "#routeNote");
    expect(note).toContain("Rute jalan OSRM");
    expect(note).toContain("8,4 km");
    expect(note).toContain("16 menit");
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

  test("HTML-010: OSRM failure falls back to the straight line and says so", async () => {
    const { page, state } = await open();
    state.osrmFails = true;
    await newChat(page);
    await send(page, "pantai dan kuliner");
    await waitForMarkers(page);
    expect(await textOf(page, "#routeNote")).toContain("Memakai garis lurus dari draft");
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
