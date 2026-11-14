import type { ReactNode } from "react";
import { LoaderCircle, RefreshCw, ServerOff } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router";
import { apiBaseUrl } from "@/shared/api/client";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { useAuth } from "../hooks/use-auth";

function CenteredPanel({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {icon}
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {children ? <CardContent>{children}</CardContent> : null}
      </Card>
    </main>
  );
}

/** Hanya sesi login; anonim dialihkan ke /login. */
export function RequireAuth() {
  const { status, error, refresh } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <CenteredPanel
        icon={<LoaderCircle className="size-4 animate-spin" />}
        title="Memeriksa sesi"
        description="Menghubungi API Lahlah…"
      />
    );
  }

  if (status === "anonymous") {
    if (error) {
      return (
        <CenteredPanel
          icon={<ServerOff className="size-4" />}
          title="API tidak dapat dihubungi"
          description={error}
        >
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Pastikan API berjalan di{" "}
              <code className="rounded bg-muted px-1 py-0.5">{apiBaseUrl}</code>{" "}
              lalu coba lagi.
            </p>
            <Button variant="outline" onClick={() => void refresh()}>
              <RefreshCw />
              Coba lagi
            </Button>
          </div>
        </CenteredPanel>
      );
    }

    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <Outlet />;
}
