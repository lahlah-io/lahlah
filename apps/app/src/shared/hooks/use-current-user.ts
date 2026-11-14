import { useSyncExternalStore } from "react";

import { DEFAULT_USER, type CurrentUser } from "@/shared/types/user";

// Salinan profil dari `GET /api/v1/auth/me` (nama, username, bio, foto).
// `PATCH /api/v1/users/me` menulis balik hasilnya lewat `updateCurrentUser`.
let user: CurrentUser = DEFAULT_USER;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

export function useCurrentUser(): CurrentUser {
  return useSyncExternalStore(subscribe, () => user);
}

export function updateCurrentUser(patch: Partial<CurrentUser>) {
  user = { ...user, ...patch };
  emit();
}

/** Kembali ke nilai awal saat sesi berakhir. */
export function resetCurrentUser() {
  user = DEFAULT_USER;
  emit();
}
