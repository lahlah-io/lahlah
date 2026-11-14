import { useEffect } from "react";
import { useAuth } from "@/feat/auth/hooks/use-auth";

/** Gerbang login untuk halaman chat test statis di `/chat-test.html`. */
export function ChatPage() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    window.location.replace(
      `/chat-test.html?userId=${encodeURIComponent(user.id)}`,
    );
  }, [user]);

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">Membuka chat…</p>
    </main>
  );
}
