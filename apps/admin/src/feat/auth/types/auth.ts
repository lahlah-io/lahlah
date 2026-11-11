export type AdminUser = {
  id: string;
  pid: string;
  name: string;
  email: string | null;
  role: "user" | "admin";
  isActive: boolean;
};

export type AuthStatus = "loading" | "authenticated" | "anonymous";
