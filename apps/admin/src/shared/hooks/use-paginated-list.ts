import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/shared/api/client";
import type { PageMeta } from "@/shared/api/types";

type ListResult<T> = {
  items: T[];
  meta: PageMeta;
  page: number;
  loading: boolean;
  error: string | null;
  setPage: (page: number) => void;
  setFirstPage: () => void;
  reload: () => void;
};

function describeError(cause: unknown): string {
  if (cause instanceof ApiError) return `${cause.code}: ${cause.message}`;
  if (cause instanceof Error) return cause.message;
  return "Gagal memuat data.";
}

/**
 * Daftar halaman generik. Halaman dimiliki hook ini; semua pemicu fetch
 * (`setPage`, `setFirstPage`, `reload`) menandai loading dari event handler,
 * effect hanya menjalankan fetch dan menulis hasil. Request basi diabaikan.
 */
export function usePaginatedList<T>(
  fetcher: (page: number, limit: number) => Promise<{ data: T[]; meta: PageMeta }>,
  limit: number,
): ListResult<T> {
  const [page, setPageState] = useState(1);
  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState<PageMeta>({ page: 1, limit, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const current = ++requestId.current;

    fetcher(page, limit).then(
      (result) => {
        if (requestId.current !== current) return;
        setItems(result.data);
        setMeta(result.meta);
        setLoading(false);
      },
      (cause: unknown) => {
        if (requestId.current !== current) return;
        setError(describeError(cause));
        setLoading(false);
      },
    );
  }, [fetcher, page, limit, nonce]);

  const gotoPage = useCallback((next: number) => {
    setLoading(true);
    setError(null);
    setPageState(next);
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setNonce((value) => value + 1);
  }, []);

  const setFirstPage = useCallback(() => {
    setLoading(true);
    setError(null);
    setPageState(1);
    setNonce((value) => value + 1);
  }, []);

  return { items, meta, page, loading, error, setPage: gotoPage, setFirstPage, reload };
}
