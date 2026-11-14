import { useState } from "react";
import { Pencil, Plus, Trash } from "lucide-react";
import { ApiError } from "@/shared/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { TableCell, TableHead, TableRow } from "@/shared/components/ui/table";
import { useCategories } from "../hooks/use-catalog";
import * as catalogApi from "../services/catalog.api";
import type { Category } from "../types/catalog";
import { DataTable } from "@/shared/components/data/data-table";
import { PageHeader, PaginationControls, SearchBar } from "@/shared/components/data/controls";
import { ConfirmDeleteDialog } from "@/shared/components/data/confirm-dialog";
import { CategoryDialog, type CategoryFormValue } from "./category-dialogs";

export function CategoriesPanel() {
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const list = useCategories(committed);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [mutating, setMutating] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

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

  const rows = list.loading
    ? null
    : list.items.map((category) => (
        <TableRow key={category.id}>
          <TableCell className="font-medium">{category.name}</TableCell>
          <TableCell>
            <Badge variant="secondary">{category.slug}</Badge>
          </TableCell>
          <TableCell className="text-muted-foreground">
            {new Date(category.updatedAt).toLocaleDateString("id-ID")}
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon-sm" onClick={() => setEditing(category)}>
                <Pencil />
                <span className="sr-only">Ubah {category.name}</span>
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(category)}>
                <Trash />
                <span className="sr-only">Hapus {category.name}</span>
              </Button>
            </div>
          </TableCell>
        </TableRow>
      ));

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Kategori"
        description="Tag destinasi. Hapus kategori hanya melepas tag, destinasi tetap ada."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus data-icon="inline-start" />
            Tambah
          </Button>
        }
      />
      <SearchBar value={search} onChange={handleSearch} placeholder="Cari nama atau slug…" />
      {banner ? (
        <Alert variant={banner.startsWith("Gagal") ? "destructive" : "default"}>
          <AlertDescription>{banner}</AlertDescription>
        </Alert>
      ) : null}
      <DataTable
        head={
          <>
            <TableHead>Nama</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Diubah</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </>
        }
        rows={rows}
        loading={list.loading}
        error={list.error}
        empty="Ubah kata kunci atau tambah kategori pertama."
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
        <CategoryDialog
          key="category-new"
          open
          title="Tambah kategori"
          description="Slug otomatis dari nama bila dikosongkan."
          initial={null}
          pending={mutating}
          onClose={() => setCreating(false)}
          onSubmit={async (value: CategoryFormValue) => {
            await runMutation(() => catalogApi.createCategory(value), "Kategori ditambahkan.");
            setCreating(false);
          }}
        />
      ) : null}
      {editing ? (
        <CategoryDialog
          key={editing.id}
          open
          title={`Ubah ${editing.name}`}
          description="Nama atau slug kategori."
          initial={editing}
          pending={mutating}
          onClose={() => setEditing(null)}
          onSubmit={async (value: CategoryFormValue) => {
            await runMutation(
              () => catalogApi.updateCategory(editing.id, value),
              "Kategori diperbarui.",
            );
            setEditing(null);
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDeleteDialog
          key={deleting.id}
          open
          title={`Hapus ${deleting.name}?`}
          description="Kategori dihapus permanen. Destinasi yang memakai tag ini hanya kehilangan tag."
          pending={mutating}
          confirmLabel="Hapus kategori"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await runMutation(
              () => catalogApi.deleteCategory(deleting.id),
              "Kategori dihapus.",
            );
            setDeleting(null);
          }}
        />
      ) : null}
      {mutating && !creating && !editing && !deleting ? (
        <Alert>
          <AlertTitle>Menyimpan…</AlertTitle>
        </Alert>
      ) : null}
    </section>
  );
}
