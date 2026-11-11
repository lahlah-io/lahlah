import { ProfileHeader } from "@/feat/profile/components/profile-header";
import { ProfileTabs } from "@/feat/profile/components/profile-tabs";

export function ProfilePage() {
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-y-auto pb-24 md:pb-10">
      <ProfileHeader />
      <ProfileTabs />
    </div>
  );
}
