import { useState, type FormEvent } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { Input } from "@/shared/components/ui/input";

export function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(value);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onChange(draft);
  }

  return (
    <form className="flex w-full max-w-sm items-center gap-2" onSubmit={submit}>
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder={placeholder}
          value={draft}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            if (next === "") onChange("");
          }}
        />
      </div>
    </form>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-heading text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PaginationControls({
  page,
  limit,
  total,
  loading,
  onPage,
}: {
  page: number;
  limit: number;
  total: number;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex items-center justify-between gap-3 py-3 text-xs text-muted-foreground">
      <p>
        Halaman {page} dari {pages} · {total} data
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
          disabled={loading || page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Sebelumnya
        </button>
        <button
          type="button"
          className="rounded-md border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
          disabled={loading || page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
}

export function SubmitButton({
  pending,
  label,
  pendingLabel,
}: {
  pending: boolean;
  label: string;
  pendingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
      {pending ? pendingLabel : label}
    </button>
  );
}
