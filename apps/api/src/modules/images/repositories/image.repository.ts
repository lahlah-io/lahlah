import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type ImageRepositoryErrorCode = "FETCH_FAILED" | "TOO_LARGE" | "NOT_AN_IMAGE";

export class ImageRepositoryError extends Error {
  constructor(
    readonly code: ImageRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImageRepositoryError";
  }
}

export function cacheKey(src: string, width: number): string {
  return createHash("sha256").update(`${src}|${width}`).digest("hex");
}

export async function readCache(dir: string, key: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(dir, `${key}.webp`));
  } catch {
    return null;
  }
}

/** tmp + rename so a concurrent reader never sees a half-written file. */
export async function writeCache(dir: string, key: string, bytes: Buffer): Promise<void> {
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, `${key}.webp`);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, target);
}

export async function resolveHostIps(hostname: string): Promise<string[]> {
  try {
    const results = await lookup(hostname, { all: true });
    return results.map((entry) => entry.address);
  } catch {
    return [];
  }
}

/**
 * Fetches the original image. Redirects are refused (a 3xx could point at an
 * internal host), the body is capped, and only `image/*` is accepted.
 */
export async function fetchImage(
  url: URL,
  options: { maxBytes: number; timeoutMs: number },
): Promise<{ bytes: Buffer; contentType: string }> {
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: { accept: "image/*" },
    });
  } catch (error) {
    throw new ImageRepositoryError(
      "FETCH_FAILED",
      error instanceof Error ? error.message : "Image fetch failed",
    );
  }

  if (!response.ok) {
    throw new ImageRepositoryError("FETCH_FAILED", `Upstream responded ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new ImageRepositoryError("NOT_AN_IMAGE", `Unexpected content type: ${contentType || "none"}`);
  }

  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > options.maxBytes) {
    throw new ImageRepositoryError("TOO_LARGE", "Image exceeds the size limit");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > options.maxBytes) {
    throw new ImageRepositoryError("TOO_LARGE", "Image exceeds the size limit");
  }
  return { bytes, contentType };
}
