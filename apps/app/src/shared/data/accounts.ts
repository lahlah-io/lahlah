import type { CurrentUser } from "@/shared/types/user";

/** Akun publik yang bisa dibuka dari feed, terpisah dari pengguna aktif. */
export type Account = CurrentUser & { id: string };

export const ACCOUNT: Account = {
  id: "lahlah-ai",
  name: "Lahlah AI",
  plan: "Free",
  bio: "Bikin itinerary otomatis dari obrolan, lengkap dengan rute dan checkpoint.",
  username: "lahlah_ai",
  avatarUrl: "/logo-mark.svg",
};

export function getAccount(id: string): Account | null {
  return ACCOUNT.id === id ? ACCOUNT : null;
}
