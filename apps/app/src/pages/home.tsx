import { HomeIntro } from "@/feat/home/components/home-intro";
import { useAuth } from "@/feat/auth/hooks/use-auth";

export function HomePage() {
  const { user, logout } = useAuth();

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <HomeIntro user={user} onLogout={logout} />
    </main>
  );
}
