import { createBrowserRouter } from "react-router";
import { AuthRoot } from "@/feat/auth/components/auth-root";
import { HomePage } from "./home";
import { LoginPage } from "./login";

export const router = createBrowserRouter([
  {
    Component: AuthRoot,
    children: [
      { path: "/login", Component: LoginPage },
      { path: "/", Component: HomePage },
    ],
  },
]);
