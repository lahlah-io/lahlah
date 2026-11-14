import { useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";

export type HomeUser = {
  name: string;
};

export function HomeIntro({
  user,
  onLogout,
}: {
  user: HomeUser | null;
  onLogout: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await onLogout();
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Aplikasi Lahlah</CardTitle>
        <CardDescription>
          {user ? `Halo, ${user.name}.` : "Selamat datang di Lahlah."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p>Ruang aplikasi sedang disiapkan.</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleLogout()}
          disabled={pending}
        >
          {pending ? <LoaderCircle className="animate-spin" /> : <LogOut />}
          Keluar
        </Button>
      </CardContent>
    </Card>
  );
}
