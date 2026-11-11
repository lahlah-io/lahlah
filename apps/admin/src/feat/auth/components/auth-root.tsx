import { Outlet } from "react-router";
import { AuthProvider } from "../hooks/auth-provider";

/** Root route: menyediakan sesi untuk seluruh halaman di bawahnya. */
export function AuthRoot() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
