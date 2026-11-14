import { createContext } from "react";
import type { AppUser, AuthStatus } from "../types/auth";

export type AuthContextValue = {
  status: AuthStatus;
  user: AppUser | null;
  /** Pesan ketika sesi tidak bisa diperiksa, misalnya API sedang mati. */
  error: string | null;
  loginWithPeridot: () => Promise<AppUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<AppUser | null>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
