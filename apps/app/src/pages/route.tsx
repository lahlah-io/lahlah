import { createBrowserRouter } from "react-router";

import { AppLayout } from "./app-layout";
import { AccountPage } from "./account";
import { ChatPage } from "./chat";
import { HomePage } from "./home";
import { LiveTripDetailPage } from "./live-trip-detail";
import { ProfileDetailPage } from "./profile-detail";
import { ProfileEditPage } from "./profile-edit";
import { ProfilePage } from "./profile";
import { SearchPage } from "./search";
import { SettingsUpgradePage } from "./settings-upgrade";
import { SettingsPage } from "./settings";
import { TripDetailPage } from "./trip-detail";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AppLayout,
    children: [
      { index: true, Component: ChatPage },
      { path: "home", Component: HomePage },
      { path: "search", Component: SearchPage },
      { path: "profile", Component: ProfilePage },
      { path: "profile/edit", Component: ProfileEditPage },
      { path: "profile/:tripId", Component: ProfileDetailPage },
      { path: "trips/:tripId", Component: TripDetailPage },
      { path: "live/:tripId", Component: LiveTripDetailPage },
      { path: "accounts/:accountId", Component: AccountPage },
      { path: "settings", Component: SettingsPage },
      { path: "settings/upgrade", Component: SettingsUpgradePage },
    ],
  },
]);
