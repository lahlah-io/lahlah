"use client";

import { cn } from "@/shared/utils/cn";
import { motion, useReducedMotion } from "motion/react";
import { Fragment, type ReactNode, useEffect, useRef } from "react";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/**
 * Hoisted and frozen. Motion restarts an animation whenever the transition it is
 * given changes, and this component re-renders on every token — so the object
 * has to be the same reference every time.
 */
const WORD_TRANSITION = { duration: 0.22, ease: EASE_OUT } as const;
const WORD_BLUR_PX = 4;
/** `[1]` style markers become citation pills. */
const CITATION_MARKER = /^\[(\d+)\]$/;
/**
 * Split on whitespace *and* on markers, so a marker is its own token even when
 * punctuation is glued to it — `compute [1],` has to yield `[1]` and `,`
 * separately or the pill never matches.
 */
const TOKEN_SPLIT = /(\s+|\[\d+\])/;
/** Anything without a letter or digit is punctuation and is not animated. */
const HAS_WORD_CHARACTER = /[\p{L}\p{N}]/u;
const WHITESPACE_ONLY = /^\s+$/;

export type AIResponseCitation = {
  id: string;
  /** The number shown in the pill, matching the `[n]` marker in the text. */
  index: number;
  title: string;
  /**
   * Where the source lives, when it lives anywhere.
   *
   * Optional on purpose: most retrieval is over internal documents that have no
   * public URL, and a required field there just pushes people into inventing
   * `example.com` links that go nowhere. Without a url the pill renders as plain
   * text instead of a dead link.
   */
  url?: string;
};

export type AIResponseProps = {
  /** Sources referenced by `[n]` markers in the text. */
  citations?: AIResponseCitation[];
  className?: string;
  /** Shows a caret after the last word. */
  isStreaming?: boolean;
  /** The response so far. Re-render it as it grows. */
  text: string;
};

type Token = {
  bold?: boolean;
  citation?: AIResponseCitation;
  code?: boolean;
  italic?: boolean;
  value: string;
};

/** Inline markdown minimal: `code`, **bold**, *italic*. Tanpa dep baru. */
const INLINE_SPLIT = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+?\*)/g;

function styleOf(part: string): Pick<Token, "bold" | "code" | "italic" | "value"> {
  if (part.length >= 2 && part.startsWith("`") && part.endsWith("`")) {
    return { code: true, value: part.slice(1, -1) };
  }
  if (part.length >= 5 && part.startsWith("**") && part.endsWith("**")) {
    return { bold: true, value: part.slice(2, -2) };
  }
  if (part.length >= 3 && part.startsWith("*") && part.endsWith("*")) {
    return { italic: true, value: part.slice(1, -1) };
  }
  return { value: part };
}

const tokenize = (text: string, citations: AIResponseCitation[]): Token[] =>
  text
    .split(TOKEN_SPLIT)
    .filter((value) => value !== "")
    .flatMap((value): Token[] => {
      const match = value.match(CITATION_MARKER);
      if (match) {
        const index = Number(match[1]);
        const citation = citations.find((entry) => entry.index === index);
        return citation ? [{ citation, value }] : [{ value }];
      }
      if (WHITESPACE_ONLY.test(value)) return [{ value }];
      // ponytail: tanpa list/heading/link parser; tambah saat model memakainya.
      return value
        .split(INLINE_SPLIT)
        .filter((part) => part !== "")
        .flatMap((part) => {
          const styled = styleOf(part);
          return styled.value
            .split(/(\s+)/)
            .filter((word) => word !== "")
            .map((word) => ({ ...styled, value: word }));
        });
    });

/**
 * Streaming assistant text.
 *
 * Words animate in as they *arrive*, not on a fixed timer — the component
 * remembers how many tokens it had last render and only animates the new ones.
 * A timer-driven typewriter drifts out of step with the real stream and starts
 * lying about how fast the model is answering.
 */
