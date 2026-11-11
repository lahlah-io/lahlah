import { Navigate } from "react-router";
import { LoginCard } from "@/feat/auth/components/login-card";
import { useAuth } from "@/feat/auth/hooks/use-auth";

export function LoginPage() {
  const { status } = useAuth();

  if (status === "authenticated") return <Navigate to="/" replace />;

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <LoginCard />
    </main>
  );
}
