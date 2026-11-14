import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { ApiError, apiBaseUrl } from "@/shared/api/client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { useAuth } from "../hooks/use-auth";

/** Formulir token hanya tampil bila eksplisit diizinkan (fallback dev). */
const showDevTokenForm =
  import.meta.env.VITE_ALLOW_DEV_TOKEN?.trim().toLowerCase() === "true";

function describeError(cause: unknown): string {
  if (cause instanceof ApiError) {
    return `${cause.code}: ${cause.message}`;
  }
  if (cause instanceof Error) return cause.message;
  return "Login gagal. Coba lagi.";
}

function redirectTarget(state: unknown): string {
  if (
    state &&
    typeof state === "object" &&
    "from" in state &&
    typeof (state as { from?: unknown }).from === "string"
  ) {
    return (state as { from: string }).from;
  }
  return "/";
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.3h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5 3.8-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.5 1.2-4.1 1.2-3.2 0-5.9-2.1-6.8-5l-.1.1-3.6 2.8v.1C3.5 21.4 7.5 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.5-2.7-.1.1C.6 8.5 0 10.2 0 12s.6 3.5 1.6 5l3.6-2.6Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.7c1.7 0 2.9.7 3.6 1.4l3.1-3.1C16.9 1.1 14.7 0 12 0 7.5 0 3.5 2.6 1.6 6.6l3.6 2.8c.9-2.7 3.6-4.7 6.8-4.7Z"
      />
    </svg>
  );
}

export function LoginCard() {
  const { loginWithPeridot, loginWithToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [devToken, setDevToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function goHome() {
    navigate(redirectTarget(location.state), { replace: true });
  }

  async function handleGoogleLogin() {
    setSubmitting(true);
    setError(null);
    try {
      await loginWithPeridot();
      goHome();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDevSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await loginWithToken(devToken);
      goHome();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Masuk ke dasbor admin</CardTitle>
        <CardDescription>
          Dasbor ini hanya untuk role <code>admin</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => void handleGoogleLogin()}
          disabled={submitting}
        >
          {submitting ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <GoogleMark />
          )}
          {submitting ? "Menghubungkan…" : "Lanjutkan dengan Google"}
        </Button>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Login gagal</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {showDevTokenForm ? (
          <details className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">
              Token pengembangan
            </summary>
            <form
              className="mt-2 flex flex-col gap-2"
              onSubmit={(event) => void handleDevSubmit(event)}
            >
              <input
                name="token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="Tempel token dari dev:session"
                value={devToken}
                onChange={(event) => setDevToken(event.target.value)}
                disabled={submitting}
                aria-invalid={error ? true : undefined}
                required
                className="rounded-md border bg-background px-2 py-1 text-xs"
              />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={submitting || !devToken.trim()}
              >
                Masuk dengan token
              </Button>
            </form>
            <p className="mt-2">
              Buat token:{" "}
              <code className="rounded bg-background px-1">
                pnpm --filter api dev:session -- --admin
              </code>
            </p>
          </details>
        ) : null}

        <p className="text-xs text-muted-foreground">
          API: <code>{apiBaseUrl}</code>
        </p>
      </CardContent>
    </Card>
  );
}
