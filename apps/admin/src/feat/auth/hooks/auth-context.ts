import { createContext } from "react";
import type { AdminUser, AuthStatus } from "../types/auth";

export type AuthContextValue = {
  status: AuthStatus;
  user: AdminUser | null;
  isAdmin: boolean;
  /** Pesan ketika sesi tidak bisa diperiksa, misalnya API sedang mati. */
  error: string | null;
  loginWithToken: (token: string) => Promise<AdminUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<AdminUser | null>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
