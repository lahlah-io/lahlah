import type { AIResponseCitation } from "../components/smoothui/ai-response";

export interface SimulatedReply {
  citations: AIResponseCitation[];
  text: string;
}

const TECH_CITATIONS: AIResponseCitation[] = [
  {
    id: "react-docs",
    index: 1,
    title: "Learn React — dokumentasi resmi React",
    url: "https://react.dev/learn",
  },
  {
    id: "shadcn-docs",
    index: 2,
    title: "Dokumentasi shadcn/ui",
    url: "https://ui.shadcn.com/docs",
  },
];

const FALLBACKS: string[] = [
  "Menarik — ini pratinjau frontend, jadi aku menjawab dari skrip simulasi lokal tanpa backend. Kalau pertanyaanmu butuh sumber atau langkah konkret, coba tanyakan soal rencana, ide, atau ringkasan, karena untuk topik itu aku punya jawaban yang lebih rapi.",
  "Siap. Karena ini simulasi antarmuka, jawabanku dibuat di browser: ada jeda berpikir, lalu teks mengalir kata per kata. Ceritakan lebih detail maumu, misalnya tujuan akhirnya apa, supaya contoh jawabanku terasa lebih nyambung.",
  "Oke, aku tangkap maksudmu. Untuk pratinjau ini aku belum terhubung ke model sungguhan, tapi alurnya sudah sama seperti aslinya: pesanmu tersimpan di thread, status berubah dari berpikir ke streaming, lalu jawaban selesai. Mau coba topik yang jawabannya lebih berisi, misalnya minta rencana mingguan?",
];

const PLAN_REPLY =
  "Berikut contoh rencana mingguan yang seimbang: Senin untuk perencanaan dan prioritas, Selasa–Kamis untuk kerja mendalam tanpa rapat, Jumat untuk review dan merapikan backlog, lalu akhir pekan benar-benar libur. Kuncinya adalah satu target utama per hari dan batas waktu yang jelas, supaya minggu terasa maju tanpa lembur.";

const STUDY_REPLY =
  "Cara meringkas yang awet diingat: baca sekali untuk struktur, baca kedua untuk menandai tiga ide utama, lalu tulis ulang dengan kalimatmu sendiri dalam lima baris. Terakhir, buat satu pertanyaan yang belum terjawab dari materi itu — pertanyaan itulah yang menuntun sesi belajarmu berikutnya.";

const IDEA_REPLY =
  "Untuk menyusun ide baru, mulai dari masalah terkecil yang kamu rasakan sendiri, tulis sepuluh variasi solusi tanpa menilai dulu, lalu saring jadi tiga yang paling murah diuji. Uji satu dalam seminggu dengan prototipe kasar — umpan balik dari hal nyata selalu mengalahkan brainstorming berjam-jam.";

const TECH_REPLY =
  "Chat ini dibangun dengan React dan Vite, primitives shadcn/ui untuk gelembung pesan dan scroller, lalu komponen SmoothUI untuk wajah orb, loader, dan teks streaming [1]. Seluruh jawaban di pratinjau ini disimulasikan di frontend: jeda berpikir, token yang mengalir, dan sitasi semuanya berjalan lokal tanpa memanggil API [2].";

function matches(input: string, keywords: string[]): boolean {
  return keywords.some((keyword) => input.includes(keyword));
}

export function pickReply(input: string, rotation: number): SimulatedReply {
  const text = input.toLocaleLowerCase("id");

  if (matches(text, ["teknologi", "dibuat", "stack", "sumber", "referensi", "sitasi"])) {
    return { citations: TECH_CITATIONS, text: TECH_REPLY };
  }
  if (matches(text, ["rencana", "minggu", "jadwal", "plan"])) {
    return { citations: [], text: PLAN_REPLY };
  }
  if (matches(text, ["ringkas", "belajar", "pelajari", "rangkum", "materi"])) {
    return { citations: [], text: STUDY_REPLY };
  }
  if (matches(text, ["ide", "brainstorm", "gagasan", "inspirasi"])) {
    return { citations: [], text: IDEA_REPLY };
  }
  const fallback = FALLBACKS[rotation % FALLBACKS.length] ?? FALLBACKS[0]!;
  return { citations: [], text: fallback };
}
