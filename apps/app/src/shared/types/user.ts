/** Paket yang tersedia untuk pengguna. */
export type UserPlan = "Free" | "Plus";

export interface CurrentUser {
  name: string;
  plan: UserPlan;
  /** URL foto profil. `null` berarti belum ada foto → tampilkan inisial. */
  avatarUrl: string | null;
}

/** Data pengguna sementara sampai autentikasi tersedia. */
export const CURRENT_USER: CurrentUser = {
  name: "Nama Pengguna",
  plan: "Plus",
  avatarUrl: null,
};

/** Inisial maksimal dua huruf dari nama, dipakai saat foto profil kosong. */
export function getUserInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts.at(0);
  if (!first) return "?";
  const last = parts.at(-1) ?? first;
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}
