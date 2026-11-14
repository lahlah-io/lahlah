import { useState } from "react";
import { useNavigate } from "react-router";

import { ApiError } from "@/shared/api/client";
import { UserAvatar } from "@/shared/components/user-avatar";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  updateCurrentUser,
  useCurrentUser,
} from "@/shared/hooks/use-current-user";

import { updateMyProfile } from "../services/profile.api";

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

export function ProfileEditForm() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameValid = USERNAME_PATTERN.test(username.trim().toLowerCase());
  const canSave = name.trim().length > 0 && usernameValid && !saving;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;

    setSaving(true);
    setError(null);
    try {
      // Server (Zod) tetap otoritatif; di sini hanya normalisasi bentuk.
      const profile = await updateMyProfile({
        name: name.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim(),
        avatarUrl: avatarUrl.trim(),
      });
      updateCurrentUser({
        name: profile.name,
        username: profile.username,
        bio: profile.bio ?? "",
        avatarUrl: profile.avatarUrl,
      });
      navigate("/profile");
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "Gagal menyimpan profil.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <UserAvatar
          name={name || "Foto profil"}
          seed={username}
          src={avatarUrl || null}
          className="size-20 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <label htmlFor="avatarUrl" className="text-sm font-medium">
            URL foto profil
          </label>
          <Input
            id="avatarUrl"
            className="mt-1.5"
            placeholder="https://… atau /logo-mark.svg"
            inputMode="url"
            maxLength={2048}
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
        <label htmlFor="username" className="text-sm font-medium">
          Username
        </label>
        <Input
          id="username"
          className="mt-1.5"
          autoComplete="username"
          required
          maxLength={30}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          onBlur={() => setUsername((value) => value.trim().toLowerCase())}
          aria-invalid={!usernameValid}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {usernameValid
            ? "Huruf kecil, angka, dan garis bawah (3–30 karakter)."
            : "Username harus 3–30 karakter: huruf kecil, angka, atau garis bawah."}
        </p>
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

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          disabled={saving}
          onClick={() => navigate("/profile")}
        >
          Batal
        </Button>
        <Button type="submit" className="flex-1" disabled={!canSave}>
          {saving ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}
