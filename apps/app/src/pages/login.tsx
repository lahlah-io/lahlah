import { Navigate } from "react-router";
import { GoogleLoginButton } from "@/feat/auth/components/google-login-button";
import { useAuth } from "@/feat/auth/hooks/use-auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";

export function LoginPage() {
  const { status } = useAuth();

  if (status === "authenticated") return <Navigate to="/chat" replace />;

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Masuk ke Lahlah</CardTitle>
          <CardDescription>
            Masuk dengan akun Google untuk melanjutkan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GoogleLoginButton />
        </CardContent>
      </Card>
    </main>
  );
}
