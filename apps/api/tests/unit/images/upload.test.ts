import assert from "node:assert/strict";
import { afterAll, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { app } from "../../../src/app.js";
import {
  CHECKPOINT_IMAGE_URL_PREFIX,
  CHECKPOINT_IMAGE_WIDTH,
  createImagesService,
} from "../../../src/modules/images/index.js";
import { HttpError } from "../../../src/shared/http/errors.js";

const uploadDir = await mkdtemp(path.join(tmpdir(), "lahlah-uploads-"));
afterAll(() => rm(uploadDir, { recursive: true, force: true }));

function service(maxBytes = 5_000_000) {
  return createImagesService({
    allowedHosts: [],
    cacheDir: uploadDir,
    uploadDir,
    maxBytes,
    timeoutMs: 5000,
  });
}

async function rejectsWithStatus(promise: Promise<unknown>, status: number) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof HttpError, `expected HttpError, got ${String(error)}`);
    assert.equal(error.status, status);
    return true;
  });
}

test("camera upload is stored as a 1200 px WebP without EXIF", async () => {
  const jpeg = await sharp({
    create: { width: 3000, height: 2000, channels: 3, background: { r: 20, g: 120, b: 200 } },
  })
    .withMetadata({ exif: { IFD0: { Copyright: "someone" } } })
    .jpeg()
    .toBuffer();

  const images = service();
  const url = await images.saveCheckpointImage({
    bytes: jpeg,
    contentType: "image/jpeg",
    size: jpeg.byteLength,
  });

  assert.ok(url.startsWith(CHECKPOINT_IMAGE_URL_PREFIX), url);
  const name = url.slice(CHECKPOINT_IMAGE_URL_PREFIX.length);
  assert.match(name, /^[0-9a-f-]{36}\.webp$/);

  const stored = await images.readCheckpointImage(name);
  assert.ok(stored);
  const metadata = await sharp(stored).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, CHECKPOINT_IMAGE_WIDTH);
  assert.equal(metadata.exif, undefined);

  await images.deleteCheckpointImage(url);
  assert.equal(await images.readCheckpointImage(name), null);
});

test("upload rejects oversized, non-image, and undecodable files", async () => {
  const images = service(1000);
  const jpeg = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .jpeg()
    .toBuffer();

  await rejectsWithStatus(
    images.saveCheckpointImage({ bytes: jpeg, contentType: "image/jpeg", size: 2000 }),
    413,
  );

  const relaxed = service();
  await rejectsWithStatus(
    relaxed.saveCheckpointImage({ bytes: jpeg, contentType: "text/plain", size: jpeg.byteLength }),
    415,
  );
  await rejectsWithStatus(
    relaxed.saveCheckpointImage({
      bytes: Buffer.from("not an image"),
      contentType: "image/jpeg",
      size: 12,
    }),
    422,
  );
});

test("file names outside <uuid>.webp never reach the filesystem", async () => {
  const images = service();
  assert.equal(await images.readCheckpointImage("../../package.json"), null);
  assert.equal(await images.readCheckpointImage("not-a-uuid.webp"), null);

  const response = await app.request("/api/v1/images/upload/checkpoints/..%2F..%2Fpackage.json");
  assert.equal(response.status, 404);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "IMAGE_NOT_FOUND");
});
