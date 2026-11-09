import { Hono } from "hono";
import { zValidator } from "../../../shared/http/validator.js";
import type { ChatService } from "../services/chat.service.js";
import {
  createSessionSchema,
  listMessagesQuerySchema,
  listSessionsQuerySchema,
  sendMessageSchema,
  sessionIdParamSchema,
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
    "/sessions/:id/messages",
    zValidator("param", sessionIdParamSchema),
    zValidator("query", listMessagesQuerySchema),
    async (c) =>
      c.json(
        await chatService.listMessages({
          sessionId: c.req.valid("param").id,
          ...c.req.valid("query"),
        }),
      ),
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

  return chatApi;
}
