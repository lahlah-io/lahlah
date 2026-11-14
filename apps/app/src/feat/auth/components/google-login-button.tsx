import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { ApiError } from "@/shared/api/client";
import { Button } from "@/shared/components/ui/button";
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

export function GoogleLoginButton() {
  const { loginWithPeridot } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    setSubmitting(true);
    setError(null);
    try {
      await loginWithPeridot();
      navigate(redirectTarget(location.state), { replace: true });
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={() => void handleLogin()}
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
        <p role="alert" className="text-sm text-destructive">
          Login gagal: {error}
        </p>
      ) : null}
    </div>
  );
}