const AIResponse = ({
  citations = [],
  className,
  isStreaming = false,
  text,
}: AIResponseProps) => {
  const shouldReduceMotion = useReducedMotion();
  const tokens = tokenize(text, citations);

  // How many tokens had already been painted before this render. Everything at
  // or after this index is new and gets the entrance. Reading the ref here is
  // intentional: the value must be captured synchronously during render so a
  // token painted in this pass is not mistaken for a new arrival next pass.
  const paintedRef = useRef(0);
  const firstNewIndex = paintedRef.current;

  useEffect(() => {
    paintedRef.current = tokens.length;
  }, [tokens.length]);

  // eslint-disable-next-line react-hooks/refs -- render-time snapshot is intentional, see comment above
  const rows = tokens.map((token, index) => {
        const isNew = index >= firstNewIndex;
        // Keyed by position only. Keying by text too would remount the last word
        // every time a token extends it, so it would re-animate on every frame of
        // the stream.
        const key = index;

        // Whitespace and bare punctuation stay as text. Wrapping a comma in its
        // own inline-block would let the line break between a word and its
        // punctuation.
        if (WHITESPACE_ONLY.test(token.value)) {
          // Baris baru model jadi <br>; spasi biasa tetap teks agar pemenggalan
          // kata tidak berubah.
          return token.value.includes("\n") ? (
            <br key={key} />
          ) : (
            <Fragment key={key}>{token.value}</Fragment>
          );
        }

        if (!(token.citation || HAS_WORD_CHARACTER.test(token.value))) {
          return <Fragment key={key}>{token.value}</Fragment>;
        }

        if (token.citation) {
          return (
            <AIResponseCitationPill
              citation={token.citation}
              isNew={isNew}
              key={key}
              shouldReduceMotion={Boolean(shouldReduceMotion)}
            />
          );
        }

        return (
          <motion.span
            animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
            className="inline-block"
            initial={
              isNew && !shouldReduceMotion
                ? { filter: `blur(${WORD_BLUR_PX}px)`, opacity: 0, y: 2 }
                : false
            }
            key={key}
            // No stagger delay, deliberately. The transition object has to stay
            // identical across renders: a delay derived from the render-time
            // index goes negative as the text grows, and the entrance then never
            // resolves — words stay blurred forever. Token arrival is the stagger.
            transition={shouldReduceMotion ? { duration: 0 } : WORD_TRANSITION}
          >
            <StyledToken token={token}>{token.value}</StyledToken>
          </motion.span>
        );
      });

  return (
    <p
      className={cn(
        "text-pretty text-foreground text-sm leading-relaxed",
        className
      )}
    >
      {rows}
      {isStreaming ? (
        <AIResponseCaret shouldReduceMotion={shouldReduceMotion} />
      ) : null}
    </p>
  );
};

const STYLED_WRAPPER: Record<string, string> = {
  bold: "font-semibold text-foreground",
  code: "rounded bg-muted px-1 font-mono text-[13px]",
  italic: "italic",
};

function StyledToken({
  children,
  token,
}: {
  children: ReactNode;
  token: Token;
}) {
  const classes = [
    token.bold ? STYLED_WRAPPER.bold : null,
    token.italic ? STYLED_WRAPPER.italic : null,
    token.code ? STYLED_WRAPPER.code : null,
  ].filter(Boolean);
  if (classes.length === 0) return <>{children}</>;
  return <span className={classes.join(" ")}>{children}</span>;
}

const AIResponseCaret = ({
  shouldReduceMotion,
}: {
  shouldReduceMotion: boolean | null;
}) => (
  // Inline rather than absolutely positioned, so it rides the last glyph for
  // free and never has to be told where the text ended.
  <motion.span
    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: [1, 0.15, 1] }}
    aria-hidden="true"
    className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] rounded-full bg-current align-baseline"
    transition={
      shouldReduceMotion
        ? { duration: 0 }
        : { duration: 1, ease: "linear", repeat: Number.POSITIVE_INFINITY }
    }
  />
);

const AIResponseCitationPill = ({
  citation,
  isNew,
  shouldReduceMotion,
}: {
  citation: AIResponseCitation;
  isNew: boolean;
  shouldReduceMotion: boolean;
}) => {
  const shared = {
    animate: { opacity: 1, scale: 1 },
    // No left margin: the marker is already preceded by a space in the text, so
    // adding one here doubles the gap.
    className:
      "mr-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-border bg-muted px-1 align-super font-medium text-[10px] text-muted-foreground no-underline",
    initial:
      isNew && !shouldReduceMotion
        ? { opacity: 0, scale: 0.6 }
        : (false as const),
    title: citation.title,
    transition: shouldReduceMotion
      ? { duration: 0 }
      : { bounce: 0.1, duration: 0.25, type: "spring" as const },
  };

  // An internal document has nowhere to go, so it is not dressed up as a link —
  // no hover affordance, no pointer, nothing to click and be disappointed by.
  if (!citation.url) {
    return <motion.span {...shared}>{citation.index}</motion.span>;
  }

  return (
    <motion.a
      {...shared}
      className={`${shared.className} transition-colors hover:border-foreground/30 hover:text-foreground`}
      href={citation.url}
      rel="noopener noreferrer"
      target="_blank"
    >
      {citation.index}
    </motion.a>
  );
};

export default AIResponse;
