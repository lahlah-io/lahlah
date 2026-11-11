import { apiRequest } from "@/shared/api/client";
import type { DataEnvelope, ListEnvelope } from "@/shared/api/types";
import type {
  Category,
  CategoryInput,
  Destination,
  DestinationInput,
  DestinationListParams,
  DestinationUpdate,
  ListParams,
} from "../types/catalog";

function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listCategories(params: ListParams = {}): Promise<ListEnvelope<Category>> {
  return apiRequest<ListEnvelope<Category>>(
    `/api/v1/categories${toQuery({ page: params.page, limit: params.limit, q: params.q })}`,
  );
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  const response = await apiRequest<DataEnvelope<Category>>("/api/v1/categories", {
    method: "POST",
    body: input,
  });
  return response.data;
}

export async function updateCategory(id: string, input: CategoryInput): Promise<Category> {
  const response = await apiRequest<DataEnvelope<Category>>(`/api/v1/categories/${id}`, {
    method: "PATCH",
    body: input,
  });
  return response.data;
}

export async function deleteCategory(id: string): Promise<{ id: string }> {
  const response = await apiRequest<DataEnvelope<{ id: string }>>(`/api/v1/categories/${id}`, {
    method: "DELETE",
  });
  return response.data;
}

export async function listDestinations(
  params: DestinationListParams = {},
): Promise<ListEnvelope<Destination>> {
  return apiRequest<ListEnvelope<Destination>>(
    `/api/v1/destinations${toQuery({
      page: params.page,
      limit: params.limit,
      q: params.q,
      isActive: params.isActive === undefined ? undefined : String(params.isActive),
      source: params.source,
      categoryId: params.categoryId,
    })}`,
  );
}

export async function createDestination(input: DestinationInput): Promise<Destination> {
  const response = await apiRequest<DataEnvelope<Destination>>("/api/v1/destinations", {
    method: "POST",
    body: input,
  });
  return response.data;
}

export async function updateDestination(id: string, input: DestinationUpdate): Promise<Destination> {
  const response = await apiRequest<DataEnvelope<Destination>>(`/api/v1/destinations/${id}`, {
    method: "PATCH",
    body: input,
  });
  return response.data;
}

export async function deleteDestination(id: string): Promise<Destination> {
  const response = await apiRequest<DataEnvelope<Destination>>(`/api/v1/destinations/${id}`, {
    method: "DELETE",
  });
  return response.data;
}
