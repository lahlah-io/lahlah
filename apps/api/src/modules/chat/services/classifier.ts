import { z } from "zod";
import { completeChat, resolveAiRoleConfig } from "../../../integrations/ai/chat-completions.js";
import { appendLog } from "../../../shared/logging/file-logger.js";
import { ADD_VERB, DESTINATION_NOUN, DISLIKE, REMOVE_VERB, REPLACE_VERB } from "./vocab.js";

export const intentLabels = [
  "general_chat",
  "generate_itinerary",
  "modify_itinerary",
  "replace_destination",
  "remove_destination",
  "add_destination",
  "regenerate_itinerary",
  "select_itinerary_version",
  "publish_itinerary_version",
  "clarify_modification",
  "feedback_itinerary",
  "missing_information",
] as const;

export type Intent = (typeof intentLabels)[number];

export type ClassificationResult = {
  intent: Intent;
  confidence?: number;
  source: "rule" | "model";
  usage?: { promptTokens: number; completionTokens: number };
};

type EnvLike = Record<string, string | undefined>;

const MIN_CONFIDENCE = 0.7;

const classifierOutputSchema = z.object({
  intent: z.enum(intentLabels),
  confidence: z.number().min(0).max(1),
});

export const CLASSIFIER_SYSTEM_PROMPT =
  'Classify the user message into exactly one intent. Respond with ONLY a JSON object in the form {"intent":"<label>","confidence":<0..1>}. Labels: general_chat, generate_itinerary, modify_itinerary, replace_destination, remove_destination, add_destination, regenerate_itinerary, select_itinerary_version, publish_itinerary_version, clarify_modification, feedback_itinerary, missing_information.';

const GREETINGS = ["halo", "hai", "hi", "hello", "assalamualaikum", "selamat pagi", "selamat siang", "selamat sore", "selamat malam"];

// Narrow keyword rules only for risk-free explicit commands; everything else goes to the model.
const RULE_KEYWORDS: Array<{ intent: Intent; keywords: string[] }> = [
  { intent: "regenerate_itinerary", keywords: ["buat ulang", "generate ulang", "regenerate", "ulangi", "acak ulang"] },
  { intent: "modify_itinerary", keywords: ["ubah", "ganti", "modifikasi"] },
  {
    intent: "generate_itinerary",
    keywords: ["buat itinerary", "buatkan itinerary", "buat jadwal", "buatkan jadwal", "buat rencana", "rencanakan", "generate itinerary", "bikin itinerary", "bikin jadwal"],
  },
];

// Destination-scoped verbs need a target; plain "ubah jadwal" stays modify_itinerary.
const RULE_PATTERNS: Array<{ intent: Intent; pattern: RegExp }> = [
  { intent: "select_itinerary_version", pattern: /\b(?:pilih|kembali\s+ke|buka|lihat)\s+versi\b/ },
  { intent: "publish_itinerary_version", pattern: /\b(?:publish|publikasikan|simpan\s+final)\b/ },
  {
    intent: "replace_destination",
    pattern: new RegExp(`${REPLACE_VERB.source}[^.]*(?:${DESTINATION_NOUN.source}|nomor|ke-\\d)`),
  },
  {
    intent: "remove_destination",
    pattern: new RegExp(`${REMOVE_VERB.source}[^.]*(?:${DESTINATION_NOUN.source}|nomor|ke-\\d|\\d)`),
  },
  {
    intent: "add_destination",
    pattern: new RegExp(`${ADD_VERB.source}\\s+(?:\\d+\\s+)?${DESTINATION_NOUN.source}`),
  },
  {
    intent: "feedback_itinerary",
    pattern: /\b(?:tidak|gak|nggak|enggak|ga)\s+(?:masuk\s+akal|make\s+sense|logis|variasi|seimbang)\b|\bmakan\s+terus\b|\bterlalu\s+banyak\b|\bkurang\s+variasi\b|\bcoba\s+cek\b|\bkok\s+(?:gitu|begitu|aneh|gini)\b/i,
  },
  { intent: "clarify_modification", pattern: DISLIKE },
];

function matchRule(message: string): ClassificationResult | null {
  const m = message.trim().toLowerCase();
  if (!m) return null;
  if (GREETINGS.some((g) => m.startsWith(g) && !/[a-z0-9]/.test(m[g.length] ?? ""))) {
    return { intent: "general_chat", source: "rule" };
  }
  for (const rule of RULE_PATTERNS) {
    if (rule.pattern.test(m)) return { intent: rule.intent, source: "rule" };
  }
  for (const rule of RULE_KEYWORDS) {
    if (rule.keywords.some((k) => m.includes(k))) return { intent: rule.intent, source: "rule" };
  }
  // "trip" is the user-facing word for an itinerary; checked last so "ubah/ganti ... trip" stays a modification.
  // Only an explicit wish creates a trip; questions about it ("berapa lama trip ini?") go to the model.
  const isQuestion = m.endsWith("?") || /\b(berapa|apa|apakah|kapan|mana|gimana|bagaimana|kenapa|mengapa)\b/.test(m);
  if (!isQuestion && /\b(buat|buatkan|bikin|ingin|mau|pengen|rencana|rencanakan|susun|susunkan)\b[^.?!]*\btrip\b/.test(m)) {
    return { intent: "generate_itinerary", source: "rule" };
  }
  return null;
}

function parseClassifierOutput(content: string | null): ClassificationResult | null {
  if (!content) return null;
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return null;
  }
  const parsed = classifierOutputSchema.safeParse(json);
  if (!parsed.success) return null;
  return { intent: parsed.data.intent, confidence: parsed.data.confidence, source: "model" };
}

// shortcut: natural language and ambiguous messages always hit the model; malformed output
// is treated as missing info so a bad classifier never runs a tool or writes a version.
export async function classify(message: string, env: EnvLike = process.env, sessionId?: string | null): Promise<ClassificationResult> {
  const rule = matchRule(message);
  if (rule) return rule;

  let content: string | null;
  let usage: { promptTokens: number; completionTokens: number } | undefined;
  try {
    const config = resolveAiRoleConfig("classifier", env);
    const result = await completeChat({
      role: "classifier",
      config,
      messages: [
        { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
      sessionId: sessionId ?? undefined,
    });
    content = result.content;
    usage = result.usage
      ? { promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens }
      : undefined;
  } catch (err) {
    appendLog(
      "chat",
      { kind: "classifier_error", input: message, error: err instanceof Error ? err.message : String(err) },
      sessionId,
    );
    return { intent: "missing_information", source: "rule" };
  }

  const classified = parseClassifierOutput(content);
  if (!classified || (classified.confidence ?? 0) < MIN_CONFIDENCE) {
    return { intent: "missing_information", source: "rule" };
  }
  return usage ? { ...classified, usage } : classified;
}