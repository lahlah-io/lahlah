import { useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useAuth } from "../hooks/use-auth";

/** Identitas sesi aktif beserta tombol keluar untuk halaman terproteksi. */
export function SessionBar() {
  const { user, logout } = useAuth();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await logout();
    } finally {
      setPending(false);
    }
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-3">
      <div>
        <p className="font-heading text-sm font-medium">Lahlah Admin</p>
        <p className="text-xs text-muted-foreground">
          {user?.name}
          {user?.email ? ` · ${user.email}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize">
          {user?.role}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleLogout()}
          disabled={pending}
        >
          {pending ? <LoaderCircle className="animate-spin" /> : <LogOut />}
          Keluar
        </Button>
      </div>
    </header>
  );
}
