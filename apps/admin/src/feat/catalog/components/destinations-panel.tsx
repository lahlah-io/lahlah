import { useMemo, useState } from "react";
import { Pencil, Plus, RotateCcw, Trash } from "lucide-react";
import { ApiError } from "@/shared/api/client";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { TableCell, TableHead, TableRow } from "@/shared/components/ui/table";
import { useAllCategories, useDestinations } from "../hooks/use-catalog";
import * as catalogApi from "../services/catalog.api";
import type { Destination } from "../types/catalog";
import { DestinationDialog, toDestinationPayload } from "./destination-dialog";
import { DataTable } from "@/shared/components/data/data-table";
import { PageHeader, PaginationControls, SearchBar } from "@/shared/components/data/controls";
import { ConfirmDeleteDialog } from "@/shared/components/data/confirm-dialog";

function mapUrl(destination: Destination): string | null {
  if (!destination.latitude || !destination.longitude) return null;
  return `https://www.google.com/maps/search/?api=1&query=${destination.latitude},${destination.longitude}`;
}

export function DestinationsPanel() {
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const categories = useAllCategories();

  const list = useDestinations(committed, {
    isActive: statusFilter === "all" ? undefined : statusFilter === "active",
    categoryId: categoryFilter || undefined,
  });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Destination | null>(null);
  const [deleting, setDeleting] = useState<Destination | null>(null);
  const [mutating, setMutating] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const categoryOptions = useMemo(() => categories.items, [categories.items]);

  async function runMutation(task: () => Promise<unknown>, success: string) {
    setMutating(true);
    setBanner(null);
    try {
      await task();
      setBanner(success);
      list.reload();
    } catch (cause) {
      setBanner(
        cause instanceof ApiError
          ? `Gagal: ${cause.code} — ${cause.message}`
          : "Gagal menyimpan perubahan.",
      );
    } finally {
      setMutating(false);
    }
  }

  function handleSearch(value: string) {
    setSearch(value);
    setCommitted(value.trim());
    list.setFirstPage();
  }

  function handleStatus(value: "all" | "active" | "inactive") {
    setStatusFilter(value);
    list.setFirstPage();
  }

  function handleCategory(value: string) {
    setCategoryFilter(value);
    list.setFirstPage();
  }

  const rows = list.loading
    ? null
    : list.items.map((destination) => {
        const url = mapUrl(destination);
        return (
          <TableRow
            key={destination.id}
            className={url ? "cursor-pointer" : undefined}
            tabIndex={url ? 0 : undefined}
            title={url ? "Buka di peta" : undefined}
            onClick={() => {
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            }}
            onKeyDown={(event) => {
              if (url && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                window.open(url, "_blank", "noopener,noreferrer");
              }
            }}
          >
            <TableCell>
              <p className="font-medium">
                {url ? (
                  <span className="underline-offset-4 hover:underline">{destination.name}</span>
                ) : (
                  destination.name
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {[destination.latitude, destination.longitude].filter(Boolean).join(", ") ||
                  "Koordinat belum diisi"}
              </p>
            </TableCell>
          <TableCell>
            <div className="flex max-w-56 flex-wrap gap-1">
              {destination.categories.length === 0 ? (
                <span className="text-xs text-muted-foreground">Tanpa tag</span>
              ) : (
                destination.categories.map((category) => (
                  <Badge key={category.id} variant="secondary">
                    {category.name}
                  </Badge>
                ))
              )}
            </div>
          </TableCell>
          <TableCell>
            <Badge variant={destination.isActive ? "default" : "destructive"}>
              {destination.isActive ? "Aktif" : "Nonaktif"}
            </Badge>
          </TableCell>
          <TableCell className="text-right">
            <div
              className="flex justify-end gap-1"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              role="presentation"
            >
              <Button variant="ghost" size="icon-sm" onClick={() => setEditing(destination)}>
                <Pencil />
                <span className="sr-only">Ubah {destination.name}</span>
              </Button>
              {destination.isActive ? (
                <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(destination)}>
                  <Trash />
                  <span className="sr-only">Nonaktifkan {destination.name}</span>
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={mutating}
                  onClick={() =>
                    void runMutation(
                      () => catalogApi.updateDestination(destination.id, { isActive: true }),
                      `${destination.name} diaktifkan kembali.`,
                    )
                  }
                >
                  <RotateCcw />
                  <span className="sr-only">Aktifkan {destination.name}</span>
                </Button>
              )}
            </div>
          </TableCell>
        </TableRow>
        );
      });

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Destinasi"
        description="Katalog wisata. Klik baris untuk buka peta. Hapus bersifat soft delete — aktifkan kembali kapan saja."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus data-icon="inline-start" />
            Tambah
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar value={search} onChange={handleSearch} placeholder="Cari nama atau alamat…" />
        <select
          aria-label="Filter status"
          value={statusFilter}
          onChange={(event) =>
            handleStatus(event.target.value as "all" | "active" | "inactive")
          }
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          <option value="all">Semua status</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </select>
        <select
          aria-label="Filter kategori"
          value={categoryFilter}
          onChange={(event) => handleCategory(event.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          <option value="">Semua kategori</option>
          {categoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      {banner ? (
        <Alert variant={banner.startsWith("Gagal") ? "destructive" : "default"}>
          <AlertDescription>{banner}</AlertDescription>
        </Alert>
      ) : null}
      <DataTable
        head={
          <>
            <TableHead>Destinasi</TableHead>
            <TableHead>Kategori</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </>
        }
        rows={rows}
        loading={list.loading}
        error={list.error}
        empty="Ubah kata kunci atau filter, atau tambah destinasi pertama."
        onRetry={list.reload}
      />
      <PaginationControls
        page={list.meta.page}
        limit={list.meta.limit}
        total={list.meta.total}
        loading={list.loading}
        onPage={list.setPage}
      />

      {creating ? (
        <DestinationDialog
          key="destination-new"
          open
          title="Tambah destinasi"
          description="Disimpan dengan source admin. Koordinat dinormalisasi 7 desimal."
          initial={null}
          categories={categoryOptions}
          pending={mutating}
          submitLabel="Tambah"
          onClose={() => setCreating(false)}
          onSubmit={async (value) => {
            await runMutation(
              () => catalogApi.createDestination(toDestinationPayload(value)),
              "Destinasi ditambahkan.",
            );
            setCreating(false);
          }}
        />
      ) : null}
      {editing ? (
        <DestinationDialog
          key={editing.id}
          open
          title={`Ubah ${editing.name}`}
          description="CategoryIds mengganti seluruh tag. Kosongkan semua untuk melepas tag."
          initial={editing}
          categories={categoryOptions}
          pending={mutating}
          submitLabel="Simpan"
          onClose={() => setEditing(null)}
          onSubmit={async (value) => {
            await runMutation(
              () => catalogApi.updateDestination(editing.id, toDestinationPayload(value)),
              "Destinasi diperbarui.",
            );
            setEditing(null);
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDeleteDialog
          key={deleting.id}
          open
          title={`Nonaktifkan ${deleting.name}?`}
          description="Soft delete: isActive menjadi false. Data dan tag tetap tersimpan dan bisa diaktifkan lagi dari tabel."
          pending={mutating}
          confirmLabel="Nonaktifkan"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await runMutation(
              () => catalogApi.deleteDestination(deleting.id),
              "Destinasi dinonaktifkan.",
            );
            setDeleting(null);
          }}
        />
      ) : null}
    </section>
  );
}
