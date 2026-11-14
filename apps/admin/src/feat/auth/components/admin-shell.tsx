import { useState } from "react";
import { Boxes, LayoutDashboard, LogOut, MapPin, Menu, Moon, Sun, Tags, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { useAuth } from "../hooks/use-auth";
import { useTheme } from "@/shared/hooks/use-theme";
import { ConfirmDialog } from "@/shared/components/data/confirm-dialog";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/utils/cn";

type NavItem = {
  to: string;
  label: string;
  Icon: LucideIcon;
  end?: boolean;
};

const NAV: NavItem[] = [
  { to: "/", end: true, label: "Dasbor", Icon: LayoutDashboard },
  { to: "/destinations", label: "Destinasi", Icon: MapPin },
  { to: "/categories", label: "Kategori", Icon: Tags },
  { to: "/users", label: "Pengguna", Icon: Users },
];

function navClass(active: boolean): string {
  return cn(
    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
    active
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

export function AdminShell() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      setConfirmLogout(false);
    } finally {
      setLoggingOut(false);
    }
  }

  const links = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map(({ to, end, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setOpen(false)}
          className={({ isActive }) => navClass(isActive)}
        >
          <Icon data-icon="inline-start" />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card lg:flex">
        <div className="flex items-center gap-2 border-b px-4 py-4">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Boxes data-icon="inline-start" />
          </span>
          <div>
            <p className="font-heading text-sm font-semibold">Lahlah Admin</p>
            <p className="text-xs text-muted-foreground">
              {user?.name}
              {user?.email ? ` · ${user.email}` : ""}
            </p>
          </div>
        </div>
        <div className="flex-1">{links}</div>
        <div className="border-t p-3">
          <Button variant="outline" size="sm" className="w-full" onClick={toggleTheme}>
            {theme === "dark" ? <Sun data-icon="inline-start" /> : <Moon data-icon="inline-start" />}
            {theme === "dark" ? "Mode terang" : "Mode gelap"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full"
            onClick={() => setConfirmLogout(true)}
            disabled={loggingOut}
          >
            <LogOut data-icon="inline-start" />
            {loggingOut ? "Keluar…" : "Keluar"}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b bg-card px-4 py-3 lg:hidden">
          <p className="font-heading text-sm font-semibold">Lahlah Admin</p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={toggleTheme}>
              {theme === "dark" ? <Sun /> : <Moon />}
              <span className="sr-only">Ganti tema</span>
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen((value) => !value)}>
              {open ? <X /> : <Menu />}
              <span className="sr-only">Menu navigasi</span>
            </Button>
          </div>
        </header>
        {open ? <div className="border-b bg-card lg:hidden">{links}</div> : null}
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
      {confirmLogout ? (
        <ConfirmDialog
          open
          title="Keluar dari admin?"
          description="Sesi Anda akan diakhiri dan perlu login lagi untuk masuk."
          pending={loggingOut}
          confirmLabel="Ya, keluar"
          pendingLabel="Keluar…"
          errorTitle="Gagal keluar"
          variant="default"
          onClose={() => setConfirmLogout(false)}
          onConfirm={handleLogout}
        />
      ) : null}
    </div>
  );
}
