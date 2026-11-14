import { apiRequest } from "@/shared/api/client";
import type { DataEnvelope, ListEnvelope } from "@/shared/api/types";
import type {
  ManagedUser,
  UserCreateInput,
  UserListParams,
  UserUpdateInput,
} from "../types/users";

function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listUsers(params: UserListParams = {}): Promise<ListEnvelope<ManagedUser>> {
  return apiRequest<ListEnvelope<ManagedUser>>(
    `/api/v1/users${toQuery({
      page: params.page,
      limit: params.limit,
      q: params.q,
      role: params.role,
      isActive: params.isActive === undefined ? undefined : String(params.isActive),
    })}`,
  );
}

export async function createUser(input: UserCreateInput): Promise<ManagedUser> {
  const response = await apiRequest<DataEnvelope<ManagedUser>>("/api/v1/users", {
    method: "POST",
    body: input,
  });
  return response.data;
}

export async function updateUser(id: string, input: UserUpdateInput): Promise<ManagedUser> {
  const response = await apiRequest<DataEnvelope<ManagedUser>>(`/api/v1/users/${id}`, {
    method: "PATCH",
    body: input,
  });
  return response.data;
}

export async function changeUserRole(id: string, role: "user" | "admin"): Promise<ManagedUser> {
  const response = await apiRequest<DataEnvelope<ManagedUser>>(`/api/v1/users/${id}/role`, {
    method: "PATCH",
    body: { role },
  });
  return response.data;
}

export async function changeUserStatus(id: string, isActive: boolean): Promise<ManagedUser> {
  const response = await apiRequest<DataEnvelope<ManagedUser>>(`/api/v1/users/${id}/status`, {
    method: "PATCH",
    body: { isActive },
  });
  return response.data;
}

export async function deactivateUser(id: string): Promise<ManagedUser> {
  const response = await apiRequest<DataEnvelope<ManagedUser>>(`/api/v1/users/${id}`, {
    method: "DELETE",
  });
  return response.data;
}
