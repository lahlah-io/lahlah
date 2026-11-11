import { useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
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
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { useAuth } from "../hooks/use-auth";

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

export function LoginCard() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await loginWithToken(token);
      navigate(redirectTarget(location.state), { replace: true });
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
        <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
          <Label htmlFor="session-token">Token sesi</Label>
          <Input
            id="session-token"
            name="token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Tempel token dari dev:session"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            disabled={submitting}
            aria-invalid={error ? true : undefined}
            required
          />
          <Button
            type="submit"
            className="mt-1"
            disabled={submitting || !token.trim()}
          >
            {submitting ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <KeyRound />
            )}
            {submitting ? "Memeriksa…" : "Masuk"}
          </Button>
        </form>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Login gagal</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">
            Membuat token pengembangan
          </p>
          <pre className="overflow-x-auto rounded bg-background p-2 text-[0.7rem]">
            <code>pnpm --filter api dev:session -- --admin</code>
          </pre>
          <p className="mt-2">
            Salin nilai <code>token</code> dari output. Login PeridotID akan
            menggantikan langkah ini setelah <code>PERIDOT_CLIENT_ID</code> asli
            tersedia.
          </p>
          <p className="mt-2">
            API: <code>{apiBaseUrl}</code>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
