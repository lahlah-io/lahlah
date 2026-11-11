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
import type { Category } from "../types/catalog";

export type CategoryFormValue = {
  name: string;
  slug?: string;
};

function describeError(cause: unknown): string {
  if (cause instanceof ApiError) return `${cause.code}: ${cause.message}`;
  if (cause instanceof Error) return cause.message;
  return "Gagal menyimpan kategori.";
}

export function CategoryDialog({
  open,
  title,
  description,
  initial,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  initial: Category | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (value: CategoryFormValue) => Promise<void>;
}) {
  // Dialog di-remount setiap dibuka (pemanggil render kondisional + `key`),
  // jadi state cukup diinisialisasi dari `initial` tanpa effect.
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const trimmedSlug = slug.trim();
      await onSubmit({
        name: name.trim(),
        ...(trimmedSlug ? { slug: trimmedSlug } : {}),
      });
      onClose();
    } catch (cause) {
      setError(describeError(cause));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category-name">Nama</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Pantai"
              required
              maxLength={255}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category-slug">Slug (opsional)</Label>
            <Input
              id="category-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="Otomatis dari nama bila kosong"
              maxLength={255}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              Huruf kecil, angka, tanda hubung. Contoh: wisata-bahari.
            </p>
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
              disabled={pending || !name.trim()}
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

export function ConfirmDeleteDialog({
  open,
  title,
  description,
  pending,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  pending: boolean;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (cause) {
      setError(describeError(cause));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Gagal menghapus</AlertTitle>
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
            type="button"
            onClick={() => void handleConfirm()}
            disabled={pending}
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Menghapus…" : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
