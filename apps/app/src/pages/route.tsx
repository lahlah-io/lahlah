import { createBrowserRouter } from "react-router";

import { AppLayout } from "./app-layout";
import { HomePage } from "./home";
import { ProfilePage } from "./profile";
import { SearchPage } from "./search";
import { SettingsPage } from "./settings";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AppLayout,
    children: [
      { index: true, Component: HomePage },
      { path: "search", Component: SearchPage },
      { path: "profile", Component: ProfilePage },
      { path: "settings", Component: SettingsPage },
    ],
  },
]);
