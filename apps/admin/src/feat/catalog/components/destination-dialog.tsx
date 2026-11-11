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
import type { Category, Destination } from "../types/catalog";

export type DestinationFormValue = {
  name: string;
  description: string;
  latitude: string;
  longitude: string;
  address: string;
  imageUrl: string;
  categoryIds: string[];
};

function toForm(initial: Destination | null): DestinationFormValue {
  return {
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    latitude: initial?.latitude ?? "",
    longitude: initial?.longitude ?? "",
    address: initial?.address ?? "",
    imageUrl: initial?.imageUrl ?? "",
    categoryIds: initial?.categories.map((category) => category.id) ?? [],
  };
}

function describeError(cause: unknown): string {
  if (cause instanceof ApiError) return `${cause.code}: ${cause.message}`;
  if (cause instanceof Error) return cause.message;
  return "Gagal menyimpan destinasi.";
}

/** Backend menerima number/string/null; string kosong dikirim sebagai null. */
export function toDestinationPayload(value: DestinationFormValue) {
  return {
    name: value.name.trim(),
    description: value.description.trim() || null,
    latitude: value.latitude.trim() === "" ? null : value.latitude.trim(),
    longitude: value.longitude.trim() === "" ? null : value.longitude.trim(),
    address: value.address.trim() || null,
    imageUrl: value.imageUrl.trim() || null,
    categoryIds: value.categoryIds,
  };
}

export function DestinationDialog({
  open,
  title,
  description,
  initial,
  categories,
  pending,
  submitLabel,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  initial: Destination | null;
  categories: Category[];
  pending: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (value: DestinationFormValue) => Promise<void>;
}) {
  // Sama seperti CategoryDialog: pemanggil me-remount dialog tiap dibuka.
  const [form, setForm] = useState<DestinationFormValue>(() => toForm(initial));
  const [error, setError] = useState<string | null>(null);

  function set<Key extends keyof DestinationFormValue>(key: Key, next: DestinationFormValue[Key]) {
    setForm((current) => ({ ...current, [key]: next }));
  }

  function toggleCategory(id: string) {
    setForm((current) => ({
      ...current,
      categoryIds: current.categoryIds.includes(id)
        ? current.categoryIds.filter((categoryId) => categoryId !== id)
        : [...current.categoryIds, id],
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit(form);
      onClose();
    } catch (cause) {
      setError(describeError(cause));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="destination-name">Nama</Label>
            <Input
              id="destination-name"
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Pantai Padang (Taplau)"
              required
              maxLength={255}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="destination-description">Deskripsi</Label>
            <textarea
              id="destination-description"
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder="Ciri khas, legenda, waktu terbaik berkunjung…"
              rows={3}
              maxLength={5000}
              disabled={pending}
              className="min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring disabled:opacity-50"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="destination-latitude">Latitude</Label>
              <Input
                id="destination-latitude"
                value={form.latitude}
                onChange={(event) => set("latitude", event.target.value)}
                placeholder="-0.9528"
                inputMode="decimal"
                disabled={pending}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="destination-longitude">Longitude</Label>
              <Input
                id="destination-longitude"
                value={form.longitude}
                onChange={(event) => set("longitude", event.target.value)}
                placeholder="100.3525"
                inputMode="decimal"
                disabled={pending}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="destination-address">Alamat</Label>
            <Input
              id="destination-address"
              value={form.address}
              onChange={(event) => set("address", event.target.value)}
              placeholder="Jl. Samudra, Belakang Tangsi, Padang"
              maxLength={255}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="destination-image">URL gambar</Label>
            <Input
              id="destination-image"
              value={form.imageUrl}
              onChange={(event) => set("imageUrl", event.target.value)}
              placeholder="https://…"
              inputMode="url"
              maxLength={2048}
              disabled={pending}
            />
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <Label>Kategori</Label>
            {categories.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Belum ada kategori. Tambah dulu di tab Kategori.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {categories.map((category) => {
                  const active = form.categoryIds.includes(category.id);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      aria-pressed={active}
                      disabled={pending}
                      onClick={() => toggleCategory(category.id)}
                      className={
                        active
                          ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                          : "rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground"
                      }
                    >
                      {category.name}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
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
              disabled={pending || !form.name.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {pending ? "Menyimpan…" : submitLabel}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
