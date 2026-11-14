import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, test } from "vitest";
import sharp from "sharp";
import { app } from "../../src/app.js";
import { createImagesService } from "../../src/modules/images/index.js";
import { HttpError } from "../../src/shared/http/errors.js";

const PNG_BIG_BYTES = 6_000_000;

async function startOrigin() {
  const jpeg = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .jpeg()
    .toBuffer();

  const server: Server = createServer((req, res) => {
    if (req.url === "/large.jpg") {
      res.writeHead(200, { "content-type": "image/jpeg", "content-length": jpeg.byteLength });
      res.end(jpeg);
      return;
    }
    if (req.url === "/page.html") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html></html>");
      return;
    }
    if (req.url === "/huge.png") {
      res.writeHead(200, { "content-type": "image/png", "content-length": PNG_BIG_BYTES });
      res.end(Buffer.alloc(PNG_BIG_BYTES));
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const close = () =>
    new Promise<void>((resolve) => {
      if (!server.listening) return resolve();
      server.close(() => resolve());
    });
  return { origin: `http://127.0.0.1:${address.port}`, close };
}

async function rejectsWithStatus(promise: Promise<unknown>, status: number) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof HttpError, `expected HttpError, got ${String(error)}`);
    assert.equal(error.status, status);
    return true;
  });
}

let cacheDir: string | undefined;
afterAll(async () => {
  if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
});

test("proxy resizes to WebP and serves repeats from the disk cache", async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), "lahlah-images-"));
  const { origin, close } = await startOrigin();
  const service = createImagesService({
    allowedHosts: ["127.0.0.1"],
    cacheDir,
    maxBytes: 1_000_000,
    timeoutMs: 5000,
    allowPrivateHosts: true,
    allowInsecure: true,
  });

  try {
    const src = `${origin}/large.jpg`;
    const first = await service.getImage({ src, w: 800 });
    assert.equal(first.fromCache, false);
    assert.equal(first.bytes.subarray(0, 4).toString(), "RIFF");
    assert.equal(first.bytes.subarray(8, 12).toString(), "WEBP");

    const metadata = await sharp(first.bytes).metadata();
    assert.equal(metadata.width, 800);
    assert.equal(metadata.format, "webp");

    // Same key must not refetch: the origin is gone for the second call.
    await close();
    const cached = await service.getImage({ src, w: 800 });
    assert.equal(cached.fromCache, true);
    assert.deepEqual(cached.bytes, first.bytes);
  } finally {
    await close();
  }
});

test("proxy rejects non-image, oversized, and non-allowlisted sources", async () => {
  cacheDir ??= await mkdtemp(path.join(tmpdir(), "lahlah-images-"));
  const { origin, close } = await startOrigin();
  const service = createImagesService({
    allowedHosts: ["127.0.0.1"],
    cacheDir,
    maxBytes: 1_000_000,
    timeoutMs: 5000,
    allowPrivateHosts: true,
    allowInsecure: true,
  });

  try {
    await rejectsWithStatus(service.getImage({ src: `${origin}/page.html`, w: 800 }), 415);
    await rejectsWithStatus(service.getImage({ src: `${origin}/huge.png`, w: 800 }), 413);

    const strict = createImagesService({
      allowedHosts: ["upload.wikimedia.org"],
      cacheDir,
      maxBytes: 1_000_000,
      timeoutMs: 5000,
      allowPrivateHosts: true,
    });
    await rejectsWithStatus(strict.getImage({ src: `${origin}/large.jpg`, w: 800 }), 400);
  } finally {
    await close();
  }
});

test("GET /api/v1/images rejects unknown hosts with the shared error envelope", async () => {
  const rejected = await app.request(
    `/api/v1/images?src=${encodeURIComponent("https://example.test/a.jpg")}`,
  );
  assert.equal(rejected.status, 400);
  const body = (await rejected.json()) as { error: { code: string } };
  assert.equal(body.error.code, "IMAGE_SOURCE_NOT_ALLOWED");

  const missing = await app.request("/api/v1/images");
  assert.equal(missing.status, 400);
  assert.equal(((await missing.json()) as { error: { code: string } }).error.code, "VALIDATION_ERROR");
});
