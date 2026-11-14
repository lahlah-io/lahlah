export type AdminUser = {
  id: string;
  pid: string;
  name: string;
  username: string;
  email: string | null;
  role: "user" | "admin";
  isActive: boolean;
};

export type AuthStatus = "loading" | "authenticated" | "anonymous";
