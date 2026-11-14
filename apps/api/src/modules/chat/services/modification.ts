import type { ItineraryModification } from "../../../shared/schemas/itinerary-modification.js";
import { ADD_VERB, DESTINATION_NOUN, DISLIKE, REMOVE_VERB, REPLACE_VERB } from "./vocab.js";

export type { ItineraryModification };

const ORDINALS: Record<string, number> = {
  pertama: 1,
  kedua: 2,
  ketiga: 3,
  keempat: 4,
  kelima: 5,
  keenam: 6,
  ketujuh: 7,
  kedelapan: 8,
  kesembilan: 9,
  kesepuluh: 10,
};
const WORD_NUMBERS: Record<string, number> = {
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  delapan: 8,
  sembilan: 9,
  sepuluh: 10,
};
const WORD_ALT = Object.keys(WORD_NUMBERS).join("|");
const SCHEDULE_NOUN = /\b(?:jadwal|jam|waktu|pukul|tanggal|hari|durasi|kategori)\b/i;

function toCount(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = WORD_NUMBERS[raw.toLowerCase()] ?? Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 1-based position as shown to the user. */
function targetPosition(text: string): number | null {
  const digit = /\bke-?\s*(\d{1,2})\b|\bnomor\s*(\d{1,2})\b|\bno\.?\s*(\d{1,2})\b|\bdestinasi\s+(\d{1,2})\b/i.exec(text);
  if (digit) return toCount(digit[1] ?? digit[2] ?? digit[3] ?? digit[4]);
  const ordinal = new RegExp(`\\b(${Object.keys(ORDINALS).join("|")})\\b`, "i").exec(text);
  return ordinal ? ORDINALS[ordinal[1]!.toLowerCase()]! : null;
}

function targetName(text: string): string | undefined {
  const m = new RegExp(`${REPLACE_VERB.source}\\s+(?:destinasi\\s+)?(.+?)\\s+(?:dengan|jadi|menjadi)\\b`, "i").exec(text);
  const name = m?.[1]?.trim();
  if (!name || SCHEDULE_NOUN.test(name)) return undefined;
  return name;
}

function targetRemoveName(text: string): string | undefined {
  const m = new RegExp(`${REMOVE_VERB.source}\\s+${DESTINATION_NOUN.source}\\s+(.+)$`, "i").exec(text);
  const name = m?.[1]?.trim();
  if (!name || /\bterakhir\b/i.test(name)) return undefined;
  return name;
}

/**
 * Parses only destination-scoped modifications. Everything else (time, category,
 * count changes) returns null so the caller keeps its existing trip flow.
 */
export function parseModification(text: string): ItineraryModification | null {
  const position = targetPosition(text);
  const at = position != null ? { targetPosition: position } : {};

  const select = /\b(?:pilih|kembali\s+ke|buka|lihat)\s+versi\s*(\d+)/i.exec(text);
  if (select) return { operation: "select_version", version: Number(select[1]) };

  const replaceVerb = REPLACE_VERB.test(text);
  const scoped = DESTINATION_NOUN.test(text) || position != null;
  if (replaceVerb) {
    const name = at.targetPosition ? undefined : targetName(text);
    // Count/schedule changes ("ubah jadi 3 destinasi", "ubah jadwal jadi sore") yield no target here.
    if (!at.targetPosition && !name) return null;
    return { operation: "replace_destination", ...at, ...(name ? { targetName: name } : {}) };
  }

  const removeVerb = REMOVE_VERB.test(text);
  const last = /\bterakhir\b/i.test(text);
  if (removeVerb && (scoped || last)) {
    const name = !at.targetPosition ? targetRemoveName(text) : undefined;
    if (!at.targetPosition && !last && !name) return null;
    return {
      operation: "remove_destination",
      ...at,
      ...(last ? { targetLast: true } : {}),
      ...(!at.targetPosition && !last && name ? { targetName: name } : {}),
    };
  }

  const add = new RegExp(
    `${ADD_VERB.source}\\s+(?:(\\d{1,2}|${WORD_ALT})\\s*)?${DESTINATION_NOUN.source}`,
    "i",
  ).exec(text);
  if (add) return { operation: "add_destination", quantity: toCount(add[1]) ?? 1 };

  if (DISLIKE.test(text)) return { operation: "clarify_modification", ...at };

  return null;
}
