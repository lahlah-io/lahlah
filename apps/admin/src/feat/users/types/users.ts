export type ManagedUser = {
  id: string;
  pid: string;
  name: string;
  username: string;
  email: string | null;
  role: "user" | "admin";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserListParams = {
  page?: number;
  limit?: number;
  q?: string;
  role?: "user" | "admin";
  isActive?: boolean;
};

export type UserCreateInput = {
  name: string;
  username: string;
  email: string;
  role?: "user" | "admin";
};

export type UserUpdateInput = {
  name?: string;
  username?: string;
  email?: string;
};
