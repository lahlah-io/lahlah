import { z } from "zod";
import { completeChat, resolveAiRoleConfig } from "../../../integrations/ai/chat-completions.js";

export const intentLabels = [
  "general_chat",
  "generate_itinerary",
  "modify_itinerary",
  "regenerate_itinerary",
  "confirm_itinerary",
  "missing_information",
] as const;

export type Intent = (typeof intentLabels)[number];

export type ClassificationResult = {
  intent: Intent;
  confidence?: number;
  source: "rule" | "model";
};

type EnvLike = Record<string, string | undefined>;

const MIN_CONFIDENCE = 0.7;

const classifierOutputSchema = z.object({
  intent: z.enum(intentLabels),
  confidence: z.number().min(0).max(1),
});

export const CLASSIFIER_SYSTEM_PROMPT =
  'Classify the user message into exactly one intent. Respond with ONLY a JSON object in the form {"intent":"<label>","confidence":<0..1>}. Labels: general_chat, generate_itinerary, modify_itinerary, regenerate_itinerary, confirm_itinerary, missing_information.';

const GREETINGS = ["halo", "hai", "hi", "hello", "assalamualaikum", "selamat pagi", "selamat siang", "selamat sore", "selamat malam"];

// Narrow keyword rules only for risk-free explicit commands; everything else goes to the model.
const RULE_KEYWORDS: Array<{ intent: Intent; keywords: string[] }> = [
  { intent: "regenerate_itinerary", keywords: ["buat ulang", "generate ulang", "regenerate", "ulangi", "acak ulang"] },
  { intent: "modify_itinerary", keywords: ["ubah", "ganti", "modifikasi"] },
  {
    intent: "generate_itinerary",
    keywords: ["buat itinerary", "buatkan itinerary", "buat jadwal", "buatkan jadwal", "buat rencana", "rencanakan", "generate itinerary", "bikin itinerary", "bikin jadwal"],
  },
  { intent: "confirm_itinerary", keywords: ["konfirmasi", "confirm", "setuju"] },
];

function matchRule(message: string): ClassificationResult | null {
  const m = message.trim().toLowerCase();
  if (!m) return null;
  if (GREETINGS.some((g) => m.startsWith(g) && !/[a-z0-9]/.test(m[g.length] ?? ""))) {
    return { intent: "general_chat", source: "rule" };
  }
  for (const rule of RULE_KEYWORDS) {
    if (rule.keywords.some((k) => m.includes(k))) return { intent: rule.intent, source: "rule" };
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
// is treated as missing info so a bad classifier never runs a tool or writes a draft.
export async function classify(message: string, env: EnvLike = process.env): Promise<ClassificationResult> {
  const rule = matchRule(message);
  if (rule) return rule;

  let content: string | null;
  try {
    const config = resolveAiRoleConfig("classifier", env);
    const result = await completeChat({
      role: "classifier",
      config,
      messages: [
        { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
    });
    content = result.content;
  } catch {
    return { intent: "missing_information", source: "rule" };
  }

  const classified = parseClassifierOutput(content);
  if (!classified || (classified.confidence ?? 0) < MIN_CONFIDENCE) {
    return { intent: "missing_information", source: "rule" };
  }
  return classified;
}