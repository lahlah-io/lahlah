import { Bot, User } from "lucide-react";

import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { Bubble, BubbleContent } from "@/shared/components/ui/bubble";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/shared/components/ui/message";
import { MessageScrollerItem } from "@/shared/components/ui/message-scroller";

import AICitation from "./smoothui/ai-citation";
import AILoader from "./smoothui/ai-loader";
import AIOrbFace from "./smoothui/ai-orb-face";
import AIResponse from "./smoothui/ai-response";
import type { ChatMessage } from "../types/chat";
import type { SimulatedTurn } from "../hooks/use-simulated-reply";

interface ChatTurnProps {
  message: ChatMessage;
}

function UserTurn({ message }: ChatTurnProps) {
  return (
    <MessageScrollerItem messageId={message.id} scrollAnchor>
      <Message align="end">
        <MessageAvatar>
          <Avatar className="size-8">
            <AvatarFallback>
              <User className="size-4" aria-hidden="true" />
            </AvatarFallback>
          </Avatar>
        </MessageAvatar>
        <MessageContent>
          <Bubble align="end" variant="default">
            <BubbleContent className="whitespace-pre-wrap">
              {message.text}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
}

interface AssistantTurnProps {
  message: ChatMessage;
}

function AssistantTurn({ message }: AssistantTurnProps) {
  return (
    <MessageScrollerItem messageId={message.id}>
      <Message align="start">
        <MessageAvatar>
          <AIOrbFace size={32} state="done" aria-label="Lahlah AI" />
        </MessageAvatar>
        <MessageContent>
          <Bubble align="start" variant="muted">
            <BubbleContent>
              <AIResponse
                text={message.text}
                citations={message.citations?.map((citation) => ({
                  id: citation.id,
                  index: citation.index,
                  title: citation.title,
                  url: citation.url,
                }))}
              />
              {message.citations && message.citations.length > 0 ? (
                <span className="mt-2 flex flex-wrap items-center gap-1.5">
                  {message.citations.map((citation) => (
                    <AICitation
                      key={citation.id}
                      label={citation.index}
                      title={citation.title}
                      url={citation.url ?? "#"}
                      description="Sumber dari jawaban simulasi ini."
                    />
                  ))}
                </span>
              ) : null}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
}

interface StreamingTurnProps {
  turn: SimulatedTurn;
}

/**
 * Live assistant row. `thinking` shows the loader with the orb looking away;
 * once words arrive, `AIResponse` streams them with a caret. The row is not a
 * `scrollAnchor` — the user's question above it already holds the position.
 */
export function StreamingTurn({ turn }: StreamingTurnProps) {
  return (
    <MessageScrollerItem messageId="streaming">
      <Message align="start">
        <MessageAvatar>
          <AIOrbFace size={32} state={turn.state} aria-label="Lahlah AI sedang menjawab" />
        </MessageAvatar>
        <MessageContent>
          <Bubble align="start" variant="muted">
            <BubbleContent>
              {turn.state === "thinking" ? (
                <AILoader label="Berpikir" showElapsed variant="dots" />
              ) : (
                <AIResponse text={turn.draft} isStreaming />
              )}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
}

export function ChatTurn({ message }: ChatTurnProps) {
  if (message.role === "user") return <UserTurn message={message} />;
  return <AssistantTurn message={message} />;
}

export function AssistantAvatar() {
  return (
    <Avatar className="size-8">
      <AvatarFallback>
        <Bot className="size-4" aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  );
}
