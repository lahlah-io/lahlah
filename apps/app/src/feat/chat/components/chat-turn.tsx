import { Bot, User } from "lucide-react";

import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { Bubble, BubbleContent } from "@/shared/components/ui/bubble";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/shared/components/ui/message";

import AICitation from "./smoothui/ai-citation";
import AILoader from "./smoothui/ai-loader";
import AIOrbFace from "./smoothui/ai-orb-face";
import AIResponse from "./smoothui/ai-response";
import { TripTask } from "./trip-task";
import type { ChatMessage } from "../types/chat";

interface ChatTurnProps {
  message: ChatMessage;
}

function UserTurn({ message }: ChatTurnProps) {
  return (
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
  );
}

interface AssistantTurnProps {
  message: ChatMessage;
}

function AssistantTurn({ message }: AssistantTurnProps) {
  return (
    <Message align="start">
      <MessageAvatar>
        <AIOrbFace size={32} state="done" aria-label="Lahlah AI" />
      </MessageAvatar>
      <MessageContent>
        {/* Status trip tampil di atas balasan: user melihat apa yang terjadi
            sebelum membaca penjelasannya. */}
        {message.task ? (
          <TripTask detail={message.task.detail} state={message.task.state} />
        ) : null}
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
                    description="Sumber jawaban."
                  />
                ))}
              </span>
            ) : null}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}

/**
 * Baris asisten sementara. API menjawab sekali jadi (bukan stream token), jadi
 * yang ditampilkan status berpikir sampai jawaban tiba. Checklist trip berjalan
 * di atas bubble supaya terlihat bahwa backend memang sedang bekerja.
 */
export function PendingTurn({ label = "Menyusun jawaban" }: { label?: string }) {
  return (
    <Message align="start">
      <MessageAvatar>
        <AIOrbFace size={32} state="thinking" aria-label="Lahlah AI sedang menjawab" />
      </MessageAvatar>
      <MessageContent>
        <TripTask state="running" />
        <Bubble align="start" variant="muted">
          <BubbleContent>
            <AILoader label={label} showElapsed variant="dots" />
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
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
