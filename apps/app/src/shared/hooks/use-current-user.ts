import { useSyncExternalStore } from "react";

import { CURRENT_USER, type CurrentUser } from "@/shared/types/user";

// penyimpanan sementara di memori; ganti dengan state server saat API profil tersedia
let user = CURRENT_USER;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCurrentUser(): CurrentUser {
  return useSyncExternalStore(subscribe, () => user);
}

export function updateCurrentUser(patch: Partial<CurrentUser>) {
  user = { ...user, ...patch };
  for (const listener of listeners) listener();
}
