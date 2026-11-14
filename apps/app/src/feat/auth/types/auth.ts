export type AppUser = {
  id: string;
  pid: string;
  name: string;
  username: string;
  email: string | null;
  bio: string | null;
  avatarUrl: string | null;
  role: "user" | "admin";
  isActive: boolean;
};

export type AuthStatus = "loading" | "authenticated" | "anonymous";
