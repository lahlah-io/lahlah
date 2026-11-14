import { UpgradePlan } from "@/feat/settings/components/upgrade-plan";

export function SettingsUpgradePage() {
  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-5 overflow-y-auto px-4 pt-6 pb-24 sm:px-6 md:pb-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Upgrade plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pilih periode tagihan Paket Plus.
        </p>
      </header>
      <UpgradePlan />
    </div>
  );
}
