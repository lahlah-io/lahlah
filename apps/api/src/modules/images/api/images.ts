import { Hono } from "hono";
import { zValidator } from "../../../shared/http/validator.js";
import { HttpError } from "../../../shared/http/errors.js";
import { imageQuerySchema } from "../schemas/image.schema.js";
import type { ImagesService } from "../services/images.service.js";

export function createImagesApi(service: ImagesService) {
  const api = new Hono();

  api.get("/", zValidator("query", imageQuerySchema), async (c) => {
    const image = await service.getImage(c.req.valid("query"));
    const headers = {
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
      etag: image.etag,
    };
    if (c.req.header("if-none-match") === image.etag) {
      return c.body(null, 304, headers);
    }
    const body = new Uint8Array(image.bytes).buffer;
    return c.body(body, 200, headers);
  });

  // Photos uploaded by users. The name is a server-generated uuid plus `.webp`,
  // which also blocks path traversal.
  api.get("/upload/checkpoints/:file", async (c) => {
    const bytes = await service.readCheckpointImage(c.req.param("file"));
    if (!bytes) throw new HttpError(404, "IMAGE_NOT_FOUND", "Image not found");
    return c.body(new Uint8Array(bytes).buffer, 200, {
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
    });
  });

  return api;
}
