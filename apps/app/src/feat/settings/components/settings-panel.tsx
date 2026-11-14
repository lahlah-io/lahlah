import {
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  Crown,
  Globe,
  Moon,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/shared/components/ui/avatar";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Separator } from "@/shared/components/ui/separator";
import { useCurrentUser } from "@/shared/hooks/use-current-user";
import { getUserInitials } from "@/shared/types/user";

function SettingRow({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-2 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {hint ? (
          <span className="block text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </span>
      <span className="shrink-0 text-sm text-muted-foreground">{value}</span>
    </div>
  );
}

export function SettingsPanel() {
  const { name, plan, avatarUrl } = useCurrentUser();
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-5 overflow-y-auto px-4 pt-6 pb-24 sm:px-6 md:pb-10">
      <header>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Kembali"
          className="-ml-2 mb-1"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Pengaturan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kelola akun dan preferensi aplikasi.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Akun</CardTitle>
          <CardDescription>Informasi akun yang sedang aktif.</CardDescription>
          <CardAction>
            <Badge variant={plan === "Plus" ? "default" : "secondary"}>
              {plan}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <Avatar className="size-12">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
              <AvatarFallback className="text-sm font-medium">
                {getUserInitials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{name}</p>
              <p className="text-sm text-muted-foreground">Paket {plan}</p>
            </div>
          </div>
          <Separator />
          <dl className="grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Nama</dt>
              <dd className="truncate font-medium">{name}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Paket</dt>
              <dd className="flex items-center gap-1.5 font-medium">
                {plan}
                <Check aria-hidden="true" className="size-3.5 text-brand" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium">Aktif</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Langganan</CardTitle>
          <CardDescription>
            {plan === "Plus"
              ? "Kamu memakai Paket Plus."
              : "Naik ke Plus untuk semua fitur."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            onClick={() => navigate("/settings/upgrade")}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Crown aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Upgrade plan</span>
              <span className="block text-xs text-muted-foreground">
                {plan === "Plus"
                  ? "Lihat detail Paket Plus"
                  : "Mulai dari Rp15.000/bulan"}
              </span>
            </span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferensi</CardTitle>
          <CardDescription>
            Pengaturan tampilan dan notifikasi. Sebagian akan hadir nanti.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          <SettingRow
            icon={Moon}
            label="Tema"
            value="Gelap"
            hint="Lahlah selalu memakai tema gelap."
          />
          <SettingRow icon={Globe} label="Bahasa" value="Indonesia" />
          <SettingRow
            icon={Bell}
            label="Notifikasi"
            value="Segera hadir"
            hint="Belum tersedia pada versi ini."
          />
        </CardContent>
      </Card>
    </div>
  );
}
