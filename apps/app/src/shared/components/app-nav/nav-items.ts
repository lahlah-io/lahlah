import {
  MessagesSquare,
  Search,
  Settings,
  User,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  /** Route the item points at. */
  to: string;
  label: string;
  icon: LucideIcon;
  /** Match the path exactly so `/` does not stay active on every route. */
  end?: boolean;
}

/** Main destinations shown in the middle of the rail and in the mobile tab bar. */
export const PRIMARY_NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Chat", icon: MessagesSquare, end: true },
  { to: "/search", label: "Cari", icon: Search },
  { to: "/profile", label: "Profil", icon: User },
];

/** Pinned to the bottom of the rail and the end of the mobile tab bar. */
export const SETTINGS_NAV_ITEM: NavItem = {
  to: "/settings",
  label: "Pengaturan",
  icon: Settings,
};
