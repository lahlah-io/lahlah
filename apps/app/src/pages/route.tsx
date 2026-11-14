import { Navigate, createBrowserRouter } from "react-router";

import { AuthRoot } from "@/feat/auth/components/auth-root";
import { RequireAuth } from "@/feat/auth/components/require-auth";
import { AccountPage } from "./account";
import { AppLayout } from "./app-layout";
import { ChatPage } from "./chat";
import { HomePage } from "./home";
import { LiveTripDetailPage } from "./live-trip-detail";
import { LoginPage } from "./login";
import { ProfileDetailPage } from "./profile-detail";
import { ProfileEditPage } from "./profile-edit";
import { ProfilePage } from "./profile";
import { SearchPage } from "./search";
import { SettingsUpgradePage } from "./settings-upgrade";
import { SettingsPage } from "./settings";
import { LegacyTripRedirect, TripDetailPage } from "./trip-detail";

export const router = createBrowserRouter([
  {
    Component: AuthRoot,
    children: [
      { path: "/login", Component: LoginPage },
      {
        Component: RequireAuth,
        children: [
          {
            path: "/",
            Component: AppLayout,
            children: [
              { index: true, element: <Navigate to="/chat" replace /> },
              { path: "chat", Component: ChatPage },
              { path: "chat/trip", Component: ChatPage },
              { path: "chat/:threadId", Component: ChatPage },
              { path: "chat/:threadId/trip", Component: ChatPage },
              { path: "home", Component: HomePage },
              { path: "search", Component: SearchPage },
              { path: "profile", Component: ProfilePage },
              { path: "profile/edit", Component: ProfileEditPage },
              { path: "profile/:tripId", Component: ProfileDetailPage },
              { path: "detail/:tripId", Component: TripDetailPage },
              { path: "trips/:tripId", Component: LegacyTripRedirect },
              { path: "live/:tripId", Component: LiveTripDetailPage },
              { path: "accounts/:accountId", Component: AccountPage },
              { path: "settings", Component: SettingsPage },
              { path: "settings/upgrade", Component: SettingsUpgradePage },
            ],
          },
        ],
      },
    ],
  },
]);
