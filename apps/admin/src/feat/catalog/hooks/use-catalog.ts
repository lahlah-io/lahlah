import { useCallback } from "react";
import { usePaginatedList } from "@/shared/hooks/use-paginated-list";
import * as catalogApi from "../services/catalog.api";

const PAGE_SIZE = 20;

export function useCategories(search: string) {
  const query = search.trim();
  const fetcher = useCallback(
    (page: number, limit: number) =>
      catalogApi.listCategories({ page, limit, q: query || undefined }),
    [query],
  );

  return usePaginatedList(fetcher, PAGE_SIZE);
}

export type DestinationFilters = {
  isActive?: boolean;
  source?: "geoapify" | "admin" | "user";
  categoryId?: string;
};

export function useDestinations(search: string, filters: DestinationFilters) {
  const query = search.trim();
  const fetcher = useCallback(
    (page: number, limit: number) =>
      catalogApi.listDestinations({
        page,
        limit,
        q: query || undefined,
        isActive: filters.isActive,
        source: filters.source,
        categoryId: filters.categoryId || undefined,
      }),
    [query, filters.isActive, filters.source, filters.categoryId],
  );

  return usePaginatedList(fetcher, PAGE_SIZE);
}

export function useAllCategories() {
  const fetcher = useCallback(
    () => catalogApi.listCategories({ page: 1, limit: 100 }),
    [],
  );

  return usePaginatedList(fetcher, 100);
}
