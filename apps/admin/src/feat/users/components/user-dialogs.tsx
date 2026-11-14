import { useState, type FormEvent } from "react";
import { ApiError } from "@/shared/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import type { ManagedUser } from "../types/users";

export type UserFormValue = {
  name: string;
  username: string;
  email: string;
  role: "user" | "admin";
  isActive: boolean;
};

function describeError(cause: unknown): string {
  if (cause instanceof ApiError) return `${cause.code}: ${cause.message}`;
  if (cause instanceof Error) return cause.message;
  return "Gagal menyimpan pengguna.";
}

export function UserDialog({
  open,
  mode,
  title,
  description,
  initial,
  pending,
  isSelf,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  title: string;
  description: string;
  initial: ManagedUser | null;
  pending: boolean;
  isSelf?: boolean;
  onClose: () => void;
  onSubmit: (value: UserFormValue) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [role, setRole] = useState<"user" | "admin">(initial?.role ?? "user");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim(),
        role,
        isActive,
      });
      onClose();
    } catch (cause) {
      setError(describeError(cause));
    }
  }

  const roleLocked = isSelf === true;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-name">Nama</Label>
            <Input
              id="user-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nama lengkap"
              required
              maxLength={255}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-username">Username</Label>
            <Input
              id="user-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="huruf kecil, angka, garis bawah"
              required
              minLength={3}
              maxLength={30}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nama@example.com"
              required
              maxLength={255}
              disabled={pending}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="user-role">Role</Label>
              <select
                id="user-role"
                value={role}
                onChange={(event) => setRole(event.target.value as "user" | "admin")}
                disabled={pending || roleLocked}
                className="rounded-md border bg-background px-2.5 py-1.5 text-sm"
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
              {roleLocked ? (
                <p className="text-xs text-muted-foreground">Role sendiri tidak dapat diubah.</p>
              ) : null}
            </div>
            {mode === "edit" ? (
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="user-status">Status</Label>
                <select
                  id="user-status"
                  value={isActive ? "active" : "inactive"}
                  onChange={(event) => setIsActive(event.target.value === "active")}
                  disabled={pending || isSelf === true}
                  className="rounded-md border bg-background px-2.5 py-1.5 text-sm"
                >
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </select>
              </div>
            ) : null}
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Gagal menyimpan</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={pending || !name.trim() || !username.trim() || !email.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {pending ? "Menyimpan…" : "Simpan"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
