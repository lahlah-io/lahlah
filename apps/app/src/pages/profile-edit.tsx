import { ProfileEditForm } from "@/feat/profile/components/profile-edit-form";

export function ProfileEditPage() {
  return (
    <div className="h-full w-full overflow-y-auto pb-24 md:pb-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-6 sm:px-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Edit profil</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Perbarui nama, bio, dan foto profil.
          </p>
        </header>
        <ProfileEditForm />
      </div>
    </div>
  );
}
