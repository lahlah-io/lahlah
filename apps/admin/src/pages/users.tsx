import { useAuth } from "@/feat/auth/hooks/use-auth";
import { UsersPanel } from "@/feat/users/components/users-panel";

export function UsersPage() {
  const { user } = useAuth();
  return <UsersPanel currentUserId={user?.id} />;
}
