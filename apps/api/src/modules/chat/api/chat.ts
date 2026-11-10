import { Hono } from "hono";
import { zValidator } from "../../../shared/http/validator.js";
import type { ChatService } from "../services/chat.service.js";
import {
  activateVersionSchema,
  createSessionSchema,
  deleteSessionQuerySchema,
  getSessionQuerySchema,
  listMessagesQuerySchema,
  listSessionsQuerySchema,
  listVersionsQuerySchema,
  messageIdParamSchema,
  messageVersionParamSchema,
  regenerateMessageSchema,
  sendMessageSchema,
  sessionIdParamSchema,
  updateSessionSchema,
} from "../schemas/chat.schema.js";

export function createChatApi(chatService: ChatService) {
  const chatApi = new Hono();

  chatApi.post("/sessions", zValidator("json", createSessionSchema), async (c) =>
    c.json(await chatService.createSession(c.req.valid("json")), 201),
  );

  chatApi.get("/sessions", zValidator("query", listSessionsQuerySchema), async (c) =>
    c.json(await chatService.listSessions(c.req.valid("query"))),
  );

  chatApi.get(
    "/sessions/:id",
    zValidator("param", sessionIdParamSchema),
    zValidator("query", getSessionQuerySchema),
    async (c) =>
      c.json(
        await chatService.getSession({
          sessionId: c.req.valid("param").id,
          userId: c.req.valid("query").userId,
        }),
      ),
  );

  chatApi.patch(
    "/sessions/:id",
    zValidator("param", sessionIdParamSchema),
    zValidator("json", updateSessionSchema),
    async (c) =>
      c.json(
        await chatService.updateSession({
          sessionId: c.req.valid("param").id,
          ...c.req.valid("json"),
        }),
      ),
  );

  chatApi.delete(
    "/sessions/:id",
    zValidator("param", sessionIdParamSchema),
    zValidator("query", deleteSessionQuerySchema),
    async (c) =>
      c.json(
        await chatService.deleteSession({
          sessionId: c.req.valid("param").id,
          userId: c.req.valid("query").userId,
        }),
      ),
  );

  chatApi.get(
    "/sessions/:id/messages",
    zValidator("param", sessionIdParamSchema),
    zValidator("query", listMessagesQuerySchema),
    async (c) => {
      const query = c.req.valid("query") as {
        userId: string;
        page: number;
        limit: number;
        after_position?: number;
        afterPosition?: number;
      };
      return c.json(
        await chatService.listMessages({
          sessionId: c.req.valid("param").id,
          ...query,
        }),
      );
    },
  );

  chatApi.post(
    "/sessions/:id/messages",
    zValidator("param", sessionIdParamSchema),
    zValidator("json", sendMessageSchema),
    async (c) =>
      c.json(
        await chatService.sendMessage({
          sessionId: c.req.valid("param").id,
          ...c.req.valid("json"),
        }),
      ),
  );

  chatApi.post(
    "/messages/:id/regenerate",
    zValidator("param", messageIdParamSchema),
    zValidator("json", regenerateMessageSchema),
    async (c) =>
      c.json(
        await chatService.regenerateMessage({
          messageId: c.req.valid("param").id,
          userId: c.req.valid("json").userId,
        }),
      ),
  );

  chatApi.get(
    "/messages/:id/versions",
    zValidator("param", messageIdParamSchema),
    zValidator("query", listVersionsQuerySchema),
    async (c) =>
      c.json(
        await chatService.listMessageVersions({
          messageId: c.req.valid("param").id,
          userId: c.req.valid("query").userId,
        }),
      ),
  );

  chatApi.patch(
    "/messages/:id/versions/:version/activate",
    zValidator("param", messageVersionParamSchema),
    zValidator("json", activateVersionSchema),
    async (c) =>
      c.json(
        await chatService.activateMessageVersion({
          messageId: c.req.valid("param").id,
          userId: c.req.valid("json").userId,
          version: c.req.valid("param").version,
        }),
      ),
  );

  return chatApi;
}
