import { createBrowserRouter } from "react-router";
import { AuthRoot } from "@/feat/auth/components/auth-root";
import { RequireAuth } from "@/feat/auth/components/require-auth";
import { HomePage } from "./home";
import { LoginPage } from "./login";

export const router = createBrowserRouter([
  {
    Component: AuthRoot,
    children: [
      { path: "/login", Component: LoginPage },
      {
        Component: RequireAuth,
        children: [{ path: "/", Component: HomePage }],
      },
    ],
  },
]);
