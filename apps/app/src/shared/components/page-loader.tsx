import { LoaderCircle } from "lucide-react";

/** Status layar penuh saat data halaman sedang diambil. */
export function PageLoader({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        {label}
      </p>
    </div>
  );
}
