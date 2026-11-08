import { useEffect, useRef, useState } from "react";

import type { AIResponseCitation } from "../components/smoothui/ai-response";
import type { AIState } from "../components/smoothui/ai-core";
import { pickReply } from "../utils/simulated-replies";

/** Thinking pause before streaming starts; reads as "working", not a stall. */
const THINK_DELAY_MS = 1400;
/** Per-token tick while streaming; fast enough to feel live, slow enough to read. */
const STREAM_TICK_MS = 55;
/** Words appended per tick, so long answers still finish in a reasonable time. */
const WORDS_PER_TICK = 3;

export interface SimulatedTurn {
  /** Snapshot of the reply text to render while streaming. */
  draft: string;
  /** Shared AI state the orb, composer, and loader all read. */
  state: AIState;
  /** True while the timer pipeline owns the turn. */
  streaming: boolean;
}

const IDLE_TURN: SimulatedTurn = { draft: "", state: "idle", streaming: false };

function splitWords(text: string): string[] {
  return text.split(/(\s+)/).filter((part) => part !== "");
}

/**
 * Frontend-only reply simulation. Owns the thinking -> streaming -> done
 * pipeline with plain timers; the caller persists the final text and clears
 * the turn. Nothing here touches the network.
 */
export function useSimulatedReply() {
  const [turn, setTurn] = useState<SimulatedTurn>(IDLE_TURN);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rotationRef = useRef(0);

  const clearTimers = () => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current = [];
  };

  useEffect(() => clearTimers, []);

  const cancel = () => {
    clearTimers();
    setTurn(IDLE_TURN);
  };

  const start = (
    prompt: string,
    onDone: (text: string, citations: AIResponseCitation[]) => void,
  ) => {
    clearTimers();
    const reply = pickReply(prompt, rotationRef.current);
    rotationRef.current += 1;
    const words = splitWords(reply.text);
    let shown = 0;

    setTurn({ draft: "", state: "thinking", streaming: true });

    const thinkTimer = setTimeout(() => {
      setTurn({ draft: "", state: "streaming", streaming: true });

      const step = () => {
        shown = Math.min(shown + WORDS_PER_TICK, words.length);
        const draft = words.slice(0, shown).join("");
        const finished = shown >= words.length;
        if (finished) {
          setTurn(IDLE_TURN);
          onDone(reply.text, reply.citations);
          return;
        }
        setTurn({ draft, state: "streaming", streaming: true });
        timersRef.current.push(setTimeout(step, STREAM_TICK_MS));
      };
      step();
    }, THINK_DELAY_MS);
    timersRef.current.push(thinkTimer);
  };

  return { cancel, start, turn };
}
