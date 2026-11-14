import { Check, CircleDashed, LoaderCircle, X } from "lucide-react";

import { cn } from "@/shared/utils/cn";

/**
 * Status satu proses pembuatan trip. API menjawab sekali jadi, jadi yang bisa
 * ditampilkan jujur hanya: sedang diproses, trip tersimpan, belum perlu trip
 * (detail masih kurang), atau gagal.
 */
export type TripTaskState = "running" | "created" | "skipped" | "failed";

export interface TripTaskProps {
  className?: string;
  /** Keterangan tambahan: versi trip, alasan, atau pesan error. */
  detail?: string;
  state: TripTaskState;
}

type Row = {
  icon: "check" | "dot" | "fail" | "pending";
  label: string;
};

function rowsFor(state: TripTaskState, detail?: string): Row[] {
  if (state === "running") {
    return [
      { icon: "check", label: "Pesan diterima" },
      { icon: "pending", label: "Menyusun trip…" },
    ];
  }
  if (state === "created") {
    return [
      { icon: "check", label: "Pesan diterima" },
      { icon: "check", label: "Destinasi & rute disusun" },
      { icon: "check", label: "Versi trip disimpan" },
    ];
  }
  if (state === "failed") {
    return [
      { icon: "check", label: "Pesan diterima" },
      { icon: "fail", label: detail ?? "Gagal menyusun trip" },
    ];
  }
  return [
    { icon: "check", label: "Pesan diterima" },
    { icon: "dot", label: detail ?? "Belum perlu trip" },
  ];
}

function RowIcon({ icon }: { icon: Row["icon"] }) {
  if (icon === "check") {
    return <Check aria-hidden="true" className="size-3.5 text-success" />;
  }
  if (icon === "fail") {
    return <X aria-hidden="true" className="size-3.5 text-destructive" />;
  }
  if (icon === "pending") {
    return (
      <LoaderCircle
        aria-hidden="true"
        className="size-3.5 animate-spin text-muted-foreground"
      />
    );
  }
  return <CircleDashed aria-hidden="true" className="size-3.5 text-muted-foreground" />;
}

/** Daftar langkah pembuatan trip, ditampilkan di atas balasan asisten. */
export function TripTask({ className, detail, state }: TripTaskProps) {
  const rows = rowsFor(state, detail);
  const failed = state === "failed";

  return (
    <div
      aria-live="polite"
      className={cn(
        "w-full max-w-md rounded-xl border bg-card/60 px-3 py-2.5 text-xs shadow-xs",
        failed && "border-destructive/40 bg-destructive/5",
        className,
      )}
      role="status"
    >
      <p className="mb-1.5 flex items-center gap-1.5 font-medium text-muted-foreground">
        {state === "running" ? "Membuat trip" : failed ? "Trip gagal dibuat" : "Status trip"}
      </p>
      <ul className="flex flex-col gap-1">
        {rows.map((row, index) => (
          <li
            className={cn(
              "flex items-center gap-2",
              row.icon === "fail" ? "text-destructive" : "text-foreground",
              row.icon === "dot" && "text-muted-foreground",
            )}
            key={`${row.label}-${index}`}
          >
            <RowIcon icon={row.icon} />
            <span className="truncate">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
