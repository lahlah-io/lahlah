export type Category = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

export type DestinationCategory = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

export type Destination = {
  id: string;
  name: string;
  description: string | null;
  latitude: string | null;
  longitude: string | null;
  address: string | null;
  source: "geoapify" | "admin" | "user";
  sourcePlaceId: string | null;
  createdBy: string | null;
  isActive: boolean;
  imageUrl: string | null;
  details: Record<string, unknown>;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  categories: DestinationCategory[];
};

export type ListParams = {
  page?: number;
  limit?: number;
  q?: string;
};

export type DestinationListParams = ListParams & {
  isActive?: boolean;
  source?: Destination["source"];
  categoryId?: string;
};

export type CategoryInput = {
  name: string;
  slug?: string;
};

export type DestinationInput = {
  name: string;
  description?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  address?: string | null;
  imageUrl?: string | null;
  details?: Record<string, unknown>;
  categoryIds?: string[];
};

export type DestinationUpdate = Partial<DestinationInput> & {
  isActive?: boolean;
};
