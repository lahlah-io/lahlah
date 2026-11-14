import { Hono } from "hono";
import { zValidator } from "../../../shared/http/validator.js";
import { requireAuth, type AuthVariables } from "../../../shared/auth/middleware.js";
import { HttpError } from "../../../shared/http/errors.js";
import {
  checkpointTripParamSchema,
  createCheckpointFormSchema,
  createCheckpointSchema,
} from "../schemas/checkpoint.schema.js";
import type { CheckpointService } from "../services/checkpoint.service.js";

/** What this route needs from the images module; avoids a cross-feature import. */
export type CheckpointImages = {
  saveCheckpointImage(input: { bytes: Buffer; contentType: string; size: number }): Promise<string>;
  deleteCheckpointImage(imageUrl: string): Promise<void>;
};

/** Room for the multipart envelope on top of the image itself. */
const MULTIPART_OVERHEAD_BYTES = 1_000_000;

export function createCheckpointApi(
  service: CheckpointService,
  images: CheckpointImages,
  options: { maxImageBytes: number },
) {
  const api = new Hono<{ Variables: AuthVariables }>();

  api.get(
    "/:tripId/checkpoints",
    requireAuth,
    zValidator("param", checkpointTripParamSchema),
    async (c) =>
      c.json(
        await service.list({
          tripId: c.req.valid("param").tripId,
          userId: c.get("auth").user.id,
        }),
      ),
  );

  // Accepts both `multipart/form-data` (camera photo + fields) and the older JSON body.
  api.post(
    "/:tripId/checkpoints",
    requireAuth,
    zValidator("param", checkpointTripParamSchema),
    async (c) => {
      const tripId = c.req.valid("param").tripId;
      const userId = c.get("auth").user.id;
      const isMultipart = (c.req.header("content-type") ?? "")
        .toLowerCase()
        .startsWith("multipart/form-data");

      let input: ReturnType<typeof createCheckpointSchema.parse>;
      let imageUrl: string | undefined;
      let uploadedUrl: string | undefined;

      if (isMultipart) {
        const declared = Number(c.req.header("content-length") ?? "0");
        if (declared > options.maxImageBytes + MULTIPART_OVERHEAD_BYTES) {
          throw new HttpError(413, "IMAGE_TOO_LARGE", "Image exceeds the size limit");
        }
        const body = await c.req.parseBody();
        input = createCheckpointFormSchema.parse(body) as typeof input;
        const file = body.image;
        if (file instanceof File && file.size > 0) {
          uploadedUrl = await images.saveCheckpointImage({
            bytes: Buffer.from(await file.arrayBuffer()),
            contentType: file.type,
            size: file.size,
          });
          imageUrl = uploadedUrl;
        }
      } else {
        input = createCheckpointSchema.parse(await c.req.json());
        imageUrl = input.imageUrl;
      }

      try {
        const result = await service.checkIn({ tripId, userId, ...input, imageUrl });
        // A repeat check-in keeps the stored photo, so the fresh upload is orphaned.
        if (uploadedUrl && !result.created) await images.deleteCheckpointImage(uploadedUrl);
        return result.created
          ? c.json({ data: result.data }, 201)
          : c.json({ data: result.data }, 200);
      } catch (error) {
        if (uploadedUrl) await images.deleteCheckpointImage(uploadedUrl);
        throw error;
      }
    },
  );

  return api;
}
