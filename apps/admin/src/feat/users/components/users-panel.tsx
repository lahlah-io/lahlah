import { useState } from "react";
import { Pencil, Plus, Trash } from "lucide-react";
import { ApiError } from "@/shared/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { TableCell, TableHead, TableRow } from "@/shared/components/ui/table";
import { DataTable } from "@/shared/components/data/data-table";
import { PageHeader, PaginationControls, SearchBar } from "@/shared/components/data/controls";
import { ConfirmDeleteDialog } from "@/shared/components/data/confirm-dialog";
import { useUsers } from "../hooks/use-users";
import * as usersApi from "../services/users.api";
import type { ManagedUser } from "../types/users";
import { UserDialog, type UserFormValue } from "./user-dialogs";

export function UsersPanel({ currentUserId }: { currentUserId?: string }) {
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "user" | "admin">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const list = useUsers(committed, {
    role: roleFilter === "all" ? undefined : roleFilter,
    isActive: statusFilter === "all" ? undefined : statusFilter === "active",
  });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
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
    : list.items.map((item) => {
        const isSelf = item.id === currentUserId;
        return (
          <TableRow key={item.id}>
            <TableCell>
              <p className="font-medium">{item.name}</p>
              <p className="text-xs text-muted-foreground">@{item.username}</p>
            </TableCell>
            <TableCell className="text-muted-foreground">{item.email ?? "—"}</TableCell>
            <TableCell>
              <Badge variant={item.role === "admin" ? "default" : "secondary"}>{item.role}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant={item.isActive ? "secondary" : "destructive"}>
                {item.isActive ? "Aktif" : "Nonaktif"}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing(item)}>
                  <Pencil />
                  <span className="sr-only">Ubah {item.name}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={isSelf || !item.isActive}
                  title={isSelf ? "Tidak dapat menonaktifkan akun sendiri" : undefined}
                  onClick={() => setDeleting(item)}
                >
                  <Trash />
                  <span className="sr-only">Nonaktifkan {item.name}</span>
                </Button>
              </div>
            </TableCell>
          </TableRow>
        );
      });

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Pengguna"
        description="Kelola akun, role admin, dan status aktif."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus data-icon="inline-start" />
            Tambah
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar value={search} onChange={handleSearch} placeholder="Cari nama, username, email…" />
        <select
          aria-label="Filter role"
          value={roleFilter}
          onChange={(event) => {
            setRoleFilter(event.target.value as typeof roleFilter);
            list.setFirstPage();
          }}
          className="rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium"
        >
          <option value="all">Semua role</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
        <select
          aria-label="Filter status"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as typeof statusFilter);
            list.setFirstPage();
          }}
          className="rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium"
        >
          <option value="all">Semua status</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
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
            <TableHead>Nama</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </>
        }
        rows={rows}
        loading={list.loading}
        error={list.error}
        empty="Ubah kata kunci atau tambah pengguna pertama."
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
        <UserDialog
          key="user-new"
          open
          mode="create"
          title="Tambah pengguna"
          description="Akun dibuat beserta langganan free."
          initial={null}
          pending={mutating}
          onClose={() => setCreating(false)}
          onSubmit={async (value: UserFormValue) => {
            await runMutation(() => usersApi.createUser(value), "Pengguna ditambahkan.");
            setCreating(false);
          }}
        />
      ) : null}
      {editing ? (
        <UserDialog
          key={editing.id}
          open
          mode="edit"
          title={`Ubah ${editing.name}`}
          description="Nama, username, email, role, dan status."
          initial={editing}
          pending={mutating}
          isSelf={editing.id === currentUserId}
          onClose={() => setEditing(null)}
          onSubmit={async (value: UserFormValue) => {
            await runMutation(
              () =>
                (async () => {
                  const updated = await usersApi.updateUser(editing.id, {
                    name: value.name,
                    username: value.username,
                    email: value.email,
                  });
                  if (updated.role !== value.role) {
                    await usersApi.changeUserRole(editing.id, value.role);
                  }
                  if (updated.isActive !== value.isActive) {
                    await usersApi.changeUserStatus(editing.id, value.isActive);
                  }
                })(),
              "Pengguna diperbarui.",
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
          description="Akun dinonaktifkan (soft delete), data tetap ada dan bisa diaktifkan lagi."
          pending={mutating}
          confirmLabel="Nonaktifkan pengguna"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await runMutation(
              () => usersApi.deactivateUser(deleting.id),
              "Pengguna dinonaktifkan.",
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
