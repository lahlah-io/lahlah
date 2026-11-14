import { useState } from "react";
import { ApiError } from "@/shared/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";

function describeError(cause: unknown): string {
  if (cause instanceof ApiError) return `${cause.code}: ${cause.message}`;
  if (cause instanceof Error) return cause.message;
  return "Gagal memproses.";
}

export function ConfirmDialog({
  open,
  title,
  description,
  pending,
  confirmLabel,
  pendingLabel,
  errorTitle,
  variant = "destructive",
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  pending: boolean;
  confirmLabel: string;
  pendingLabel?: string;
  errorTitle?: string;
  variant?: "default" | "destructive";
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
            <AlertTitle>{errorTitle ?? "Gagal memproses"}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Batal
          </Button>
          <Button
            type="button"
            variant={variant === "default" ? "default" : "destructive"}
            onClick={() => void handleConfirm()}
            disabled={pending}
          >
            {pending ? (pendingLabel ?? "Memproses…") : confirmLabel}
          </Button>
        </DialogFooter>
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
  return (
    <ConfirmDialog
      open={open}
      title={title}
      description={description}
      pending={pending}
      confirmLabel={confirmLabel}
      pendingLabel="Menghapus…"
      errorTitle="Gagal menghapus"
      variant="destructive"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
