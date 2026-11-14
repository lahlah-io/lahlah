import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Button } from "@/shared/components/ui/button";

export function DataTable({
  head,
  rows,
  loading,
  error,
  empty,
  onRetry,
}: {
  head: ReactNode;
  rows: ReactNode;
  loading: boolean;
  error: string | null;
  empty: string;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-xl border bg-card p-6">
        <p className="text-sm font-medium">Gagal memuat data</p>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Coba lagi
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>{head}</TableRow>
        </TableHeader>
        <TableBody>{rows}</TableBody>
      </Table>
      {rows === null || (Array.isArray(rows) && rows.length === 0) ? (
        <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
          <Inbox className="mb-1 text-muted-foreground" />
          <p className="text-sm font-medium">Belum ada data</p>
          <p className="text-xs text-muted-foreground">{empty}</p>
        </div>
      ) : null}
    </div>
  );
}

export function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan}>
        <div className="flex flex-col items-center gap-1 py-8 text-center">
          <Inbox className="mb-1 text-muted-foreground" />
          <p className="text-sm font-medium">Belum ada data</p>
          <p className="text-xs text-muted-foreground">{message}</p>
        </div>
      </TableCell>
    </TableRow>
  );
}
