import { createHash } from "node:crypto";
import sharp from "sharp";
import { HttpError } from "../../../shared/http/errors.js";
import {
  ImageRepositoryError,
  cacheKey,
  fetchImage,
  readCache,
  resolveHostIps,
  writeCache,
} from "../repositories/image.repository.js";
import { isPrivateAddress, parseAllowedSource } from "./image-policy.js";
import {
  deleteCheckpointImage,
  readCheckpointImage,
  writeCheckpointImage,
} from "../repositories/uploads.repository.js";

/** Uploaded checkpoint photos are stored at this width, well beyond phone screens. */
export const CHECKPOINT_IMAGE_WIDTH = 1200;
export const CHECKPOINT_IMAGE_URL_PREFIX = "/api/v1/images/upload/checkpoints/";

export type ImagesServiceOptions = {
  allowedHosts: string[];
  cacheDir: string;
  uploadDir: string;
  maxBytes: number;
  timeoutMs: number;
  /** Test-only: allow loopback sources so the proxy can be exercised locally. */
  allowPrivateHosts?: boolean;
  /** Test-only: accept plain http as well. Production always requires https. */
  allowInsecure?: boolean;
};

export type CompressedImage = { bytes: Buffer; etag: string; fromCache: boolean };

function etagOf(bytes: Buffer): string {
  return `"${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}"`;
}

export function createImagesService(options: ImagesServiceOptions) {
  return {
    /** Resize + re-encode to WebP, caching the result on disk by (src, width). */
    async getImage(input: { src: string; w: number }): Promise<CompressedImage> {
      const url = parseAllowedSource(input.src, options.allowedHosts, options.allowInsecure);
      if (!url) {
        throw new HttpError(400, "IMAGE_SOURCE_NOT_ALLOWED", "Image source is not allowed");
      }

      if (!options.allowPrivateHosts) {
        const ips = await resolveHostIps(url.hostname);
        if (ips.length === 0 || ips.some(isPrivateAddress)) {
          throw new HttpError(400, "IMAGE_SOURCE_NOT_ALLOWED", "Image source resolves to a private address");
        }
      }

      const key = cacheKey(input.src, input.w);
      const cached = await readCache(options.cacheDir, key);
      if (cached) return { bytes: cached, etag: etagOf(cached), fromCache: true };

      let original: Buffer;
      try {
        original = (await fetchImage(url, options)).bytes;
      } catch (error) {
        if (error instanceof ImageRepositoryError) {
          if (error.code === "TOO_LARGE") throw new HttpError(413, "IMAGE_TOO_LARGE", "Image exceeds the size limit");
          if (error.code === "NOT_AN_IMAGE") throw new HttpError(415, "IMAGE_UNSUPPORTED_TYPE", "Source is not an image");
          throw new HttpError(502, "IMAGE_FETCH_FAILED", "Could not download the image");
        }
        throw error;
      }

      let bytes: Buffer;
      try {
        bytes = await sharp(original, { limitInputPixels: 40_000_000 })
          .rotate()
          .resize({ width: input.w, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80, effort: 4 })
          .toBuffer();
      } catch {
        throw new HttpError(422, "IMAGE_UNSUPPORTED", "Image format could not be processed");
      }

      await writeCache(options.cacheDir, key, bytes);
      return { bytes, etag: etagOf(bytes), fromCache: false };
    },

    /**
     * Camera uploads are compressed on the server so the client cannot skip it.
     * `.rotate()` + no `withMetadata()` drops EXIF, including the GPS tag.
     * ponytail: local disk only; swap `uploadDir` for object storage when running
     * more than one instance.
     */
    async saveCheckpointImage(input: {
      bytes: Buffer;
      contentType: string;
      size: number;
    }): Promise<string> {
      if (input.size > options.maxBytes) {
        throw new HttpError(413, "IMAGE_TOO_LARGE", "Image exceeds the size limit");
      }
      if (!input.contentType.toLowerCase().startsWith("image/")) {
        throw new HttpError(415, "IMAGE_UNSUPPORTED_TYPE", "Uploaded file is not an image");
      }

      let bytes: Buffer;
      try {
        bytes = await sharp(input.bytes, { limitInputPixels: 40_000_000 })
          .rotate()
          .resize({ width: CHECKPOINT_IMAGE_WIDTH, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80, effort: 4 })
          .toBuffer();
      } catch {
        throw new HttpError(422, "IMAGE_UNSUPPORTED", "Image format could not be processed");
      }

      const name = await writeCheckpointImage(options.uploadDir, bytes);
      return `${CHECKPOINT_IMAGE_URL_PREFIX}${name}`;
    },

    async readCheckpointImage(name: string): Promise<Buffer | null> {
      return readCheckpointImage(options.uploadDir, name);
    },

    /** Called when the check-in itself fails, so a rejected request leaves no orphan file. */
    async deleteCheckpointImage(imageUrl: string): Promise<void> {
      const name = imageUrl.slice(imageUrl.lastIndexOf("/") + 1);
      await deleteCheckpointImage(options.uploadDir, name);
    },
  };
}

export type ImagesService = ReturnType<typeof createImagesService>;
