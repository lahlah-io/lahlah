import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError, setApiSessionToken } from "@/shared/api/client";
import * as authApi from "../services/auth.api";
import { getPeridotClient } from "../services/peridot";
import {
  clearStoredToken,
  readStoredToken,
  storeToken,
} from "../services/session-storage";
import type { AdminUser, AuthStatus } from "../types/auth";
import { AuthContext, type AuthContextValue } from "./auth-context";

type SessionSnapshot = {
  user: AdminUser | null;
  error: string | null;
};

/**
 * Membaca token dari `sessionStorage`, memasangnya pada klien API, lalu
 * memverifikasi ke `GET /auth/me`. Fallback ke cookie `lahlah_session` terjadi
 * otomatis karena request memakai `credentials: "include"`.
 */
async function resolveSession(): Promise<SessionSnapshot> {
  const token = readStoredToken();
  setApiSessionToken(token);

  try {
    return { user: await authApi.fetchCurrentUser(token), error: null };
  } catch (cause) {
    // 401/403 berarti sesinya memang tidak valid. Kegagalan lain (API mati,
    // jaringan) dilaporkan sebagai error agar pengguna bisa mencoba lagi.
    const sessionRejected =
      cause instanceof ApiError &&
      (cause.status === 401 || cause.status === 403);

    clearStoredToken();
    setApiSessionToken(null);

    return {
      user: null,
      error: sessionRejected
        ? null
        : cause instanceof Error
          ? cause.message
          : "Tidak dapat menghubungi API",
    };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void resolveSession().then((snapshot) => {
      if (cancelled) return;
      setUser(snapshot.user);
      setStatus(snapshot.user ? "authenticated" : "anonymous");
      setError(snapshot.error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async (): Promise<AdminUser | null> => {
    const snapshot = await resolveSession();
    setUser(snapshot.user);
    setStatus(snapshot.user ? "authenticated" : "anonymous");
    setError(snapshot.error);
    return snapshot.user;
  }, []);

  const loginWithToken = useCallback(
    async (token: string): Promise<AdminUser> => {
      const trimmed = token.trim();
      if (!trimmed) throw new Error("Token sesi tidak boleh kosong.");

      setApiSessionToken(trimmed);
      try {
        const currentUser = await authApi.fetchCurrentUser(trimmed);
        storeToken(trimmed);
        setUser(currentUser);
        setStatus("authenticated");
        setError(null);
        return currentUser;
      } catch (cause) {
        setApiSessionToken(readStoredToken());
        throw cause;
      }
    },
    [],
  );

  const loginWithPeridot = useCallback(async (): Promise<AdminUser> => {
    const { pidCode } = await getPeridotClient().auth.loginPopup();
    if (!pidCode) throw new Error("Login dibatalkan.");

    const exchanged = await authApi.exchangePidCode(pidCode);
    if (!exchanged.token) throw new Error("Sesi tidak diterbitkan API.");

    setApiSessionToken(exchanged.token);
    try {
      const currentUser = await authApi.fetchCurrentUser(exchanged.token);
      storeToken(exchanged.token);
      setUser(currentUser);
      setStatus("authenticated");
      setError(null);
      return currentUser;
    } catch (cause) {
      setApiSessionToken(readStoredToken());
      throw cause;
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    const token = readStoredToken();
    try {
      await authApi.logoutSession(token);
    } catch {
      // Token bisa saja sudah kedaluwarsa; sesi lokal tetap harus dibersihkan.
    }
    try {
      await getPeridotClient().auth.logout();
    } catch {
      // Sesi PeridotID opsional; sesi Lahlah sudah dicabut di atas.
    }
    clearStoredToken();
    setApiSessionToken(null);
    setUser(null);
    setStatus("anonymous");
    setError(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isAdmin: user?.role === "admin",
      error,
      loginWithToken,
      loginWithPeridot,
      logout,
      refresh,
    }),
    [status, user, error, loginWithToken, loginWithPeridot, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
