import { useAuth } from "@/feat/auth/hooks/use-auth";
import { SettingsPanel } from "@/feat/settings/components/settings-panel";

export function SettingsPage() {
  const { logout } = useAuth();

  return <SettingsPanel onLogout={logout} />;
}
