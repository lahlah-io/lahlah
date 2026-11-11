import { createBrowserRouter } from "react-router";
import { AuthRoot } from "@/feat/auth/components/auth-root";
import { RequireAdmin } from "@/feat/auth/components/require-admin";
import { AdminShell } from "@/feat/auth/components/admin-shell";
import { CategoriesPage } from "./categories";
import { DestinationsPage } from "./destinations";
import { HomePage } from "./home";
import { LoginPage } from "./login";

export const router = createBrowserRouter([
  {
    Component: AuthRoot,
    children: [
      { path: "/login", Component: LoginPage },
      {
        path: "/",
        Component: RequireAdmin,
        children: [
          {
            Component: AdminShell,
            children: [
              { index: true, Component: HomePage },
              { path: "destinations", Component: DestinationsPage },
              { path: "categories", Component: CategoriesPage },
            ],
          },
        ],
      },
    ],
  },
]);
