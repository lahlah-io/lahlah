import { useState } from "react";
import { useNavigate } from "react-router";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  updateCurrentUser,
  useCurrentUser,
} from "@/shared/hooks/use-current-user";
import { getUserInitials } from "@/shared/types/user";

export function ProfileEditForm() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    updateCurrentUser({
      name: trimmedName,
      bio: bio.trim(),
      avatarUrl: avatarUrl.trim() || null,
    });
    navigate("/profile");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Avatar className="size-20 shrink-0">
          {avatarUrl ? (
            <AvatarImage src={avatarUrl} alt={name || "Foto profil"} />
          ) : null}
          <AvatarFallback className="text-xl font-medium">
            {getUserInitials(name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <label htmlFor="avatarUrl" className="text-sm font-medium">
            URL foto profil
          </label>
          <Input
            id="avatarUrl"
            className="mt-1.5"
            placeholder="https://…"
            inputMode="url"
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
          />
        </div>
      </div>

      <div>
        <label htmlFor="name" className="text-sm font-medium">
          Nama
        </label>
        <Input
          id="name"
          className="mt-1.5"
          autoComplete="name"
          required
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="bio" className="text-sm font-medium">
          Bio
        </label>
        <Textarea
          id="bio"
          className="mt-1.5 min-h-24 resize-none"
          maxLength={160}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {bio.length}/160 karakter
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={() => navigate("/profile")}
        >
          Batal
        </Button>
        <Button type="submit" className="flex-1" disabled={!name.trim()}>
          Simpan
        </Button>
      </div>
    </form>
  );
}
