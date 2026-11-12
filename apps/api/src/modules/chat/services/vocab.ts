// Indonesian destination-modification vocabulary, shared by classifier.ts and
// modification.ts so their word lists never drift. Multi-lang: add an EN word set
// here and thread a locale; not built until a non-id locale exists.

const DESTINATION_WORDS = [
  "tempat wisata", "objek wisata", "daya tarik", // longest first: clean name capture
  "destinasi", "tempat", "lokasi", "spot", "titik",
];
const REPLACE_VERBS = ["ganti", "ubah", "gantikan", "tukar", "tuker", "gantiin", "ubahin"];
const REMOVE_VERBS = ["hapus", "hilangkan", "buang", "hapusin", "hilangin", "buangin", "coret", "singkirkan"];
const ADD_VERBS = ["tambah", "tambahkan", "tambahin", "tambahi"];
const DISLIKE_LEAD = ["tidak", "kurang", "gak", "nggak", "enggak", "ga"];
const DISLIKE_TAIL = ["suka", "cocok", "menarik"];
const DISLIKE_SOLO = ["males", "bosan", "ogah"];

const alt = (words: string[]) => words.join("|");

export const DESTINATION_NOUN_ALT = alt(DESTINATION_WORDS);
export const REPLACE_VERB_ALT = alt(REPLACE_VERBS);
export const REMOVE_VERB_ALT = alt(REMOVE_VERBS);
export const ADD_VERB_ALT = alt(ADD_VERBS);

export const DESTINATION_NOUN = new RegExp(`\\b(?:${DESTINATION_NOUN_ALT})\\b`, "i");
export const REPLACE_VERB = new RegExp(`\\b(?:${REPLACE_VERB_ALT})\\b`, "i");
export const REMOVE_VERB = new RegExp(`\\b(?:${REMOVE_VERB_ALT})\\b`, "i");
export const ADD_VERB = new RegExp(`\\b(?:${ADD_VERB_ALT})\\b`, "i");
export const DISLIKE = new RegExp(
  `\\b(?:${alt(DISLIKE_LEAD)})\\s+(?:${alt(DISLIKE_TAIL)})\\b|\\b(?:${alt(DISLIKE_SOLO)})\\b`,
  "i",
);