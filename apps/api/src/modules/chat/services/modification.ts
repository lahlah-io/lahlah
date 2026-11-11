export type ItineraryModification =
  | {
      operation: "replace_destination";
      targetPosition?: number;
      targetName?: string;
      targetLast?: boolean;
    }
  | {
      operation: "remove_destination";
      targetPosition?: number;
      targetName?: string;
      targetLast?: boolean;
    }
  | { operation: "add_destination"; quantity: number }
  | { operation: "clarify_modification"; targetPosition?: number }
  | { operation: "select_version"; version: number };

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
const DESTINATION_NOUN = /\b(?:destinasi|tempat|lokasi|spot)\b/i;
const DISLIKE = /\b(?:tidak|kurang)\s+(?:suka|cocok)\b/i;

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
  const m = /\b(?:ganti|ubah|gantikan)\s+(?:destinasi\s+)?(.+?)\s+dengan\b/i.exec(text);
  const name = m?.[1]?.trim();
  return name ? name : undefined;
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

  const replaceVerb = /\b(?:ganti|ubah|gantikan)\b/i.test(text);
  const scoped = DESTINATION_NOUN.test(text) || position != null;
  if (replaceVerb && scoped) {
    const name = at.targetPosition ? undefined : targetName(text);
    return { operation: "replace_destination", ...at, ...(name ? { targetName: name } : {}) };
  }

  const removeVerb = /\b(?:hapus|hilangkan|buang)\b/i.test(text);
  const last = /\bterakhir\b/i.test(text);
  if (removeVerb && (scoped || last)) {
    return { operation: "remove_destination", ...at, ...(last ? { targetLast: true } : {}) };
  }

  const add = new RegExp(
    `\\btambah(?:kan)?\\s+(?:(\\d{1,2}|${WORD_ALT})\\s*)?(?:destinasi|tempat|lokasi|spot)\\b`,
    "i",
  ).exec(text);
  if (add) return { operation: "add_destination", quantity: toCount(add[1]) ?? 1 };

  if (DISLIKE.test(text)) return { operation: "clarify_modification", ...at };

  return null;
}
