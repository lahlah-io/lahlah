import { useCallback } from "react";
import { usePaginatedList } from "@/shared/hooks/use-paginated-list";
import * as usersApi from "../services/users.api";

const PAGE_SIZE = 20;

export type UserFilters = {
  role?: "user" | "admin";
  isActive?: boolean;
};

export function useUsers(search: string, filters: UserFilters) {
  const query = search.trim();
  const fetcher = useCallback(
    (page: number, limit: number) =>
      usersApi.listUsers({
        page,
        limit,
        q: query || undefined,
        role: filters.role,
        isActive: filters.isActive,
      }),
    [query, filters.role, filters.isActive],
  );

  return usePaginatedList(fetcher, PAGE_SIZE);
}
