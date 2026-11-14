/** Paket yang tersedia untuk pengguna. */
export type UserPlan = "Free" | "Plus";

export interface CurrentUser {
  name: string;
  plan: UserPlan;
  bio: string;
  /** Nama pengguna unik tanpa tanda @; ditampilkan sebagai @username di profil. */
  username: string;
  /** URL foto profil. `null` berarti belum ada foto → tampilkan inisial. */
  avatarUrl: string | null;
}

/** Nilai awal sebelum sesi API selesai dimuat. */
export const DEFAULT_USER: CurrentUser = {
  name: "Nama Pengguna",
  plan: "Free",
  bio: "Rencana perjalanan dan itinerary yang dibuat bareng Lahlah AI.",
  username: "namapengguna_",
  avatarUrl: null,
};

/** Nama plan dari API (`free`, `plus`) menjadi label UI. */
export function toUserPlan(planName: string | null | undefined): UserPlan {
  return planName?.trim().toLowerCase() === "plus" ? "Plus" : "Free";
}

/** Inisial maksimal dua huruf dari nama, dipakai saat foto profil kosong. */
export function getUserInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts.at(0);
  if (!first) return "?";
  const last = parts.at(-1) ?? first;
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}
